// MODEL SEAM.
//
// The on-device voice pipeline (mic → VAD → Moonshine ASR → cleanTranscript)
// produces ONE finalized transcript per utterance and hands it off here. This is
// the single boundary between "voice input + transcription" (done, on-device)
// and "reasoning model" (a Qwen with full-reasoning architecture, integrated
// later).
//
// Today the default behavior is just a console.log, so `mic → accurate
// transcript → console` works with no model wired up. When the model is ready,
// call setTranscriptHandler() once at startup; it then receives every finalized
// utterance. Nothing upstream of this file needs to change — the model's input
// is `(transcript, segId)` and its output schema is entirely its own concern.

export type TranscriptHandler = (
  transcript: string,
  segId: string,
) => void | Promise<void>;

let handler: TranscriptHandler | null = null;

/** Register the reasoning model's handler. Pass null to revert to log-only. */
export function setTranscriptHandler(h: TranscriptHandler | null): void {
  handler = h;
}

/**
 * Called by the session on speech_end with the cleaned, finalized transcript.
 * Always logs (so the pipeline is observable with no model), then forwards to
 * the registered handler if one exists.
 */
export function emitTranscript(transcript: string, segId: string): void {
  console.log('[transcript]', JSON.stringify(transcript), 'seg=', segId);
  if (!handler) return;
  try {
    void handler(transcript, segId);
  } catch (e) {
    console.warn('[transcript] handler threw:', e);
  }
}
