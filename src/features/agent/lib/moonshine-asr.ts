// On-device streaming ASR via react-native-sherpa-onnx + Moonshine Base EN
// (int8). Drop-in alternative to whisper-asr.ts behind the ASR_ENGINE flag in
// asr-engine.ts — it returns the same AsrStream shape the session hook consumes.
//
// Why a façade: sherpa-onnx's Moonshine is an *offline* recognizer
// (transcribeSamples(waveform) -> text). There is no native streaming/partial
// callback (that only exists for Zipformer/Paraformer). So we emulate the
// stream()/streamInsert()/streamStop() contract by buffering inserted PCM and
// re-running the offline recognizer on the growing buffer on a fixed cadence —
// exactly the "cheap re-run on a growing window" pattern Moonshine is built for
// (it scales compute with clip length instead of zero-padding to 30s like
// Whisper, so repeated short re-runs are inexpensive).
//
// Why bundled-then-extract: sherpa-onnx loads models from a filesystem path,
// NOT via Metro require() like Whisper's .pte. So we bundle the ~239MB .tar.bz2
// as a Metro asset (require below), resolve it to a local path with expo-asset,
// and extract once to DocumentDirectoryPath on first launch via sherpa's native
// extractTarBz2 — no network at runtime. Mirrors the Whisper .pte bundle pattern
// (fetch the archive with `npm run fetch-moonshine-model` after a fresh clone).

import { useEffect, useRef, useState } from 'react';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { Asset } from 'expo-asset';
import { fileModelPath } from 'react-native-sherpa-onnx';
import { extractTarBz2 } from 'react-native-sherpa-onnx/download';
import { createSTT, type SttEngine } from 'react-native-sherpa-onnx/stt';

import type { AsrStream } from './asr-engine';

// Bundled Moonshine Base EN int8 archive (sherpa-onnx layout, ~239MB). Lives in
// src/assets/models/ (gitignored) — run `npm run fetch-moonshine-model` to
// fetch it. The archive expands to `sherpa-onnx-moonshine-base-en-int8/`
// (preprocess/encode/uncached_decode/cached_decode .onnx + tokens.txt).
const MOONSHINE_ARCHIVE = require('@/src/assets/models/moonshine-base-en-int8.tar.bz2');
const MODEL_FOLDER = 'sherpa-onnx-moonshine-base-en-int8';

const SAMPLE_RATE = 16_000;
// Re-run the recognizer on the growing buffer at this cadence. ~350ms gives
// roughly 3 live updates/sec — smooth enough for the token-stream UI without
// stacking transcribe() calls (Moonshine base is well under this budget on a
// modern phone).
const RERUN_CADENCE_MS = 350;
// Don't transcribe sub-100ms slivers — nothing useful comes back.
const MIN_SAMPLES = 3_200; // changed from 1600
// Moonshine generalizes poorly to clips <1s (it can emit repeated tokens /
// WER>100% because <0.5% of its training data is sub-1s). Zero-pad short
// buffers up to 1s before transcribing to dodge that failure mode.
const MIN_TRANSCRIBE_SAMPLES = SAMPLE_RATE;

type StreamYield = {
  committed: { text: string };
  nonCommitted: { text: string };
};

// Module-memoized engine. The session provider mounts the hook once for the app
// lifetime; memoizing here means a Fast-Refresh remount never re-downloads or
// re-initializes the ~286MB model. On failure we clear the promise so a later
// mount can retry.
let enginePromise: Promise<SttEngine> | null = null;

async function ensureMoonshineEngine(
  onProgress: (p: number) => void,
): Promise<SttEngine> {
  if (enginePromise) {
    onProgress(1);
    return enginePromise;
  }
  enginePromise = (async () => {
    const modelsDir = `${RNFS.DocumentDirectoryPath}/models`;
    const modelDir = `${modelsDir}/${MODEL_FOLDER}`;

    await RNFS.mkdir(modelsDir).catch(() => {});

    // Idempotent: skip extraction if the model is already on disk (every launch
    // after the first).
    const alreadyExtracted = await RNFS.exists(`${modelDir}/tokens.txt`);
    if (!alreadyExtracted) {
      // Resolve the bundled archive to a local filesystem path. For an asset
      // bundled at build time this needs no network (in dev it streams from the
      // Metro server). localUri is a file:// URI; sherpa wants a bare path.
      onProgress(0.1);
      const asset = Asset.fromModule(MOONSHINE_ARCHIVE);
      await asset.downloadAsync();
      const archiveUri = asset.localUri ?? asset.uri;
      const archiveSource = archiveUri.replace(/^file:\/\//, '');

      onProgress(0.3);
      await extractTarBz2(archiveSource, modelsDir, true, (e) => {
        onProgress(0.3 + Math.min(0.69, (e.percent / 100) * 0.69));
      });
    }

    onProgress(1);
    // resolveModelPath() for type:'file' normalizes to the dir containing the
    // .onnx files, so pointing at the extracted folder is sufficient.
    return createSTT({
      modelPath: fileModelPath(modelDir),
      modelType: 'moonshine',
    });
  })();
  enginePromise.catch(() => {
    enginePromise = null;
  });
  return enginePromise;
}

function waitTick(
  ms: number,
  registerWake: (wake: () => void) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    registerWake(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export function useMoonshineStream(): AsrStream {
  const [isReady, setIsReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<{ message?: string } | null>(null);

  const engineRef = useRef<SttEngine | null>(null);
  // PCM samples (Float32 values in [-1,1]) for the current utterance. Reset at
  // the start of each stream() iteration.
  const bufferRef = useRef<number[]>([]);
  const stopRef = useRef(false);
  // Lets streamStop() interrupt the cadence sleep so finalize is prompt.
  const wakeRef = useRef<(() => void) | null>(null);
  // Monotonic stream-instance token. Each stream() call bumps it; an older
  // generator whose token no longer matches exits immediately without emitting,
  // so a stop/start cycle can't leave a stale generator bleeding text into the
  // next utterance.
  const streamGenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    ensureMoonshineEngine((p) => {
      if (!cancelled) setDownloadProgress(p);
    })
      .then((engine) => {
        if (cancelled) return;
        engineRef.current = engine;
        setDownloadProgress(1);
        setIsReady(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      });
    // The engine is module-memoized and the provider mounts once for the app
    // lifetime, so we intentionally do not destroy() on unmount (a remount
    // reuses the same engine instead of re-downloading).
    return () => {
      cancelled = true;
    };
  }, []);

  async function transcribeBuffer(
    engine: SttEngine,
    samples: number[],
  ): Promise<string> {
    let input = samples;
    if (input.length < MIN_TRANSCRIBE_SAMPLES) {
      input = samples.slice();
      while (input.length < MIN_TRANSCRIBE_SAMPLES) input.push(0);
    }
    setIsGenerating(true);
    try {
      const result = await engine.transcribeSamples(input, SAMPLE_RATE);
      return (result.text ?? '').trim();
    } finally {
      setIsGenerating(false);
    }
  }

  async function* stream(): AsyncGenerator<StreamYield, void, unknown> {
    // Supersede any prior generator and wake it out of a cadence sleep so it
    // exits at once; then start a fresh utterance.
    const myGen = (streamGenRef.current += 1);
    wakeRef.current?.();
    bufferRef.current = [];
    stopRef.current = false;
    const engine = engineRef.current;
    if (!engine) return;

    const current = () => streamGenRef.current === myGen;
    let lastLen = 0;
    let lastText = '';

    while (!stopRef.current && current()) {
      await waitTick(RERUN_CADENCE_MS, (wake) => {
        wakeRef.current = wake;
      });
      wakeRef.current = null;
      if (!current()) return; // superseded — exit without emitting
      const len = bufferRef.current.length;
      if (len < MIN_SAMPLES || len === lastLen) continue;
      lastLen = len;
      const text = await transcribeBuffer(engine, bufferRef.current);
      if (!current()) return; // superseded mid-transcribe
      if (text && text !== lastText) {
        lastText = text;
        yield { committed: { text }, nonCommitted: { text: '' } };
      }
    }

    // Final pass over the complete utterance, if it grew since the last re-run
    // and we weren't superseded.
    if (
      current() &&
      bufferRef.current.length >= MIN_SAMPLES &&
      bufferRef.current.length !== lastLen
    ) {
      const finalText = await transcribeBuffer(engine, bufferRef.current);
      if (current() && finalText && finalText !== lastText) {
        yield { committed: { text: finalText }, nonCommitted: { text: '' } };
      }
    }
  }

  function streamInsert(samples: Float32Array): void {
    const buf = bufferRef.current;
    for (let i = 0; i < samples.length; i++) buf.push(samples[i]);
  }

  function streamStop(): void {
    stopRef.current = true;
    // Interrupt the cadence sleep so the generator finalizes immediately.
    wakeRef.current?.();
  }

  return {
    isReady,
    isGenerating,
    downloadProgress,
    error,
    stream,
    streamInsert,
    streamStop,
  };
}
