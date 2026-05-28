// Single switch point for the on-device ASR engine.
//
// Two engines satisfy the same minimal `AsrStream` contract below:
//   - Moonshine (sherpa-onnx, runtime-downloaded)  — see moonshine-asr.ts
//   - Whisper Base EN  (executorch, bundled .pte)   — see whisper-asr.ts
//
// `useWhisperStream()` returns executorch's richer `SpeechToTextType`, which is
// a structural superset of `AsrStream`, so it assigns cleanly. Flip ASR_ENGINE
// to revert to the known-good Whisper path instantly — no rebuild needed, since
// the executorch model stays bundled.
//
// The engine is picked at module load (ASR_ENGINE is a build-time constant), so
// `useActiveAsrStream` is a single stable hook reference: only the selected
// engine's hook is ever called, and React's rules-of-hooks are satisfied
// without conditionals or double-loading both models.

import { useMoonshineStream } from './moonshine-asr';
import { useWhisperStream } from './whisper-asr';

/** The fields the agent session + smoke screen actually consume from the ASR. */
export type AsrStream = {
  /** True once the model is loaded/warm and ready to transcribe. */
  isReady: boolean;
  /** True while a transcription is in flight. */
  isGenerating: boolean;
  /** 0–1 model acquisition progress (download/extract for Moonshine; load for Whisper). */
  downloadProgress: number;
  /** Non-null if the model failed to load. */
  error: { message?: string } | null;
  /**
   * Opens a streaming transcription. Yields a growing `{ committed, nonCommitted }`
   * pair as PCM is fed via `streamInsert`; returns after `streamStop`.
   */
  stream(): AsyncGenerator<
    { committed: { text: string }; nonCommitted: { text: string } },
    void,
    unknown
  >;
  /** Feed a chunk of 16kHz mono Float32 PCM into the active stream. */
  streamInsert(samples: Float32Array): void;
  /** Finalize the active stream; the generator drains and returns. */
  streamStop(): void;
};

/** Active on-device ASR engine. Flip to 'whisper' to revert to the bundled path. */
export const ASR_ENGINE: 'moonshine' | 'whisper' = 'moonshine';

export const useActiveAsrStream: () => AsrStream =
  ASR_ENGINE === 'moonshine' ? useMoonshineStream : useWhisperStream;
