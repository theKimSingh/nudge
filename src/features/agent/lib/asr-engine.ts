// On-device ASR facade. Moonshine (sherpa-onnx) is the single engine; this
// module exists to (a) define the minimal `AsrStream` contract the agent session
// consumes, and (b) expose `useActiveAsrStream` as a stable indirection so
// callers don't import the engine implementation directly.

import { useMoonshineStream } from './moonshine-asr';

/** The fields the agent session actually consumes from the ASR. */
export type AsrStream = {
  /** True once the model is loaded/warm and ready to transcribe. */
  isReady: boolean;
  /** True while a transcription is in flight. */
  isGenerating: boolean;
  /** 0–1 model acquisition progress (download/extract on first launch). */
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
  /**
   * Session-level reset: discard ALL buffered PCM and supersede any live
   * generator. Unlike streamStop (which just ends the cadence loop) this wipes
   * the utterance buffer, so a mic stop that never reached speech_end/finalize
   * can't leave stale audio that the NEXT session's stream() re-decodes and
   * shows as the previous transcript. Called from the session teardown.
   */
  reset?(): void;
  /**
   * Called at VAD speech_start. Lets the engine drop accumulated inter-utterance
   * silence / stale audio (keeping a small pre-roll) so the decode buffer doesn't
   * grow across a session.
   */
  beginUtterance?(): void;
  /**
   * Authoritative end-of-utterance transcription of the complete buffered audio,
   * awaited directly. Used for the text we SEND to the agent — reliable even for
   * short/unstable-prefix utterances where the streamed `committed` text never
   * advanced.
   */
  finalize?(): Promise<string>;
};

export const useActiveAsrStream: () => AsrStream = useMoonshineStream;
