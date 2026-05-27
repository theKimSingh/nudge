export type ServerEvent =
  | { type: 'agent_thinking'; seg_id: string }
  | { type: 'agent_done'; seg_id: string }
  | { type: 'tool_call'; call_id: string; name: string; args: Record<string, unknown> }
  | {
      type: 'tool_result';
      call_id: string;
      ok: boolean;
      payload?: any;
      journal_entry?: { id: string; label: string; tool_name: string; inverse?: any };
    }
  | { type: 'summary'; text: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'session_ready'; session_id: string };

export type ClientCommand =
  | { type: 'utterance_text'; client_seg_id: string; text: string }
  | { type: 'interrupt'; reason?: string }
  | { type: 'client_undo'; n: number; client_op_id: string }
  | { type: 'cancel_session' }
  | { type: 'resume'; session_id: string; last_seen_call_id?: string };

export type AgentWsHandlers = {
  onEvent: (e: ServerEvent) => void;
  onOpen?: () => void;
  onClose?: (info: { code: number; reason: string }) => void;
  onError?: (err: Error) => void;
};

export type AgentWsOptions = {
  url: string;
  getToken: () => Promise<string>;
  date: string;
  tz: string;
};

const RECONNECT_DELAYS_MS = [1500, 3000, 6000];
const MAX_RECONNECT_ATTEMPTS = RECONNECT_DELAYS_MS.length;
const OUTBOX_MAX_MESSAGES = 50;

type OutboxEntry = { kind: 'json'; data: string };

export function connectAgentWs(opts: AgentWsOptions, handlers: AgentWsHandlers) {
  let ws: WebSocket | null = null;
  let sessionId: string | null = null;
  let lastSeenCallId: string | null = null;
  let reconnectAttempts = 0;
  let closedByCaller = false;
  let fatalFailure = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const outbox: OutboxEntry[] = [];

  function buildUrl(token: string): string {
    const sep = opts.url.includes('?') ? '&' : '?';
    const qs = `token=${encodeURIComponent(token)}&date=${encodeURIComponent(opts.date)}&tz=${encodeURIComponent(opts.tz)}`;
    return `${opts.url}${sep}${qs}`;
  }

  function enqueueJson(data: string) {
    if (outbox.length >= OUTBOX_MAX_MESSAGES) {
      const dropped = outbox.shift();
      if (__DEV__) {
        console.warn('[agent-ws] outbox full, dropping oldest message', dropped?.kind);
      }
    }
    outbox.push({ kind: 'json', data });
  }

  function flushOutbox() {
    if (!ws || ws.readyState !== 1) return;
    while (outbox.length) {
      const entry = outbox.shift()!;
      try {
        ws.send(entry.data);
      } catch (e) {
        outbox.unshift(entry);
        handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
        return;
      }
    }
  }

  async function open() {
    let token: string;
    try {
      token = await opts.getToken();
    } catch (e) {
      fatalFailure = true;
      const err = e instanceof Error ? e : new Error(String(e));
      handlers.onError?.(err);
      handlers.onClose?.({ code: 4001, reason: 'token_unavailable' });
      return;
    }

    if (closedByCaller) return;

    const socket = new WebSocket(buildUrl(token));
    ws = socket;

    socket.onopen = () => {
      if (sessionId) {
        const cmd: ClientCommand = lastSeenCallId
          ? { type: 'resume', session_id: sessionId, last_seen_call_id: lastSeenCallId }
          : { type: 'resume', session_id: sessionId };
        try {
          socket.send(JSON.stringify(cmd));
        } catch {
          // ignored: socket may have closed between onopen and send
        }
      }
      reconnectAttempts = 0;
      flushOutbox();
      handlers.onOpen?.();
    };

    socket.onmessage = (ev: WebSocketMessageEvent) => {
      if (typeof ev.data !== 'string') return;
      let parsed: ServerEvent;
      try {
        parsed = JSON.parse(ev.data) as ServerEvent;
      } catch (e) {
        handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      if (parsed.type === 'session_ready') {
        sessionId = parsed.session_id;
      } else if (parsed.type === 'tool_result' && parsed.call_id) {
        lastSeenCallId = parsed.call_id;
      }
      handlers.onEvent(parsed);
    };

    socket.onerror = () => {
      handlers.onError?.(new Error('WebSocket error'));
    };

    socket.onclose = (ev: WebSocketCloseEvent) => {
      ws = null;
      const info = { code: ev.code ?? 1006, reason: ev.reason ?? '' };
      if (closedByCaller || info.code === 1000 || fatalFailure) {
        handlers.onClose?.(info);
        return;
      }
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_DELAYS_MS[reconnectAttempts];
        reconnectAttempts += 1;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (closedByCaller) return;
          void open();
        }, delay);
        return;
      }
      handlers.onError?.(new Error('connection lost'));
      handlers.onClose?.(info);
    };
  }

  void open();

  return {
    send(cmd: ClientCommand) {
      const data = JSON.stringify(cmd);
      if (!ws || ws.readyState !== 1) {
        enqueueJson(data);
        return;
      }
      try {
        ws.send(data);
      } catch (e) {
        handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
      }
    },
    close() {
      closedByCaller = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      outbox.length = 0;
      if (ws) {
        try {
          ws.close(1000, 'client_close');
        } catch {
          // ignored
        }
        ws = null;
      }
    },
    isOpen() {
      return !!ws && ws.readyState === 1;
    },
    getSessionId() {
      return sessionId;
    },
    setLastSeenCallId(id: string) {
      lastSeenCallId = id;
    },
  };
}
