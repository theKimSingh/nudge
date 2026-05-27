// Mic capture for the local ASR pipeline. Wraps react-native-live-audio-stream
// and emits Float32 PCM chunks alongside an RMS-derived dB reading so the
// session hook can drive Whisper streaming + the dB-threshold VAD + the
// edge-glow amplitude SharedValue from a single source.
//
// 16 kHz mono int16 PCM is the format Whisper expects. The native library
// emits the base64-encoded bytes via `on('data', ...)`. We decode int16 →
// float32 in [-1, 1] and compute RMS in dB clamped to [-90, 0] (matching the
// range the old expo-audio metering produced, so the existing VAD thresholds
// and the EdgeGlow normalization `(db + 60) / 60` keep working unchanged).
//
// iOS Simulator caveat: AudioQueue with kAudioFormatLinearPCM does not
// reliably route the Mac mic into the simulator. Buffers arrive but with
// `mAudioDataByteSize = 0`, so we see `samples.length === 0` and rmsDb is
// clamped to the floor. Use a physical device for real verification.

import { Buffer } from 'buffer';
import LiveAudioStream from 'react-native-live-audio-stream';

export type PcmChunkEvent =
  | { type: 'chunk'; samples: Float32Array; rmsDb: number; ts: number }
  | { type: 'error'; error: Error };

export type PcmStreamHandle = {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
};

const SAMPLE_RATE = 16000;
// `bufferSize` on both iOS (`bufferByteSize`) and Android (`new byte[bufferSize]`)
// is the byte count of one PCM chunk, NOT the sample count. At 16-bit mono,
// 2 bytes/sample → 4000 bytes ≈ 2000 samples ≈ 125 ms per chunk. That gives
// the live transcript ~8 updates/sec; tighter than 250 ms but still well
// within Whisper's encoder budget on a modern phone.
const BUFFER_BYTES = 4000;
const RMS_FLOOR_DB = -90;

function int16Base64ToFloat32(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  const int16 = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
  return float32;
}

function rmsDb(samples: Float32Array): number {
  if (samples.length === 0) return RMS_FLOOR_DB;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
  const mean = sumSq / samples.length;
  if (mean <= 0) return RMS_FLOOR_DB;
  const db = 10 * Math.log10(mean);
  return Math.max(RMS_FLOOR_DB, Math.min(0, db));
}

export function createPcmStream(handlers: {
  onEvent: (e: PcmChunkEvent) => void;
}): PcmStreamHandle {
  let running = false;

  function handleData(b64: string) {
    if (!running) return;
    try {
      const samples = int16Base64ToFloat32(b64);
      handlers.onEvent({
        type: 'chunk',
        samples,
        rmsDb: rmsDb(samples),
        ts: Date.now(),
      });
    } catch (e) {
      handlers.onEvent({
        type: 'error',
        error: e instanceof Error ? e : new Error(String(e)),
      });
    }
  }

  return {
    async start() {
      if (running) return;
      try {
        LiveAudioStream.init({
          sampleRate: SAMPLE_RATE,
          channels: 1,
          bitsPerSample: 16,
          // AudioSource 6 = VOICE_RECOGNITION (Android), ignored on iOS.
          audioSource: 6,
          bufferSize: BUFFER_BYTES,
          wavFile: 'nudge-asr.wav',
        });
        LiveAudioStream.on('data', handleData);
        LiveAudioStream.start();
        running = true;
      } catch (e) {
        running = false;
        const err = e instanceof Error ? e : new Error(String(e));
        handlers.onEvent({ type: 'error', error: err });
        throw err;
      }
    },

    async stop() {
      if (!running) return;
      running = false;
      try {
        await LiveAudioStream.stop();
      } catch (e) {
        handlers.onEvent({
          type: 'error',
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    },

    isRunning() {
      return running;
    },
  };
}
