// expo-audio cannot stream raw PCM. We record continuously and only flush
// the in-flight .m4a on demand (when VAD detects speech-end) — each flush
// produces ONE valid m4a containing exactly one utterance. Previously we
// flushed every 1s on a timer; that produced N tiny m4a files per utterance
// which transcribed badly (the model treated each 1s slice independently,
// often echoing the prompt or splitting words across chunks). One-m4a-per-
// utterance is accurate and still feels interactive because flush happens
// immediately on speech-end.
//
// TODO(wave-2): for sub-300ms partial-transcript latency, replace this with
// a custom native module exposing an onChunk(PCM) callback that can feed a
// streaming STT. This implementation is "wait-for-end-of-utterance" by design.
//
// RecordingStatus events do not include `metering`; we poll
// recorder.getStatus() on a 100ms interval so VAD has dB samples.

import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  type AudioRecorder,
  type RecordingStatus,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

export type ChunkerEvent =
  | { type: 'chunk'; bytes: Uint8Array; durationMs: number; ts: number }
  | { type: 'metering'; db: number; ts: number }
  | { type: 'error'; error: Error };

export type ChunkerHandle = {
  start(): Promise<void>;
  stop(): Promise<void>;
  /**
   * Stop the current recording, emit its .m4a bytes as a 'chunk' event, then
   * immediately start a new recording. Call this when the user finishes an
   * utterance (VAD speech_end). The returned promise resolves after the chunk
   * event has been emitted, so callers can safely send `utterance_end` next.
   */
  flush(): Promise<void>;
  isRunning(): boolean;
};

const METERING_INTERVAL_MS = 100;

const PRESET = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = (globalThis as any).atob(b64) as string;
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function createAudioChunker(handlers: {
  onEvent: (e: ChunkerEvent) => void;
}): ChunkerHandle {
  let recorder: AudioRecorder | null = null;
  let running = false;
  let meterTimer: ReturnType<typeof setInterval> | null = null;
  let segmentStartTs = 0;
  let statusSub: { remove: () => void } | null = null;
  let cycling = false;

  function clearTimers() {
    if (meterTimer) {
      clearInterval(meterTimer);
      meterTimer = null;
    }
  }

  async function flushAndRestart() {
    if (!recorder || cycling) return;
    cycling = true;
    try {
      const previousUri = recorder.uri;
      const startTs = segmentStartTs;
      await recorder.stop();
      const finishedUri = previousUri ?? recorder.uri;

      // Restart immediately so the next segment begins.
      try {
        await recorder.prepareToRecordAsync(PRESET);
        recorder.record();
        segmentStartTs = Date.now();
      } catch (e) {
        handlers.onEvent({
          type: 'error',
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }

      if (finishedUri) {
        try {
          const b64 = await FileSystem.readAsStringAsync(finishedUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const bytes = base64ToBytes(b64);
          handlers.onEvent({
            type: 'chunk',
            bytes,
            durationMs: Date.now() - startTs,
            ts: startTs,
          });
        } catch (e) {
          handlers.onEvent({
            type: 'error',
            error: e instanceof Error ? e : new Error(String(e)),
          });
        } finally {
          FileSystem.deleteAsync(finishedUri, { idempotent: true }).catch(() => {});
        }
      }
    } catch (e) {
      handlers.onEvent({
        type: 'error',
        error: e instanceof Error ? e : new Error(String(e)),
      });
    } finally {
      cycling = false;
    }
  }

  function pollMetering() {
    if (!recorder) return;
    try {
      const s = recorder.getStatus();
      if (typeof s.metering === 'number' && Number.isFinite(s.metering)) {
        handlers.onEvent({ type: 'metering', db: s.metering, ts: Date.now() });
      }
    } catch {
      // ignored: recorder may be mid-cycle
    }
  }

  return {
    async start() {
      if (running) return;
      try {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          interruptionMode: 'doNotMix',
        });
        // eslint-disable-next-line import/namespace
        recorder = new AudioModule.AudioRecorder(PRESET);
        statusSub = recorder.addListener('recordingStatusUpdate', (status: RecordingStatus) => {
          if (status.hasError && status.error) {
            handlers.onEvent({ type: 'error', error: new Error(status.error) });
          }
        });
        await recorder.prepareToRecordAsync(PRESET);
        recorder.record();
        segmentStartTs = Date.now();
        running = true;

        meterTimer = setInterval(pollMetering, METERING_INTERVAL_MS);
      } catch (e) {
        running = false;
        clearTimers();
        statusSub?.remove();
        statusSub = null;
        recorder = null;
        const err = e instanceof Error ? e : new Error(String(e));
        handlers.onEvent({ type: 'error', error: err });
        throw err;
      }
    },

    async flush() {
      if (!running) return;
      await flushAndRestart();
    },

    async stop() {
      if (!running) return;
      running = false;
      clearTimers();
      const r = recorder;
      recorder = null;
      statusSub?.remove();
      statusSub = null;

      if (r) {
        const finalUri = r.uri;
        try {
          await r.stop();
        } catch {
          // ignored
        }
        if (finalUri) {
          try {
            const b64 = await FileSystem.readAsStringAsync(finalUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const bytes = base64ToBytes(b64);
            handlers.onEvent({
              type: 'chunk',
              bytes,
              durationMs: Date.now() - segmentStartTs,
              ts: segmentStartTs,
            });
          } catch (e) {
            handlers.onEvent({
              type: 'error',
              error: e instanceof Error ? e : new Error(String(e)),
            });
          } finally {
            FileSystem.deleteAsync(finalUri, { idempotent: true }).catch(() => {});
          }
        }
      }

      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    },

    isRunning() {
      return running;
    },
  };
}
