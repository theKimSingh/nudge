import { requestRecordingPermissionsAsync } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, type AppStateStatus, Linking } from 'react-native';
import {
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { supabase } from '@/src/backend/supabase';
import { useTasks } from '@/src/features/todo/context/tasks-context';
import { type Task } from '@/src/features/todo/types';
import { CATEGORY_IDS } from '@/src/features/todo/categorize';
import { getBackendUrl } from '@/src/lib/backend-url';
import { uuidv4 } from '@/src/lib/uuid';
import type { TaskCategory } from '@/src/types/database';

import { connectAgentWs, type ServerEvent } from '../lib/agent-ws';
import { createAudioChunker } from '../lib/audio-chunker';
import { createVad } from '../lib/vad';

export type AgentSessionPhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  // Local speech_end fired, audio flushed to server, awaiting STT + agent
  // kickoff. Bridges the visible gap between "user stopped talking" and the
  // first server-side `agent_thinking` event so the UI never shows the stale
  // "I'm listening…" hint while a request is in flight.
  | 'syncing'
  | 'thinking'
  | 'error';

export type AgentUndoChip = {
  call_id: string;
  label: string;
  tool_name: string;
  ts: number;
};

export type TaskToast =
  | {
      id: string;
      kind: 'added' | 'updated' | 'removed';
      title: string;
      time_minutes?: number;
      duration_minutes?: number;
      repeat_rule?: 'none' | 'daily' | 'weekdays' | 'weekly';
      bornAt: number;
      /** Override default TTL for this toast (ms). */
      ttlMs?: number;
    }
  | {
      id: string;
      kind: 'question';
      text: string;
      bornAt: number;
      /** Override default TTL for this toast (ms). */
      ttlMs?: number;
    };

export type UseAgentSessionResult = {
  phase: AgentSessionPhase;
  errorMessage: string | null;
  transcript: string;
  amplitude: SharedValue<number>;
  lastUndoChip: AgentUndoChip | null;
  idlePromptVisible: boolean;
  taskToasts: TaskToast[];
  /** Count of successful task mutations this session. Drives the listening
   *  hint (0 → "I'm listening…", ≥1 → "What's next?"). */
  actionsCompleted: number;
  start(date: string): Promise<void>;
  stop(): Promise<void>;
  clientUndo(n?: number): void;
};

const IDLE_SOFT_MS = 30_000;
const IDLE_HARD_MS = 60_000;
const TASK_TOAST_TTL_MS = 5_000;
// Question-kind toasts carry the agent's refusal / clarification text, which
// is usually longer than "Added X at 8am" — give it more reading time.
const QUESTION_TOAST_TTL_MS = 8_000;
// Short flash for "Unable to process request" so it clears quickly and the
// listening hint comes back on its own.
const FLASH_TOAST_TTL_MS = 1_800;
const TASK_TOAST_MAX = 4;
// Stop the session after this many consecutive utterances came back empty.
// Catches the "user opened mic but is in a noisy room / not actually speaking
// to it" case without forcing them to manually tap stop.
const EMPTY_TRANSCRIPT_STREAK_LIMIT = 2;
// Min characters for an STT result to count as "real speech". Sub-3 chars
// (e.g. "uh", "a", or fragments) are treated as empty for streak-counting.
const MIN_REAL_TRANSCRIPT_CHARS = 3;
// Grace period at the start of "thinking" during which client-side barge-in
// is suppressed. Most agent turns finish in ~1-3s; sending `interrupt` on a
// stray cough or the user mid-thought 300ms after asking kills the turn for
// no good reason. Real barge-in (user genuinely changes their mind on a long
// task) still works after this window expires.
const INTERRUPT_GRACE_MS = 2_500;

type AgentWsHandle = ReturnType<typeof connectAgentWs>;
type ChunkerHandle = ReturnType<typeof createAudioChunker>;
type VadHandle = ReturnType<typeof createVad>;

function toWsUrl(httpUrl: string): string {
  if (httpUrl.startsWith('https://')) return 'wss://' + httpUrl.slice('https://'.length);
  if (httpUrl.startsWith('http://')) return 'ws://' + httpUrl.slice('http://'.length);
  return httpUrl;
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : '/' + path;
  return b + p;
}

export function useAgentSession(): UseAgentSessionResult {
  const { applyServerInsert, applyServerUpdate, applyServerDelete } = useTasks();

  const [phase, setPhase] = useState<AgentSessionPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [lastUndoChip, setLastUndoChip] = useState<AgentUndoChip | null>(null);
  const [idlePromptVisible, setIdlePromptVisible] = useState(false);
  const [taskToasts, setTaskToasts] = useState<TaskToast[]>([]);
  const [actionsCompleted, setActionsCompleted] = useState(0);

  const amplitude = useSharedValue(0);

  const wsRef = useRef<AgentWsHandle | null>(null);
  const chunkerRef = useRef<ChunkerHandle | null>(null);
  const vadRef = useRef<VadHandle | null>(null);
  const phaseRef = useRef<AgentSessionPhase>('idle');
  const stoppingRef = useRef(false);
  const taskChangesRef = useRef(0);
  // Counts mutations within the current agent segment so we can decide
  // whether the agent's terminal `summary` is the only thing the user has
  // to learn from this turn (e.g. a refusal like "can't schedule, already
  // passed"). Resets on `agent_thinking` (start of segment).
  const mutationsThisSegmentRef = useRef(0);
  const idleSoftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleHardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Count consecutive utterances that came back empty / junk so we can stop
  // the session when the mic is just picking up background noise.
  const emptyTranscriptStreakRef = useRef(0);
  // Timestamp when the current "thinking" phase began. Used to gate
  // client-side barge-in (interrupt) so a stray cough or the user starting
  // to say "actually..." 200ms after asking a question doesn't kill the
  // agent before it can complete a short task.
  const thinkingStartedAtRef = useRef(0);
  // Mic gate. True while the agent is processing (syncing / thinking) — the
  // mic is still recording for VAD purposes (so EdgeGlow + barge-in keep
  // working after the grace expires) but `chunk` and `metering` events from
  // the chunker are dropped, so no audio reaches the server and no new
  // utterance_end fires. Prevents the user from queuing a second request
  // while the first is still landing tasks on the calendar.
  const audioGateClosedRef = useRef(false);
  // The speech_end handler intentionally flushes the chunker and sends the
  // resulting audio along with utterance_end. That flush happens to land
  // AFTER setPhase('syncing'), which closes the gate — so without this
  // bypass the flush's chunk would be dropped and the server would receive
  // a 0-byte utterance. Set to true right before the intentional flush,
  // consumed by the next chunk event regardless of gate state.
  const bypassGateForNextChunkRef = useRef(false);

  useEffect(() => {
    const wasClosed = audioGateClosedRef.current;
    phaseRef.current = phase;
    // Gate the mic whenever the backend is busy. The chunker keeps recording
    // (needed for VAD-based barge-in after the grace window), but its audio
    // events are dropped at the JS layer so nothing leaves the device.
    const nowClosed = phase === 'syncing' || phase === 'thinking';
    audioGateClosedRef.current = nowClosed;
    // Edge: gate just reopened (agent finished a turn). The chunker has been
    // recording the whole time it was gated, so its internal m4a buffer holds
    // however many seconds of audio captured during the freeze. Flush + discard
    // so that audio is never sent. flush() emits a chunk event which we drop
    // because the gate was momentarily reclosed for the duration of the flush.
    if (wasClosed && !nowClosed) {
      audioGateClosedRef.current = true;
      chunkerRef.current
        ?.flush()
        .catch(() => {})
        .finally(() => {
          audioGateClosedRef.current = false;
        });
    }
  }, [phase]);

  const clearIdleTimers = useCallback(() => {
    if (idleSoftTimerRef.current) {
      clearTimeout(idleSoftTimerRef.current);
      idleSoftTimerRef.current = null;
    }
    if (idleHardTimerRef.current) {
      clearTimeout(idleHardTimerRef.current);
      idleHardTimerRef.current = null;
    }
  }, []);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token;
    if (!t) throw new Error('no session');
    return t;
  }, []);

  const teardown = useCallback(async () => {
    clearIdleTimers();
    const chunker = chunkerRef.current;
    const ws = wsRef.current;
    chunkerRef.current = null;
    wsRef.current = null;
    vadRef.current = null;

    if (chunker) {
      try {
        await chunker.stop();
      } catch {
        // ignored
      }
    }
    if (ws) {
      try {
        ws.send({ type: 'cancel_session' });
      } catch {
        // ignored
      }
      try {
        ws.close();
      } catch {
        // ignored
      }
    }
    amplitude.value = withTiming(0, { duration: 200 });
  }, [amplitude, clearIdleTimers]);

  const stop = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    try {
      await teardown();
      taskChangesRef.current = 0;
      setPhase('idle');
      setTranscript('');
      setErrorMessage(null);
      setIdlePromptVisible(false);
      setTaskToasts([]);
      setActionsCompleted(0);
      emptyTranscriptStreakRef.current = 0;
    } finally {
      stoppingRef.current = false;
    }
  }, [teardown]);

  const resetIdleWatchdog = useCallback(() => {
    clearIdleTimers();
    setIdlePromptVisible(false);
    idleSoftTimerRef.current = setTimeout(() => {
      idleSoftTimerRef.current = null;
      setIdlePromptVisible(true);
    }, IDLE_SOFT_MS);
    idleHardTimerRef.current = setTimeout(() => {
      idleHardTimerRef.current = null;
      void stop();
    }, IDLE_HARD_MS);
  }, [clearIdleTimers, stop]);

  const pushTaskToast = useCallback((toast: TaskToast) => {
    setTaskToasts((cur) => {
      if (cur.some((t) => t.id === toast.id)) return cur;
      const next = [toast, ...cur];
      return next.length > TASK_TOAST_MAX ? next.slice(0, TASK_TOAST_MAX) : next;
    });
  }, []);

  const handleToolResult = useCallback(
    async (ev: Extract<ServerEvent, { type: 'tool_result' }>) => {
      if (!ev.ok) {
        // Surface tool failures so the user knows the agent tried something
        // and the system pushed back (e.g. validation rejections). Friendly
        // agent-authored refusals arrive via the `summary` event instead;
        // this is the technical-error fallback.
        const rawErr =
          ev.payload && typeof ev.payload === 'object'
            ? (ev.payload.error ?? ev.payload.reason)
            : undefined;
        const errText = typeof rawErr === 'string' ? rawErr.trim() : '';
        if (errText) {
          pushTaskToast({
            id: `${ev.call_id}:err`,
            kind: 'question',
            text: errText,
            bornAt: Date.now(),
          });
        }
        return;
      }
      const journal = ev.journal_entry;
      const toolName = journal?.tool_name;
      const payload = ev.payload ?? {};

      if (journal) {
        setLastUndoChip({
          call_id: ev.call_id,
          label: journal.label,
          tool_name: journal.tool_name,
          ts: Date.now(),
        });
        if (
          toolName === 'create_task' ||
          toolName === 'update_task' ||
          toolName === 'delete_task' ||
          toolName === 'update_meal_default'
        ) {
          taskChangesRef.current += 1;
          mutationsThisSegmentRef.current += 1;
        }
        // Instant feedback: as soon as a task mutation lands, clear the
        // user's transcribed words off-screen and flip the listening hint
        // to "What's next?" via the actionsCompleted counter. This stops
        // the user's prior sentence from lingering while they're ready
        // for the next one.
        if (
          toolName === 'create_task' ||
          toolName === 'update_task' ||
          toolName === 'delete_task'
        ) {
          setActionsCompleted((c) => c + 1);
          setTranscript('');
        }
      }

      if (toolName === 'create_task') {
        if (typeof payload.task_id === 'string') {
          const userId =
            (await supabase.auth.getUser().then((r) => r.data.user?.id).catch(() => null)) ?? '';
          const nowIso = new Date().toISOString();
          // placeholder; realtime subscription delivers canonical row
          const placeholder: Task = {
            id: payload.task_id,
            user_id: userId,
            title: typeof payload.title === 'string' ? payload.title : '',
            description: payload.description ?? null,
            date: typeof payload.date === 'string' ? payload.date : '',
            time_minutes:
              typeof payload.time_minutes === 'number' ? payload.time_minutes : 0,
            duration_minutes:
              typeof payload.duration_minutes === 'number' ? payload.duration_minutes : 30,
            done: false,
            repeat_rule:
              payload.repeat_rule === 'daily' ||
              payload.repeat_rule === 'weekdays' ||
              payload.repeat_rule === 'weekly'
                ? payload.repeat_rule
                : 'none',
            series_id: payload.series_id ?? null,
            color: payload.color ?? null,
            source: 'todo_list',
            category:
              typeof payload.category === 'string' &&
              (CATEGORY_IDS as readonly string[]).includes(payload.category)
                ? (payload.category as TaskCategory)
                : 'other',
            created_at: nowIso,
            updated_at: nowIso,
          };
          applyServerInsert([placeholder]);
          pushTaskToast({
            id: ev.call_id,
            kind: 'added',
            title: placeholder.title,
            time_minutes: placeholder.time_minutes,
            duration_minutes: placeholder.duration_minutes,
            repeat_rule: placeholder.repeat_rule,
            bornAt: Date.now(),
          });
        }
      } else if (toolName === 'update_task') {
        const taskId = typeof payload.task_id === 'string' ? payload.task_id : null;
        const fields = (payload.fields ?? {}) as Partial<Task>;
        if (taskId) {
          const patch: Partial<Task> = { ...fields };
          if (typeof payload.updated_at === 'string') {
            patch.updated_at = payload.updated_at;
          }
          applyServerUpdate(taskId, patch);
          const updatedTitle =
            typeof fields.title === 'string' && fields.title
              ? fields.title
              : journal?.label ?? 'task';
          pushTaskToast({
            id: ev.call_id,
            kind: 'updated',
            title: updatedTitle,
            time_minutes:
              typeof fields.time_minutes === 'number' ? fields.time_minutes : undefined,
            duration_minutes:
              typeof fields.duration_minutes === 'number'
                ? fields.duration_minutes
                : undefined,
            repeat_rule:
              fields.repeat_rule === 'daily' ||
              fields.repeat_rule === 'weekdays' ||
              fields.repeat_rule === 'weekly' ||
              fields.repeat_rule === 'none'
                ? fields.repeat_rule
                : undefined,
            bornAt: Date.now(),
          });
        }
      } else if (toolName === 'delete_task') {
        const taskId = typeof payload.task_id === 'string' ? payload.task_id : null;
        if (taskId) applyServerDelete([taskId]);
        const removedTitle =
          typeof payload.title === 'string' && payload.title
            ? payload.title
            : journal?.label ?? 'task';
        pushTaskToast({
          id: ev.call_id,
          kind: 'removed',
          title: removedTitle,
          bornAt: Date.now(),
        });
      } else if (toolName === 'undo_last') {
        const undone: { id: string; label: string; ok: boolean; reason?: string }[] =
          Array.isArray(payload.undone) ? payload.undone : [];
        const successful = undone.filter((u) => u.ok);
        const failed = undone.length - successful.length;
        let labelText: string | null = null;
        if (successful.length === 1 && failed === 0) {
          labelText = `Undid: ${successful[0].label}`;
        } else if (successful.length > 1 && failed === 0) {
          labelText = `Undid ${successful.length} changes`;
        } else if (successful.length === 0 && failed > 0) {
          labelText = `Couldn't undo — items were edited`;
        } else if (successful.length > 0 && failed > 0) {
          labelText = `Undid ${successful.length} of ${undone.length} (${failed} couldn't undo)`;
        }
        if (labelText) {
          setLastUndoChip({
            call_id: ev.call_id,
            label: labelText,
            tool_name: 'undo_last',
            ts: Date.now(),
          });
        }
      }
    },
    [applyServerInsert, applyServerUpdate, applyServerDelete, pushTaskToast],
  );

  const handleEvent = useCallback(
    (ev: ServerEvent) => {
      if (ev.type === 'session_ready') {
        setPhase('listening');
        resetIdleWatchdog();
        return;
      }
      if (ev.type === 'partial_transcript') {
        resetIdleWatchdog();
        if (ev.is_final) {
          const text = (ev.text ?? '').trim();
          const isReal = text.length >= MIN_REAL_TRANSCRIPT_CHARS;
          if (isReal) {
            // A new user utterance is about to drive a fresh agent loop —
            // this is the real segment boundary on the client side. Reset
            // here (NOT on `agent_thinking`, which fires per-iteration and
            // would zero the counter between create_task and done, causing
            // the terminal summary to be re-pushed as a duplicate chip).
            mutationsThisSegmentRef.current = 0;
            emptyTranscriptStreakRef.current = 0;
            setTranscript((cur) => (cur ? cur + ' ' + text : text));
          } else {
            emptyTranscriptStreakRef.current += 1;
            if (__DEV__) {
              console.warn(
                `[agent] empty transcript streak ${emptyTranscriptStreakRef.current}/${EMPTY_TRANSCRIPT_STREAK_LIMIT}`,
              );
            }
            // Flash a brief notice — the user spoke (or the mic heard
            // something) but STT returned nothing usable. Short TTL so the
            // listening hint comes back on its own.
            pushTaskToast({
              id: `flash:${Date.now()}`,
              kind: 'question',
              text: 'Unable to process request',
              bornAt: Date.now(),
              ttlMs: FLASH_TOAST_TTL_MS,
            });
            if (emptyTranscriptStreakRef.current >= EMPTY_TRANSCRIPT_STREAK_LIMIT) {
              if (__DEV__) console.warn('[agent] stopping — no clear speech detected');
              void stop();
            }
          }
        }
        return;
      }
      if (ev.type === 'agent_thinking') {
        // Fires per iteration of the agent loop — don't reset segment
        // counters here (see partial_transcript handler).
        setPhase('thinking');
        resetIdleWatchdog();
        // Stamp on the FIRST thinking event of the segment, not each
        // iteration. (Later iterations still report 'agent_thinking', but
        // we want the grace window measured from when the agent first
        // started working, not from each tool-call cycle.)
        if (thinkingStartedAtRef.current === 0) {
          thinkingStartedAtRef.current = Date.now();
        }
        // Transcript stays visible — feedback-band stacks it above the
        // status line so the user sees both "what I said" and "what the
        // agent is doing about it." Transcript is cleared on tool_result
        // for a mutation (in handleToolResult), not here.
        return;
      }
      if (ev.type === 'agent_done') {
        if (phaseRef.current === 'thinking') setPhase('listening');
        resetIdleWatchdog();
        thinkingStartedAtRef.current = 0;
        return;
      }
      if (ev.type === 'tool_call') {
        if (phaseRef.current !== 'thinking') setPhase('thinking');
        resetIdleWatchdog();
        return;
      }
      if (ev.type === 'tool_result') {
        void handleToolResult(ev);
        return;
      }
      if (ev.type === 'summary') {
        // The agent's terminal `done` summary. When the segment also produced
        // task mutations, those have their own chips and the summary would be
        // redundant. When nothing changed (e.g. a refusal: "I can't schedule
        // a run for this morning as it has already passed."), the summary is
        // the only signal the user has — surface it as a chip.
        const text = (ev.text ?? '').trim();
        if (text && mutationsThisSegmentRef.current === 0) {
          pushTaskToast({
            id: `summary:${Date.now()}`,
            kind: 'question',
            text,
            bornAt: Date.now(),
          });
        }
        return;
      }
      if (ev.type === 'error') {
        if (__DEV__) console.warn('[agent] server error:', ev.code, ev.message);
        void stop();
        return;
      }
    },
    [handleToolResult, pushTaskToast, resetIdleWatchdog, stop],
  );

  const start = useCallback(
    async (date: string) => {
      if (wsRef.current || chunkerRef.current) return;

      setErrorMessage(null);
      setTranscript('');
      setLastUndoChip(null);
      taskChangesRef.current = 0;
      mutationsThisSegmentRef.current = 0;
      emptyTranscriptStreakRef.current = 0;
      setActionsCompleted(0);
      setPhase('connecting');

      const perm = await requestRecordingPermissionsAsync().catch(() => null);
      if (!perm?.granted) {
        if (perm?.canAskAgain === false) {
          Alert.alert(
            'Microphone disabled',
            'Open Settings to enable the microphone for Nudge.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
        } else if (__DEV__) {
          console.warn('[agent] mic permission not granted');
        }
        setPhase('idle');
        return;
      }

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const wsUrl = joinUrl(toWsUrl(getBackendUrl()), '/agent/session');
      if (__DEV__) console.log('[agent] ws url:', wsUrl);

      const vad = createVad();
      vadRef.current = vad;

      const ws = connectAgentWs(
        { url: wsUrl, getToken, date, tz },
        {
          onEvent: handleEvent,
          onError: (err) => {
            if (__DEV__) console.warn('[agent] ws error:', err.message);
          },
          onClose: (info) => {
            if (__DEV__) console.warn('[agent] ws close:', info.code, info.reason);
            if (phaseRef.current !== 'idle') {
              void stop();
            }
          },
        },
      );
      wsRef.current = ws;

      // Audio flow: chunker records continuously into a single .m4a. On VAD
      // speech_end we call chunker.flush() which stops the recording, emits
      // its bytes as one 'chunk' event, and restarts a new recording. Then
      // we send utterance_end. This produces exactly one valid m4a per
      // utterance — Gemini transcribes it as a coherent whole instead of
      // independently transcribing 1-second slices (which split words
      // mid-syllable and trip the model into echoing the prompt back).
      const chunker = createAudioChunker({
        onEvent: (e) => {
          if (e.type === 'chunk') {
            // One-shot bypass: speech_end flushes the chunker AFTER it has
            // already triggered setPhase('syncing'), so the gate is closed
            // by the time this chunk arrives — but this is precisely the
            // audio we want to send. Honor the bypass and consume it.
            if (bypassGateForNextChunkRef.current) {
              bypassGateForNextChunkRef.current = false;
              ws.sendAudioChunk(e.bytes);
              return;
            }
            // Gate: any other chunk (continuous-record output during the
            // syncing/thinking window, or the gate-reopen drain flush) is
            // stale and dropped.
            if (audioGateClosedRef.current) return;
            ws.sendAudioChunk(e.bytes);
          } else if (e.type === 'metering') {
            // Gate: while the agent is processing, skip the entire VAD +
            // amplitude pipeline. EdgeGlow stays quiet (it'll be replaced
            // by the "Thinking…" status anyway), no speech_end fires, no
            // utterance_end is sent. The user's voice is ignored until
            // status flips back to listening.
            if (audioGateClosedRef.current) return;
            const norm = Math.min(1, Math.max(0, (e.db + 60) / 60));
            amplitude.value = withTiming(norm, { duration: 80 });
            if (__DEV__ && Math.random() < 0.1) {
              console.log('[agent] db:', e.db.toFixed(1));
            }
            const vadEvent = vad.push(e.db, e.ts);
            if (__DEV__ && vadEvent) {
              console.log('[agent] vad:', vadEvent.type, 'db:', e.db.toFixed(1));
            }
            if (vadEvent?.type === 'speech_end') {
              // Mark the imminent flush chunk as exempt from the gate.
              // setPhase('syncing') below will close the gate before
              // chunker.flush() finishes — without this bypass the flush's
              // audio chunk gets dropped and the server sees a 0-byte
              // utterance.
              bypassGateForNextChunkRef.current = true;
              // Switch to 'syncing' the moment we stop hearing speech, before
              // any network round-trip. The UI replaces "I'm listening…" with
              // "Processing…" instantly — no dead window where the status
              // text lies about what's happening on the backend.
              if (phaseRef.current === 'listening') setPhase('syncing');
              // Flush so the audio chunk hits the wire before the
              // utterance_end cmd (WS outbox is FIFO; the bypass flag above
              // ensures the chunk goes through even though the gate is now
              // closed).
              const flushed = chunker.flush();
              void flushed
                .catch(() => {})
                .finally(() => {
                  ws.send({ type: 'utterance_end', client_seg_id: uuidv4() });
                });
            } else if (vadEvent?.type === 'speech_start') {
              resetIdleWatchdog();
              if (phaseRef.current === 'thinking') {
                const thinkingFor =
                  thinkingStartedAtRef.current === 0
                    ? 0
                    : Date.now() - thinkingStartedAtRef.current;
                if (thinkingFor > INTERRUPT_GRACE_MS) {
                  ws.send({ type: 'interrupt' });
                }
                // Otherwise: agent just started, let it finish. The new
                // utterance is still being captured locally; when VAD
                // reports speech_end we'll flush + send utterance_end and
                // the server will run it as the next segment (after the
                // current one completes).
              }
            }
          } else if (e.type === 'error') {
            if (__DEV__) console.warn('[agent] chunker error:', e.error.message);
            void stop();
          }
        },
      });
      chunkerRef.current = chunker;

      try {
        await chunker.start();
      } catch (e: any) {
        if (__DEV__) console.warn('[agent] chunker failed to start:', e?.message);
        await stop();
      }
    },
    [amplitude, getToken, handleEvent, resetIdleWatchdog, stop],
  );

  const clientUndo = useCallback((n: number = 1) => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.send({ type: 'client_undo', n, client_op_id: uuidv4() });
  }, []);

  useEffect(() => {
    // 2s debounce on background → stop. Control center swipes, brief
    // notification interactions, and tap-to-multitask all flip AppState to
    // background and back within ~1s. We don't want to kill an in-progress
    // voice session for those.
    let backgroundTimer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        if (wsRef.current || chunkerRef.current) {
          if (backgroundTimer) clearTimeout(backgroundTimer);
          backgroundTimer = setTimeout(() => {
            backgroundTimer = null;
            if (wsRef.current || chunkerRef.current) void stop();
          }, 2_000);
        }
      } else if (next === 'active') {
        if (backgroundTimer) {
          clearTimeout(backgroundTimer);
          backgroundTimer = null;
        }
      }
    });
    return () => {
      sub.remove();
      if (backgroundTimer) clearTimeout(backgroundTimer);
    };
  }, [stop]);

  useEffect(() => {
    return () => {
      void teardown();
    };
  }, [teardown]);

  // Expire task toasts after their TTL. Question-kind toasts carry agent
  // text that needs more reading time than a "Added X at 8am" chip.
  useEffect(() => {
    if (taskToasts.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setTaskToasts((cur) => {
        const next = cur.filter((t) => {
          const defaultTtl =
            t.kind === 'question' ? QUESTION_TOAST_TTL_MS : TASK_TOAST_TTL_MS;
          const ttl = t.ttlMs ?? defaultTtl;
          return now - t.bornAt < ttl;
        });
        return next.length === cur.length ? cur : next;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [taskToasts.length]);

  return {
    phase,
    errorMessage,
    transcript,
    amplitude,
    lastUndoChip,
    idlePromptVisible,
    taskToasts,
    actionsCompleted,
    start,
    stop,
    clientUndo,
  };
}
