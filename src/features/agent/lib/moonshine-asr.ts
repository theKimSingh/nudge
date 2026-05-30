// On-device streaming ASR via react-native-sherpa-onnx + Moonshine Base EN
// (int8) — the app's sole ASR engine. Returns the AsrStream shape (asr-engine.ts)
// the session hook consumes.
//
// Why a façade: sherpa-onnx's Moonshine is an *offline* recognizer
// (transcribeSamples(waveform) -> text). There is no native streaming/partial
// callback (that only exists for Zipformer/Paraformer). So we emulate the
// stream()/streamInsert()/streamStop() contract by buffering inserted PCM and
// re-running the offline recognizer on the growing buffer on a fixed cadence —
// exactly the "cheap re-run on a growing window" pattern Moonshine is built for
// (it scales compute with clip length instead of zero-padding to 30s, so
// repeated short re-runs are inexpensive).
//
// Why bundled-then-extract: sherpa-onnx loads models from a filesystem path, not
// a Metro-required asset. So we bundle the ~239MB .tar.bz2 as a Metro asset
// (require below), resolve it to a local path with expo-asset, and extract once
// to DocumentDirectoryPath on first launch via sherpa's native extractTarBz2 —
// no network at runtime. Fetch the archive with `npm run fetch-moonshine-model`
// after a fresh clone.

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
// Audio kept when a new utterance begins (see beginUtterance). The VAD fires
// speech_start ~minSpeechMs (400ms) AFTER the user actually started talking, so
// the opening words are already in the buffer; 800ms of pre-roll preserves them
// while discarding accumulated inter-utterance silence and stale audio.
const PREROLL_SAMPLES = Math.round(SAMPLE_RATE * 0.8);

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

// Normalize a word for local-agreement comparison: lowercase + strip trailing
// punctuation, so "Okay"/"okay" and "early."/"early" count as agreeing. Without
// this, capitalization/punctuation drift between Moonshine re-decodes stalls the
// committed prefix even though the words match.
function normWord(w: string): string {
  return w.toLowerCase().replace(/[.,!?;:]+$/g, '');
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
  // Serializes decodes — sherpa's offline recognizer isn't safe to run
  // concurrently, and the cadence loop and finalize() would otherwise overlap.
  const transcribeChainRef = useRef<Promise<string>>(Promise.resolve(''));

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

  function transcribeBuffer(
    engine: SttEngine,
    samples: number[],
  ): Promise<string> {
    const run = transcribeChainRef.current.catch(() => '').then(async () => {
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
    });
    transcribeChainRef.current = run.catch(() => '');
    return run;
  }

  async function* stream(): AsyncGenerator<StreamYield, void, unknown> {
    // Supersede any prior generator and wake it out of a cadence sleep so it
    // exits at once. NOTE: we do NOT reset bufferRef here — finalize() owns the
    // utterance buffer and swaps it synchronously at speech-end. Resetting here
    // would race the next utterance's audio (a delayed restart wipes samples
    // that already arrived) and is what dropped short utterances before.
    const myGen = (streamGenRef.current += 1);
    wakeRef.current?.();
    stopRef.current = false;
    const engine = engineRef.current;
    if (!engine) return;

    const current = () => streamGenRef.current === myGen;
    let lastLen = 0;
    // Local-agreement stabilization. Moonshine re-decodes the whole growing
    // buffer each tick, and an independent decode can shrink or rewrite its tail
    // (it guesses sentence endings on incomplete audio). We only promote words
    // that two consecutive decodes AGREE on into `committed`, which therefore
    // only ever grows — so the displayed transcript stays continuous and never
    // shows a guess that later vanishes. The unconfirmed tail rides in
    // `nonCommitted`.
    let prevWords: string[] = [];
    let committed = '';
    let committedCount = 0;

    const emit = (full: string): StreamYield => {
      const words = full.split(/\s+/).filter(Boolean);
      // Count leading words this decode and the previous one agree on
      // (normalized), so capitalization/punctuation drift doesn't stall us.
      let agreed = 0;
      const n = Math.min(words.length, prevWords.length);
      while (agreed < n && normWord(words[agreed]) === normWord(prevWords[agreed])) {
        agreed++;
      }
      prevWords = words;
      // committed only ever grows; adopt the latest decode's word forms.
      if (agreed > committedCount) {
        committedCount = agreed;
        committed = words.slice(0, committedCount).join(' ');
      }
      // tail = the current decode's words past the committed count, by index.
      // (string slice was case-sensitive and emptied the tail on drift, which
      // is what froze the display mid-utterance.)
      const tail =
        words.length > committedCount ? words.slice(committedCount).join(' ') : '';
      return { committed: { text: committed }, nonCommitted: { text: tail } };
    };

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
      if (text) yield emit(text);
    }
    // No final pass — finalize() does the authoritative end-of-utterance decode
    // that gets sent to the agent (reliable even when `committed` never
    // advanced). This generator is purely for the live display.
  }

  function streamInsert(samples: Float32Array): void {
    const buf = bufferRef.current;
    for (let i = 0; i < samples.length; i++) buf.push(samples[i]);
  }

  // Called at VAD speech_start. Drops accumulated inter-utterance silence and
  // any stale audio left by a stop() that didn't finalize, keeping only a short
  // pre-roll so this utterance's opening words survive. Without this the buffer
  // (and every decode) grows with the gaps between utterances over a session.
  function beginUtterance(): void {
    const buf = bufferRef.current;
    if (buf.length > PREROLL_SAMPLES) {
      bufferRef.current = buf.slice(buf.length - PREROLL_SAMPLES);
    }
  }

  function streamStop(): void {
    stopRef.current = true;
    // Interrupt the cadence sleep so the generator finalizes immediately.
    wakeRef.current?.();
  }

  // Authoritative end-of-utterance decode. Captures the COMPLETE buffer (the
  // array ref is captured here, so a later stream() reset can't pull it out from
  // under us) and decodes it once, serialized behind any in-flight cadence
  // decode. This is what gets sent to the agent — independent of the streamed
  // `committed` text, which can stay empty when the leading words are unstable.
  async function finalize(): Promise<string> {
    stopRef.current = true;
    wakeRef.current?.();
    const engine = engineRef.current;
    // Capture this utterance's audio and immediately swap in a fresh buffer so
    // the NEXT utterance accumulates cleanly. Capturing the array ref means a
    // later reset can't pull samples out from under this decode, and the buffer
    // never grows past one utterance (which was what degraded decode speed and
    // accuracy the longer a session ran).
    const buf = bufferRef.current;
    bufferRef.current = [];
    if (!engine || buf.length < MIN_SAMPLES) return '';
    return transcribeBuffer(engine, buf);
  }

  return {
    isReady,
    isGenerating,
    downloadProgress,
    error,
    stream,
    streamInsert,
    streamStop,
    finalize,
    beginUtterance,
  };
}
