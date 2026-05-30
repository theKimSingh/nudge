const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const { randomUUID } = require('crypto');
const { WebSocketServer } = require('ws');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { requireUser, requireUserFromToken } = require('./lib/supabase');
const { plan, runAgentTurn } = require('./lib/gemini');
const { buildSystemPrompt } = require('./lib/prompt');
const { expandRepeatDates, resolveConflict } = require('./lib/repeat');
const { executeTool } = require('./lib/executor');
const { inferRoutineDurations } = require('./lib/inference');
const { inferCategory } = require('./lib/categorize');

const VALID_RULES = ['none', 'daily', 'weekdays', 'weekly'];
const VALID_SCOPES = ['instance', 'series', 'this_and_future'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clampTime(t) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return 540;
  return Math.max(0, Math.min(1439, Math.round(t)));
}
function clampDuration(d) {
  if (typeof d !== 'number' || !Number.isFinite(d)) return 30;
  return Math.max(5, Math.round(d));
}
function isYYYYMMDD(s) {
  return typeof s === 'string' && DATE_RE.test(s);
}
function pickScope(s) {
  return VALID_SCOPES.includes(s) ? s : 'instance';
}
function pickRule(r) {
  return VALID_RULES.includes(r) ? r : 'none';
}

const app = express();
const PORT = 8000;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!process.env.GEMINI_API_KEY) {
  console.warn('[nudge-backend] GEMINI_API_KEY not set — agent loop will fail until it is configured in .env');
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[nudge-backend] SUPABASE_URL / SUPABASE_ANON_KEY (or EXPO_PUBLIC_* equivalents) not set — agent session will fail');
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Proxy endpoint for fetching ICS calendar feeds from the client without CORS.
app.get('/proxy-ics', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL parameter required' });
    if (!String(url).includes('calendar') || !String(url).includes('ics')) {
      return res.status(400).json({ error: 'Invalid calendar URL' });
    }
    const response = await fetch(url);
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Failed to fetch ICS: ${response.statusText}` });
    }
    const icsData = await response.text();
    res.set('Content-Type', 'text/plain');
    res.send(icsData);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

function addDays(yyyyMmDd, n) {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The audio-bearing REST endpoints (/plan-day-audio, /transcribe) were
// removed when voice input moved to on-device streaming ASR in the agent
// session WS. Nothing in the app calls them anymore.


// REST harness for the agent loop. Drives the same executor/journal path the
// WS layer (Agent C) will use, but synchronously returns the full transcript
// of tool calls + results for unit tests and dev-time iteration.
//
// Body: { transcript: string, seg_id?: string, date?: YYYY-MM-DD, history?: Content[] }
// Response: { history, ops:[{tool_call, tool_result}, ...] }
const MAX_AGENT_ITERATIONS = 8;

// Shared agent-loop executor. Used by /agent/turn (REST) and the WS handler.
// `emit(serverEvent)` is the sink — REST collects into an array, WS forwards
// to the socket and pushes onto a per-session replay buffer.
async function runAgentSegment({ session, transcript, history, systemPrompt, signal, emit }) {
  history.push({ role: 'user', parts: [{ text: transcript }] });
  let stoppedReason = null;
  let summary = null;
  // Real tool executions (excludes `done`, which is just a terminal signal).
  // Used by the caller to decide whether an abort should still drop the
  // transcript buffer — once a tool has run, the work is committed even if
  // the loop got cut short, so the same transcript must NOT re-run.
  let toolsExecuted = 0;
  const segStart = Date.now();
  console.log(`[agent] ▶ seg=${session.segId} transcript="${transcript.slice(0, 120)}" history=${history.length}msgs`);

  for (let iter = 0; iter < MAX_AGENT_ITERATIONS; iter++) {
    if (signal?.aborted) { stoppedReason = 'aborted'; break; }

    // Synthetic-undo injection (WS only). Runs as its own mini-iteration so
    // the model sees the functionResponse on the next turn and can react.
    if (session.pendingUndo) {
      const u = session.pendingUndo;
      session.pendingUndo = null;
      await invokeAndJournal({
        session,
        history,
        emit,
        call: { id: u.client_op_id, name: 'undo_last', args: { n: u.n } },
      });
      // Fall through; let the model react on the next iteration.
      continue;
    }

    emit({ type: 'agent_thinking', seg_id: session.segId });
    const iterStart = Date.now();

    let turn;
    try {
      turn = await runAgentTurn({ history, systemPrompt, signal });
    } catch (e) {
      if (signal?.aborted || e?.name === 'AbortError') {
        stoppedReason = 'aborted';
        break;
      }
      throw e;
    }

    const calls = turn.functionCalls ?? [];
    console.log(`[agent] iter ${iter + 1}/${MAX_AGENT_ITERATIONS} in ${Date.now() - iterStart}ms → ${calls.length} call(s) [${calls.map((c) => c.name).join(', ')}]`);
    if (turn.modelContent) history.push(turn.modelContent);
    else if (calls.length) {
      history.push({ role: 'model', parts: calls.map((c) => ({ functionCall: c })) });
    }

    // Bail out if abort fired while the model was generating — we don't want
    // to start executing tool calls from a turn the user already cancelled.
    if (signal?.aborted) { stoppedReason = 'aborted'; break; }

    if (!calls.length) { stoppedReason = 'no_calls'; break; }

    let sawDone = false;
    for (const call of calls) {
      if (signal?.aborted) { stoppedReason = 'aborted'; break; }
      const result = await invokeAndJournal({ session, history, emit, call });
      if (call.name === 'done') {
        sawDone = true;
        summary = String(call.args?.summary || '');
        break;
      }
      toolsExecuted += 1;
      void result;
    }
    if (sawDone) { stoppedReason = 'done'; break; }
    if (stoppedReason === 'aborted') break;
  }
  if (!stoppedReason) stoppedReason = 'max_iterations';

  // Guarantee the client always gets closure. A turn that ended without calling
  // done() and without running any tool (no_calls — the model replied with bare
  // text/a question instead of acting) leaves `summary` empty; with no summary
  // event the app's stale transcript never clears and "I'm listening…" never
  // returns. Emit a fallback so every segment resolves with visible feedback.
  if ((summary == null || summary.trim() === '') && toolsExecuted === 0) {
    summary = "Sorry, I couldn't process that — try saying it as a specific action.";
  }

  console.log(`[agent] ◼ seg=${session.segId} stopped=${stoppedReason} in ${Date.now() - segStart}ms tools=${toolsExecuted}${summary ? ` summary="${summary.slice(0, 100)}"` : ''}`);
  emit({ type: 'agent_done', seg_id: session.segId });
  if (summary != null) emit({ type: 'summary', text: summary });
  return { stoppedReason, summary, toolsExecuted };
}

async function invokeAndJournal({ session, history, emit, call }) {
  const callId = call.id || `${call.name}:${randomUUID()}`;
  const callForExec = { ...call, id: callId };
  const argsPreview = JSON.stringify(call.args || {}).slice(0, 240);
  console.log(`[tool] → ${call.name}(${argsPreview}) call_id=${callId}`);
  emit({ type: 'tool_call', call_id: callId, name: call.name, args: call.args || {} });
  const toolStart = Date.now();
  const result = await executeTool(session, callForExec);
  const resultPreview = JSON.stringify(result.payload || {}).slice(0, 240);
  console.log(`[tool] ${result.ok ? '✓' : '✗'} ${call.name} in ${Date.now() - toolStart}ms payload=${resultPreview}`);
  emit({
    type: 'tool_result',
    call_id: callId,
    ok: !!result.ok,
    payload: result.payload,
    journal_entry: result.journal_entry,
  });
  history.push({
    role: 'user',
    parts: [
      {
        functionResponse: {
          name: call.name,
          response: result.payload ?? {},
        },
      },
    ],
  });
  return result;
}

app.post('/agent/turn', async (req, res) => {
  try {
    const { user, supabase: supa } = await requireUser(req);
    const { transcript, seg_id, history: incomingHistory } = req.body || {};
    const date = req.body?.date || new Date().toISOString().slice(0, 10);

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'transcript (string) required' });
    }
    if (!isYYYYMMDD(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }

    const tz = req.headers['x-timezone'] || 'UTC';
    const segId = seg_id || `seg:${randomUUID()}`;
    const sessionId = `rest:${segId}`;

    const dateMinus3 = addDays(date, -3);
    const datePlus3 = addDays(date, 3);

    const [profileQ, tasksQ, constraintsQ, inferred] = await Promise.all([
      supa
        .from('profiles')
        .select('name, goal, breakfast_time_minutes, lunch_time_minutes, dinner_time_minutes, morning_start_minutes, afternoon_start_minutes, evening_start_minutes')
        .eq('id', user.id)
        .maybeSingle(),
      supa
        .from('tasks')
        .select('id, title, date, time_minutes, duration_minutes, repeat_rule, series_id, done')
        .eq('user_id', user.id)
        .gte('date', dateMinus3)
        .lte('date', datePlus3),
      supa.rpc('get_top_constraints', { p_limit: 50 }),
      inferRoutineDurations(supa, user.id),
    ]);

    const profile = profileQ.data || null;
    const nowMin = computeNowMinutes(tz);

    const systemPrompt = buildSystemPrompt({
      profile,
      target_date: date,
      tasks: tasksQ.data ?? [],
      constraints: constraintsQ.data ?? [],
      tz,
      inferred,
      now_minutes: nowMin,
    });

    const session = {
      supa,
      profile,
      userId: user.id,
      sessionId,
      segId,
      ws: null,
    };

    const history = Array.isArray(incomingHistory) ? incomingHistory.slice() : [];

    // REST emit sink: collect events; reconstruct the legacy {tool_call,
    // tool_result} pairs so the response shape is unchanged.
    const events = [];
    const emit = (e) => events.push(e);

    const { stoppedReason } = await runAgentSegment({
      session,
      transcript,
      history,
      systemPrompt,
      emit,
    });

    const callsById = new Map();
    const collected = [];
    for (const ev of events) {
      if (ev.type === 'tool_call') {
        callsById.set(ev.call_id, { name: ev.name, args: ev.args, id: ev.call_id });
      } else if (ev.type === 'tool_result') {
        const tc = callsById.get(ev.call_id) || { name: 'unknown', args: {}, id: ev.call_id };
        collected.push({
          tool_call: tc,
          tool_result: {
            ok: ev.ok,
            payload: ev.payload,
            journal_entry: ev.journal_entry,
          },
        });
      }
    }

    return res.json({ history, ops: collected, stopped_reason: stoppedReason });
  } catch (e) {
    const status = e.status || 500;
    console.error('/agent/turn error:', e);
    return res.status(status).json({ error: e.message || 'Server error' });
  }
});

function computeNowMinutes(tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'UTC',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const parts = fmt.formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// WebSocket: /agent/session
// ---------------------------------------------------------------------------
//
// Per-session in-memory state. Survives 30s past unexpected WS close so
// reconnect+resume can replay buffered tool_result events.
const sessions = new Map(); // session_id -> Session

const SESSION_GRACE_MS = 30 * 1000;
// Hard idle timeout: if a session receives no client message (audio or JSON)
// for this long, force-close it server-side. Catches clients that go away
// silently without sending cancel_session. Independent of SESSION_GRACE_MS,
// which applies AFTER a WS close while we wait for a reconnect.
const SESSION_IDLE_MS = 90 * 1000;
const DEBOUNCE_BOUNDARY_MS = 250;
const REPLAY_BUFFER_SIZE = 50;
// Grace at the start of an in-flight agent loop during which a new boundary
// will NOT abort the loop. Most agent turns finish in ~1-3s; aborting on
// every follow-up utterance (which often arrives because the user assumes
// nothing happened) wastes the first turn's work. After the grace window,
// real barge-in still works.
const LOOP_ABORT_GRACE_MS = 2_500;

function wsSend(ws, event) {
  if (!ws || ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(event));
  } catch (e) {
    // Surface but don't kill the loop on a transient send error.
    console.error('[ws] send failed:', e.message);
  }
}

function pushReplay(session, event) {
  // Only buffer events that are useful to replay after a reconnect — the
  // tool_result stream is what the client needs to reconcile journal state.
  if (event.type !== 'tool_result') return;
  session.replay.push(event);
  if (session.replay.length > REPLAY_BUFFER_SIZE) session.replay.shift();
}

function clearSessionTimers(session) {
  if (session.closeTimer) { clearTimeout(session.closeTimer); session.closeTimer = null; }
  if (session.idleTimer) { clearTimeout(session.idleTimer); session.idleTimer = null; }
}

function resetIdleTimer(session) {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => {
    session.idleTimer = null;
    console.log(`[ws] session ${session.sessionId} force-closed (idle ${SESSION_IDLE_MS}ms)`);
    try { session.ws?.close(1000, 'idle_timeout'); } catch {}
    teardownSession(session.sessionId, 'idle_timeout');
  }, SESSION_IDLE_MS);
}

function teardownSession(sessionId, reason) {
  const s = sessions.get(sessionId);
  if (!s) return;
  clearSessionTimers(s);
  try { s.abortCurrent?.(); } catch {}
  sessions.delete(sessionId);
  console.log(`[ws] session ${sessionId} torn down (${reason})`);
}

async function handleBoundary(session, source, providedText) {
  // Debounce: coalesce boundaries firing within 250ms of the previous one.
  const now = Date.now();
  if (now - session.lastUtteranceEndTs < DEBOUNCE_BOUNDARY_MS) {
    console.log(`[ws] handleBoundary(${source}) skipped — debounce window`);
    return;
  }
  session.lastUtteranceEndTs = now;

  const text = String(providedText || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    console.log(`[ws] handleBoundary(${source}) skipped — empty text`);
    return;
  }

  const segId = `seg:${randomUUID()}`;
  session.segId = segId;

  // If a loop is running, abort it ONLY if it's been running long enough that
  // the user clearly meant to barge in. Within the first ~2.5s the new
  // utterance is almost always a follow-up — let the first turn complete
  // (the model will see the appended transcript on the next loop). After the
  // grace window, real barge-in still works.
  if (session.loopRunning) {
    const loopAge = Date.now() - (session.loopStartedAt || 0);
    if (loopAge > LOOP_ABORT_GRACE_MS) {
      console.log('[ws] aborting in-flight loop', { sessionId: session.sessionId, segId: session.segId, loopAge });
      try { session.abortCurrent?.(); } catch {}
    } else {
      console.log(`[ws] new boundary during loop (age=${loopAge}ms) — letting it finish, queuing utterance for next segment`);
    }
  }

  console.log(`[stt] boundary=${source} seg=${segId} text="${text.slice(0, 200)}"`);

  session.transcripts.push(text);

  // Wait deterministically for the previous loop to drain. If it doesn't
  // resolve within 5s the in-flight loop is wedged — drop this boundary
  // entirely rather than risk concurrent loops mutating the same history.
  if (session.loopRunning && session.loopDonePromise) {
    try {
      await Promise.race([
        session.loopDonePromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('loop_drain_timeout')), 5000)),
      ]);
    } catch (e) {
      console.warn('[ws] dropping boundary, prior loop did not drain:', e.message);
      return;
    }
  }

  await runSessionLoop(session, source);
}

async function runSessionLoop(session, source) {
  if (session.loopRunning) return;
  session.loopRunning = true;
  session.loopStartedAt = Date.now();

  // Set the drain promise BEFORE the first await so any boundary that fires
  // immediately after `loopRunning = true` sees a promise to wait on.
  let resolveLoopDone;
  session.loopDonePromise = new Promise((r) => { resolveLoopDone = r; });

  const aborter = new AbortController();
  session.abortCurrent = () => {
    try { aborter.abort(); } catch {}
  };

  const cumulative = session.transcripts.join(' ').trim();

  // Rebuild the system prompt each segment so the model sees fresh DB state
  // (other tools may have mutated tasks since the session started).
  let systemPrompt;
  try {
    systemPrompt = await buildPromptForSession(session);
  } catch (e) {
    console.error('[ws] system prompt build failed:', e.message);
    wsSend(session.ws, { type: 'error', code: 'PROMPT_BUILD_FAILED', message: e.message });
    session.loopRunning = false;
    session.abortCurrent = () => {};
    resolveLoopDone();
    return;
  }

  const emit = (event) => {
    wsSend(session.ws, event);
    pushReplay(session, event);
  };

  try {
    const result = await runAgentSegment({
      session,
      transcript: cumulative,
      history: session.modelHistory,
      systemPrompt,
      signal: aborter.signal,
      emit,
    });
    // Decide whether to drop the raw transcript buffer for this segment.
    //  - Completed normally (done / no_calls / max_iterations) → drop.
    //  - Aborted but at least one tool executed → drop. The mutation is
    //    committed and modelHistory has the user+functionResponse; re-running
    //    the same transcript would duplicate the work (e.g. add Gym twice).
    //  - Aborted with NO tools executed → keep so the in-flight new utterance
    //    can append and re-run as one larger ask. Pop the dangling user
    //    message we pushed at the top of runAgentSegment so history doesn't
    //    end up with two consecutive user turns.
    const aborted = result?.stoppedReason === 'aborted';
    const toolsExecuted = result?.toolsExecuted ?? 0;
    if (!aborted || toolsExecuted > 0) {
      session.transcripts.length = 0;
    } else if (
      session.modelHistory.length > 0 &&
      session.modelHistory[session.modelHistory.length - 1].role === 'user' &&
      session.modelHistory[session.modelHistory.length - 1].parts?.[0]?.text != null
    ) {
      session.modelHistory.pop();
    }
  } catch (e) {
    if (!aborter.signal.aborted) {
      console.error('[ws] agent loop failed:', e);
      wsSend(session.ws, { type: 'error', code: 'AGENT_FAILED', message: e.message || 'agent error' });
    }
    // Recover cleanly so the session stays usable. Drop this segment's raw
    // transcript and pop the dangling user turn pushed at the top of
    // runAgentSegment (no model reply followed it) — otherwise the next
    // utterance leaves modelHistory with two consecutive user turns, which
    // corrupts the following request.
    session.transcripts.length = 0;
    const last = session.modelHistory[session.modelHistory.length - 1];
    if (last && last.role === 'user' && last.parts?.[0]?.text != null) {
      session.modelHistory.pop();
    }
  } finally {
    session.loopRunning = false;
    session.abortCurrent = () => {};
    resolveLoopDone();
  }

  void source;
}

async function buildPromptForSession(session) {
  // Plan for the day the user is viewing in the todo tab (session.date, sent by
  // the client). buildSystemPrompt still computes the real "today" from tz for
  // the Today field and relative-date math, so "tomorrow"/"tonight" and the
  // displayed current date stay correct even when the viewed day isn't today.
  // (Matches the REST /agent/turn path, which already uses the client date.)
  const target_date = session.date;
  const dateMinus3 = addDays(session.date, -3);
  const datePlus3 = addDays(session.date, 3);
  const [profileQ, tasksQ, constraintsQ, inferred] = await Promise.all([
    session.supa
      .from('profiles')
      .select('name, goal, breakfast_time_minutes, lunch_time_minutes, dinner_time_minutes, morning_start_minutes, afternoon_start_minutes, evening_start_minutes')
      .eq('id', session.userId)
      .maybeSingle(),
    session.supa
      .from('tasks')
      .select('id, title, date, time_minutes, duration_minutes, repeat_rule, series_id, done')
      .eq('user_id', session.userId)
      .gte('date', dateMinus3)
      .lte('date', datePlus3),
    session.supa.rpc('get_top_constraints', { p_limit: 50 }),
    inferRoutineDurations(session.supa, session.userId),
  ]);
  session.profile = profileQ.data || session.profile;
  const tasks = tasksQ.data ?? [];
  const constraints = constraintsQ.data ?? [];
  console.log(
    `[prompt] context: ${tasks.length} tasks (${target_date} ±3d), ${constraints.length} constraints, ${(inferred || []).length} routines`,
  );
  return buildSystemPrompt({
    profile: session.profile,
    target_date,
    tasks,
    constraints,
    tz: session.tz,
    inferred,
    now_minutes: computeNowMinutes(session.tz),
  });
}

function onWsConnect(ws, ctx) {
  const sessionId = `ws:${randomUUID()}`;
  const session = {
    sessionId,
    ws,
    userId: ctx.user.id,
    supa: ctx.supabase,
    profile: null,
    date: ctx.date,
    tz: ctx.tz,
    segId: null,

    transcripts: [],
    modelHistory: [],
    loopRunning: false,
    loopStartedAt: 0,
    abortCurrent: () => {},

    lastUtteranceEndTs: 0,
    pendingUndo: null,

    closeTimer: null,
    idleTimer: null,

    replay: [], // circular buffer of tool_result events
  };
  sessions.set(sessionId, session);
  console.log(`[ws] session ${sessionId} opened (user=${ctx.user.id} date=${ctx.date} tz=${ctx.tz})`);

  wsSend(ws, { type: 'session_ready', session_id: sessionId });
  resetIdleTimer(session);

  ws.on('message', (data, isBinary) => {
    resetIdleTimer(session);
    handleWsMessage(session, data, isBinary).catch((e) => {
      console.error('[ws] message handler failed:', e);
      wsSend(ws, { type: 'error', code: 'INTERNAL', message: e.message || 'internal error' });
    });
  });

  ws.on('close', (code, reasonBuf) => {
    const reason = reasonBuf?.toString?.() || '';
    console.log(`[ws] session ${sessionId} ws closed (code=${code} reason="${reason}")`);
    // Detach socket but keep the session alive briefly for reconnect.
    session.ws = null;
    if (session.closeTimer) clearTimeout(session.closeTimer);
    session.closeTimer = setTimeout(() => {
      teardownSession(sessionId, 'grace_expired');
    }, SESSION_GRACE_MS);
  });

  ws.on('error', (e) => {
    console.error(`[ws] session ${sessionId} ws error:`, e.message);
  });
}

async function handleWsMessage(session, data, isBinary) {
  if (isBinary) {
    // Legacy: this session protocol no longer accepts binary audio frames.
    // The client transcribes locally (Whisper via react-native-executorch)
    // and sends finalized text via the `utterance_text` command. Drop
    // anything binary that arrives — likely a stale older-build client.
    console.warn('[ws] dropping unexpected binary frame; client should send utterance_text');
    return;
  }

  let cmd;
  try {
    cmd = JSON.parse(data.toString('utf8'));
  } catch {
    wsSend(session.ws, { type: 'error', code: 'BAD_JSON', message: 'invalid JSON command' });
    return;
  }
  if (!cmd || typeof cmd !== 'object' || !cmd.type) {
    wsSend(session.ws, { type: 'error', code: 'BAD_CMD', message: 'missing type' });
    return;
  }
  console.log(`[ws] ← cmd ${cmd.type}`, cmd.type === 'resume' ? `(target=${cmd.session_id})` : '');

  switch (cmd.type) {
    case 'utterance_text': {
      const text = String(cmd.text || '').trim();
      if (!text) {
        wsSend(session.ws, {
          type: 'error',
          code: 'INVALID_TEXT',
          message: 'utterance_text requires non-empty text',
        });
        return;
      }
      if (text.length > 4096) {
        wsSend(session.ws, {
          type: 'error',
          code: 'INVALID_TEXT',
          message: 'utterance_text exceeds 4096 char limit',
        });
        return;
      }
      await handleBoundary(session, 'utterance_text', text);
      return;
    }

    case 'interrupt':
      try { session.abortCurrent?.(); } catch {}
      return;

    case 'client_undo': {
      const n = Math.max(1, Math.min(20, Number(cmd.n) || 1));
      const opId = String(cmd.client_op_id || `undo:${randomUUID()}`);
      if (session.loopRunning) {
        // Queue for the next iteration of the running loop.
        session.pendingUndo = { n, client_op_id: opId };
      } else {
        // Run synchronously as a one-shot — no model call needed; the executor
        // applies the undo and we emit tool_call/tool_result directly.
        if (!session.segId) session.segId = `seg:${randomUUID()}`;
        const emit = (event) => {
          wsSend(session.ws, event);
          pushReplay(session, event);
        };
        await invokeAndJournal({
          session: {
            supa: session.supa,
            profile: session.profile,
            userId: session.userId,
            sessionId: session.sessionId,
            segId: session.segId,
            ws: session.ws,
          },
          history: session.modelHistory,
          emit,
          call: { id: opId, name: 'undo_last', args: { n } },
        });
      }
      return;
    }

    case 'cancel_session':
      teardownSession(session.sessionId, 'cancel_session');
      try { session.ws?.close(1000, 'cancel_session'); } catch {}
      return;

    case 'resume': {
      const targetId = String(cmd.session_id || '');
      const lastSeen = cmd.last_seen_call_id || null;
      const target = sessions.get(targetId);
      if (!target || target.userId !== session.userId) {
        wsSend(session.ws, {
          type: 'error',
          code: 'RESUME_NOT_FOUND',
          message: 'session not found; treat as new',
        });
        return;
      }
      if (target.sessionId === session.sessionId) {
        // No-op — resume against ourselves (replay only).
      } else {
        // Transfer the live socket onto the target session and discard the
        // ephemeral session created by this upgrade.
        const ws = session.ws;
        session.ws = null;
        teardownSession(session.sessionId, 'resume_transfer');

        if (target.closeTimer) { clearTimeout(target.closeTimer); target.closeTimer = null; }
        target.ws = ws;
        target.supa = session.supa; // fresh per-request client carries the user JWT

        // Re-wire ws handlers to the target session.
        ws.removeAllListeners('message');
        ws.removeAllListeners('close');
        ws.removeAllListeners('error');
        ws.on('message', (data, isBinary) => {
          resetIdleTimer(target);
          handleWsMessage(target, data, isBinary).catch((e) => {
            console.error('[ws] message handler failed:', e);
            wsSend(ws, { type: 'error', code: 'INTERNAL', message: e.message || 'internal error' });
          });
        });
        ws.on('close', (code, reasonBuf) => {
          const reason = reasonBuf?.toString?.() || '';
          console.log(`[ws] session ${target.sessionId} ws closed (code=${code} reason="${reason}")`);
          target.ws = null;
          if (target.closeTimer) clearTimeout(target.closeTimer);
          target.closeTimer = setTimeout(() => {
            teardownSession(target.sessionId, 'grace_expired');
          }, SESSION_GRACE_MS);
        });
        ws.on('error', (e) => {
          console.error(`[ws] session ${target.sessionId} ws error:`, e.message);
        });
        wsSend(target.ws, { type: 'session_ready', session_id: target.sessionId });
        resetIdleTimer(target);
      }

      // Replay tool_result events since last_seen_call_id (or all if absent).
      const idx = lastSeen ? target.replay.findIndex((e) => e.call_id === lastSeen) : -1;
      const tail = idx >= 0 ? target.replay.slice(idx + 1) : target.replay.slice();
      for (const ev of tail) wsSend(target.ws, ev);
      return;
    }

    default:
      wsSend(session.ws, { type: 'error', code: 'UNKNOWN_CMD', message: `unknown type ${cmd.type}` });
  }
}

const wss = new WebSocketServer({ noServer: true });
const server = http.createServer(app);

server.on('upgrade', async (req, socket, head) => {
  let parsed;
  try {
    parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    console.warn('[ws] upgrade rejected (bad url)');
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  if (parsed.pathname !== '/agent/session') {
    console.warn(`[ws] upgrade rejected (bad path: ${parsed.pathname})`);
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  const token = parsed.searchParams.get('token');
  const date = parsed.searchParams.get('date');
  const tz = parsed.searchParams.get('tz') || 'UTC';
  const resumeId = parsed.searchParams.get('resume');

  if (!token || !date || !isYYYYMMDD(date)) {
    console.warn(`[ws] upgrade rejected (missing/invalid params: token=${!!token} date=${date})`);
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  let auth;
  try {
    auth = await requireUserFromToken(token);
  } catch (e) {
    console.warn(`[ws] upgrade rejected (auth failed: ${e.message})`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // Resume path: rebind an existing session if it's still in the grace window.
  if (resumeId && sessions.has(resumeId)) {
    const existing = sessions.get(resumeId);
    if (existing.userId !== auth.user.id) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (existing.closeTimer) { clearTimeout(existing.closeTimer); existing.closeTimer = null; }
      existing.ws = ws;
      existing.supa = auth.supabase;
      console.log(`[ws] session ${resumeId} resumed`);
      wsSend(ws, { type: 'session_ready', session_id: resumeId });
      // Replay buffered tool_results.
      for (const ev of existing.replay) wsSend(ws, ev);
      resetIdleTimer(existing);

      ws.on('message', (data, isBinary) => {
        resetIdleTimer(existing);
        handleWsMessage(existing, data, isBinary).catch((e) => {
          console.error('[ws] message handler failed:', e);
          wsSend(ws, { type: 'error', code: 'INTERNAL', message: e.message || 'internal error' });
        });
      });
      ws.on('close', (code, reasonBuf) => {
        const reason = reasonBuf?.toString?.() || '';
        console.log(`[ws] session ${resumeId} ws closed (code=${code} reason="${reason}")`);
        existing.ws = null;
        if (existing.closeTimer) clearTimeout(existing.closeTimer);
        existing.closeTimer = setTimeout(() => {
          teardownSession(resumeId, 'grace_expired');
        }, SESSION_GRACE_MS);
      });
      ws.on('error', (e) => {
        console.error(`[ws] session ${resumeId} ws error:`, e.message);
      });
    });
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    onWsConnect(ws, { user: auth.user, supabase: auth.supabase, date, tz });
  });
});

// Bind to 0.0.0.0 so the server is reachable from phones on the same LAN
// (Expo Go on a real device). localhost-only binding would only allow the dev
// Mac itself to connect.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
  console.log(`   - GET  /health           - Health check`);
  console.log(`   - GET  /proxy-ics?url=…  - ICS calendar proxy`);
  console.log(`   - POST /agent/turn       - Agent loop REST harness (auth required)`);
  console.log(`   - WS   /agent/session    - Agent streaming session (auth required)`);
});
