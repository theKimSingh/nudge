import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  type AppStateStatus,
  Linking,
  PermissionsAndroid,
  Platform,
} from 'react-native';
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
import { useActiveAsrStream } from '../lib/asr-engine';
import { createPcmStream } from '../lib/pcm-stream';
import { createVad } from '../lib/vad';
import { cleanTranscript } from '../lib/whisper-asr';

export type AgentSessionPhase =
  | 'idle'
  // ASR model is downloading / warming on first launch. Mic is locked until
  // isReady flips true.
  | 'loading'
  | 'connecting'
  | 'listening'
  // Kept in the enum for slow-WS recovery scenarios, but the happy path goes
  // listening → thinking directly. With local ASR the only work after
  // speech_end is a sub-100ms WS send, so entering syncing here would just
  // flash "Processing…" for a single frame.
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
      ttlMs?: number;
    }
  | {
      id: string;
      kind: 'question';
      text: string;
      bornAt: number;
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
  actionsCompleted: number;
  /** 0-1, ASR model acquisition progress on cold start. */
  downloadProgress: number;
  /** True once the on-device ASR model is warm and ready to record. */
  asrReady: boolean;
  start(date: string): Promise<void>;
  stop(reason?: string): Promise<void>;
  clientUndo(n?: number): void;
};

const IDLE_SOFT_MS = 30_000;
const IDLE_HARD_MS = 60_000;
const TASK_TOAST_TTL_MS = 5_000;
const QUESTION_TOAST_TTL_MS = 8_000;
const FLASH_TOAST_TTL_MS = 1_800;
const TASK_TOAST_MAX = 4;
// Whisper Tiny can return empty on borderline-quality short utterances; give
// the user a few tries before assuming the mic is wasted.
const EMPTY_TRANSCRIPT_STREAK_LIMIT = 4;
const MIN_REAL_TRANSCRIPT_CHARS = 3;
const INTERRUPT_GRACE_MS = 2_500;

type AgentWsHandle = ReturnType<typeof connectAgentWs>;
type PcmStreamHandle = ReturnType<typeof createPcmStream>;
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

async function requestMicPermission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  if (Platform.OS === 'android') {
    const status = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    return {
      granted: status === PermissionsAndroid.RESULTS.GRANTED,
      canAskAgain: status !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    };
  }
  // iOS: AVAudioSession surfaces its own prompt the first time LiveAudioStream
  // .start() is called. If denied, mic capture silently produces zeros — the
  // empty-transcript streak guard catches that downstream.
  return { granted: true, canAskAgain: true };
}

export function useAgentSession(): UseAgentSessionResult {
  const { applyServerInsert, applyServerUpdate, applyServerDelete } = useTasks();

  // On-device ASR hook (engine chosen by ASR_ENGINE in asr-engine.ts). Mounts
  // once for the lifetime of the session provider and exposes a generator API
  // for streaming partials. Moonshine downloads its model on first cold start
  // (~239MB, cached after); Whisper Base is bundled. Either way isReady flips
  // true once the model is warm and downloadProgress tracks acquisition.
  //
  // IMPORTANT: the hook returns a FRESH object every render (no memoization).
  // Reading `asr` directly inside useCallback / useEffect dependency arrays
  // would make those callbacks unstable, causing cleanup effects to re-fire on
  // every render — which manifests as the session opening + immediately sending
  // cancel_session in a loop. We mirror through asrRef so dependent callbacks
  // stay stable.
  const asr = useActiveAsrStream();
  const asrRef = useRef(asr);
  asrRef.current = asr;

  const [phase, setPhase] = useState<AgentSessionPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [lastUndoChip, setLastUndoChip] = useState<AgentUndoChip | null>(null);
  const [idlePromptVisible, setIdlePromptVisible] = useState(false);
  const [taskToasts, setTaskToasts] = useState<TaskToast[]>([]);
  const [actionsCompleted, setActionsCompleted] = useState(0);

  const amplitude = useSharedValue(0);

  const wsRef = useRef<AgentWsHandle | null>(null);
  const pcmStreamRef = useRef<PcmStreamHandle | null>(null);
  const vadRef = useRef<VadHandle | null>(null);
  const phaseRef = useRef<AgentSessionPhase>('idle');
  const stoppingRef = useRef(false);
  const taskChangesRef = useRef(0);
  const mutationsThisSegmentRef = useRef(0);
  const idleSoftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleHardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emptyTranscriptStreakRef = useRef(0);
  const thinkingStartedAtRef = useRef(0);
  // Closes while the agent is mid-turn so we don't feed PCM into Whisper or
  // update the VAD / amplitude. Mic capture itself keeps running — gating is
  // purely a JS-layer drop.
  const audioGateClosedRef = useRef(false);
  // We do BOTH streaming and buffering in parallel:
  // Streaming-only ASR. The executorch model runs one op at a time, so we
  // can't mix stream() + batch transcribe() on the same instance. The live
  // generator is the single source of truth.
  //
  // Monotonic transcript: the longest live text we've shown this utterance.
  // Whisper's streaming yields can shrink committed text mid-segment which
  // makes the live display jumpy; keeping the high-water mark stops the
  // backwards motion the user sees as "getting cut off".
  const liveTranscriptHighWaterRef = useRef('');
  const streamIterationPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const wasClosed = audioGateClosedRef.current;
    phaseRef.current = phase;
    const nowClosed = phase === 'syncing' || phase === 'thinking';
    audioGateClosedRef.current = nowClosed;
    // Reset VAD when transitioning across the gate. Without this, VAD state
    // (e.g. mid-`candidate_silent`) carries over and fires a stale speech_end
    // on the first chunk after the gate reopens.
    if (wasClosed !== nowClosed) {
      vadRef.current?.reset();
    }
  }, [phase]);

  // Reflect the on-device model's readiness in the phase machine. While the
  // model is downloading on first launch we surface "Loading speech model…"
  // so the user knows why the mic is unresponsive.
  useEffect(() => {
    if (!asr.isReady && phaseRef.current === 'idle') {
      setPhase('loading');
    } else if (asr.isReady && phaseRef.current === 'loading') {
      setPhase('idle');
    }
  }, [asr.isReady]);

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
    const pcm = pcmStreamRef.current;
    const ws = wsRef.current;
    pcmStreamRef.current = null;
    wsRef.current = null;
    vadRef.current = null;
    liveTranscriptHighWaterRef.current = '';

    if (pcm) {
      try {
        await pcm.stop();
      } catch {
        // ignored
      }
    }

    // Terminate the ASR streaming generator and drain it. The Moonshine adapter's
    // stream() loops until streamStop() is called; without this, turning the mic
    // off mid-listening (no speech_end) leaves the generator running with an
    // unresolved promise — the next start() then hangs awaiting it and the old
    // transcript bleeds into the new session.
    try {
      asrRef.current?.streamStop();
    } catch {
      // ignored
    }
    if (streamIterationPromiseRef.current) {
      await streamIterationPromiseRef.current.catch(() => {});
      streamIterationPromiseRef.current = null;
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

  const stop = useCallback(async (reason: string = 'unspecified') => {
    if (__DEV__) console.log(`[agent] stop reason=${reason}`);
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    try {
      await teardown();
      taskChangesRef.current = 0;
      setPhase(asrRef.current?.isReady ? 'idle' : 'loading');
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
      void stop('idle_hard_timeout');
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
      if (ev.type === 'agent_thinking') {
        setPhase('thinking');
        resetIdleWatchdog();
        if (thinkingStartedAtRef.current === 0) {
          thinkingStartedAtRef.current = Date.now();
        }
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
        const text = (ev.text ?? '').trim();
        if (text && mutationsThisSegmentRef.current === 0) {
          // No mutation happened — agent is asking a question or refusing.
          // Clear the user's stale transcript so it doesn't sit alongside
          // the agent's reply ("Move." next to "What would you like to move?").
          setTranscript('');
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
        void stop(`server_error:${ev.code}`);
        return;
      }
    },
    [handleToolResult, pushTaskToast, resetIdleWatchdog, stop],
  );

  // Live streaming iteration: drives `setTranscript` so the user sees text
  // grow as they speak. Re-opened between utterances.
  const startStreamIteration = useCallback(async () => {
    if (streamIterationPromiseRef.current) {
      await streamIterationPromiseRef.current.catch(() => {});
    }
    liveTranscriptHighWaterRef.current = '';
    const w = asrRef.current;
    if (!w) return;
    let gen;
    try {
      gen = w.stream();
    } catch (e: any) {
      if (__DEV__) console.warn('[agent] stream() open failed:', e?.message);
      return;
    }
    streamIterationPromiseRef.current = (async () => {
      try {
        for await (const yielded of gen) {
          if (!yielded) continue;
          const committed = yielded.committed?.text ?? '';
          const nonCommitted = yielded.nonCommitted?.text ?? '';
          const live = `${committed} ${nonCommitted}`.replace(/\s+/g, ' ').trim();
          if (__DEV__) {
            console.log(
              `[agent] stream yield committed="${committed.slice(0, 60)}" non="${nonCommitted.slice(0, 60)}"`,
            );
          }
          // Monotonic: only update if new text is longer than what we've
          // already shown. Whisper's `committed` shrinks mid-segment as the
          // streaming algorithm advances its window; without this guard the
          // visible transcript jumps backwards and looks "cut off".
          if (live.length > liveTranscriptHighWaterRef.current.length) {
            liveTranscriptHighWaterRef.current = live;
            setTranscript(live);
          }
        }
      } catch {
        // ignored — stream was stopped externally
      } finally {
        streamIterationPromiseRef.current = null;
      }
    })();
  }, []);

  const start = useCallback(
    async (date: string) => {
      if (__DEV__) console.log('[agent] start() called date=', date);
      if (wsRef.current || pcmStreamRef.current) {
        if (__DEV__) console.warn('[agent] start() ignored — already running');
        return;
      }

      const w = asrRef.current;
      if (!w?.isReady) {
        setPhase('loading');
        if (__DEV__) {
          console.warn(
            `[agent] asr not ready, downloadProgress=${w?.downloadProgress ?? 0}`,
          );
        }
        return;
      }
      if (__DEV__) console.log('[agent] asr ready, proceeding');

      setErrorMessage(null);
      setTranscript('');
      setLastUndoChip(null);
      taskChangesRef.current = 0;
      mutationsThisSegmentRef.current = 0;
      emptyTranscriptStreakRef.current = 0;
      setActionsCompleted(0);
      setPhase('connecting');

      const perm = await requestMicPermission();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
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
            if (phaseRef.current !== 'idle' && phaseRef.current !== 'loading') {
              void stop(`ws_close:${info.code}:${info.reason}`);
            }
          },
        },
      );
      wsRef.current = ws;

      liveTranscriptHighWaterRef.current = '';

      // Open the streaming generator so we can show live partials as the
      // user speaks.
      void startStreamIteration();

      // Audio flow: PCM chunks arrive at ~125ms cadence. Each chunk is fed to
      // Whisper's streaming generator (live UI) and to the VAD (endpoint
      // detection). On speech_end we streamStop and use the streamed text.
      const pcm = createPcmStream({
        onEvent: (e) => {
          if (e.type === 'chunk') {
            if (audioGateClosedRef.current) return;

            // Drive amplitude visualization. dB clamped to [-90, 0]; the
            // same `(db + 60) / 60` normalization the old chunker used.
            const norm = Math.min(1, Math.max(0, (e.rmsDb + 60) / 60));
            amplitude.value = withTiming(norm, { duration: 80 });
            if (__DEV__ && Math.random() < 0.05) {
              console.log('[agent] chunk db=', e.rmsDb.toFixed(1), 'samples=', e.samples.length);
            }

            // Feed Whisper's streaming generator for live partials.
            try {
              asrRef.current?.streamInsert(e.samples);
            } catch (err: any) {
              if (__DEV__) console.warn('[agent] streamInsert failed:', err?.message);
            }

            // Push through VAD for endpoint detection.
            const vadEvent = vad.push(e.rmsDb, e.ts);
            if (__DEV__ && vadEvent) {
              console.log('[agent] vad:', vadEvent.type, 'db:', e.rmsDb.toFixed(1));
            }

            if (vadEvent?.type === 'speech_start') {
              resetIdleWatchdog();
              if (phaseRef.current === 'thinking') {
                const thinkingFor =
                  thinkingStartedAtRef.current === 0
                    ? 0
                    : Date.now() - thinkingStartedAtRef.current;
                if (thinkingFor > INTERRUPT_GRACE_MS) {
                  ws.send({ type: 'interrupt' });
                }
              }
            } else if (vadEvent?.type === 'speech_end') {
              // Streaming-only: the executorch model runs ONE operation at a
              // time, so we can't batch-transcribe() while stream() is active
              // (it throws "model is currently generating"). Use the streamed
              // high-water text as the final. streamStop finalizes the
              // generator; the iteration's last yields land the complete text.
              const streamedSnapshot = liveTranscriptHighWaterRef.current;
              try {
                asrRef.current?.streamStop();
              } catch {
                // ignored
              }
              if (phaseRef.current === 'listening') setPhase('syncing');
              void (async () => {
                // Wait for the stream generator to fully drain so the final
                // yields are captured in the high-water mark.
                if (streamIterationPromiseRef.current) {
                  await streamIterationPromiseRef.current.catch(() => {});
                }
                const cleaned = cleanTranscript(
                  liveTranscriptHighWaterRef.current.length >= streamedSnapshot.length
                    ? liveTranscriptHighWaterRef.current
                    : streamedSnapshot,
                );

                const isReal = cleaned.length >= MIN_REAL_TRANSCRIPT_CHARS;
                if (!isReal) {
                  emptyTranscriptStreakRef.current += 1;
                  if (__DEV__) {
                    console.warn(
                      `[agent] empty transcript streak ${emptyTranscriptStreakRef.current}/${EMPTY_TRANSCRIPT_STREAK_LIMIT}`,
                    );
                  }
                  if (phaseRef.current === 'syncing') setPhase('listening');
                  pushTaskToast({
                    id: `flash:${Date.now()}`,
                    kind: 'question',
                    text: 'Unable to process request',
                    bornAt: Date.now(),
                    ttlMs: FLASH_TOAST_TTL_MS,
                  });
                  if (
                    emptyTranscriptStreakRef.current >= EMPTY_TRANSCRIPT_STREAK_LIMIT
                  ) {
                    if (__DEV__) console.warn('[agent] stopping — no clear speech detected');
                    void stop('empty_transcript_streak');
                    return;
                  }
                  void startStreamIteration();
                  return;
                }
                // Real utterance — ship it.
                emptyTranscriptStreakRef.current = 0;
                mutationsThisSegmentRef.current = 0;
                setPhase('thinking');
                setTranscript(cleaned);
                ws.send({
                  type: 'utterance_text',
                  client_seg_id: uuidv4(),
                  text: cleaned,
                });
                void startStreamIteration();
              })();
            }
          } else if (e.type === 'error') {
            if (__DEV__) console.warn('[agent] pcm error:', e.error.message);
            void stop(`pcm_error:${e.error.message}`);
          }
        },
      });
      pcmStreamRef.current = pcm;

      try {
        await pcm.start();
      } catch (e: any) {
        if (__DEV__) console.warn('[agent] pcm failed to start:', e?.message);
        await stop(`pcm_start_failed:${e?.message}`);
      }
    },
    [
      amplitude,
      getToken,
      handleEvent,
      pushTaskToast,
      resetIdleWatchdog,
      startStreamIteration,
      stop,
    ],
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
        if (wsRef.current || pcmStreamRef.current) {
          if (backgroundTimer) clearTimeout(backgroundTimer);
          backgroundTimer = setTimeout(() => {
            backgroundTimer = null;
            if (wsRef.current || pcmStreamRef.current) void stop('appstate_background');
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
    downloadProgress: asr.downloadProgress,
    asrReady: asr.isReady,
    start,
    stop,
    clientUndo,
  };
}
