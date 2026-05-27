# Nudge Backend

Node/Express server hosting the agent loop (Gemini 2.5 Flash) and a few utility endpoints.

## Setup

```bash
npm install
# Set GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY in ../.env
npm start
```

Server runs on `http://localhost:8000` and accepts connections from any LAN address (`0.0.0.0`) so the iOS / Android dev client on a phone can reach it.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/proxy-ics?url=…` | Fetch and proxy ICS calendar feeds (bypasses CORS) |
| `POST` | `/agent/turn` | Stateless REST harness for the agent loop — used by tests + dev iteration |
| `WS`   | `/agent/session?token=…&date=…&tz=…` | Streaming agent session (this is what the app uses) |

The agent session is the load-bearing endpoint. The client sends an `utterance_text` JSON command after on-device Whisper transcribes the user's speech, and the server runs an iterative Gemini loop that calls tools (`create_task`, `update_task`, `delete_task`, `update_meal_default`, `undo_last`) and emits `tool_call` / `tool_result` events back over the WS.

**The server does not see audio.** Transcription happens entirely on the device via `react-native-executorch` (Whisper Tiny EN Quantized) — see the main [README.md](../README.md#voice--on-device-asr) for the architecture diagram.

## ICS proxy

Google Calendar and other providers don't include CORS headers on their ICS endpoints, so a browser/Metro can't fetch them directly. `/proxy-ics` fetches server-side and returns the ICS content. The calendar must be made public with all events visible (not just free/busy).

## Key files

- `server.js` — Express app, WS upgrade, session lifecycle, `handleBoundary`, agent loop driver
- `lib/gemini.js` — Gemini SDK wrapper (`plan`, `runAgentTurn`)
- `lib/executor.js` — Tool execution + RLS-enforced mutations
- `lib/prompt.js` — System prompt builder
- `lib/tools.js` — Function declaration schemas for the agent
- `lib/journal.js` — Undo journal
- `lib/repeat.js` — Recurring task expansion
- `lib/categorize.js` — Task category inference
