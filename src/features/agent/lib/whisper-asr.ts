// On-device streaming ASR via react-native-executorch + Whisper Tiny EN
// quantized. The model loads once when the hook mounts (~75 MB download on
// first launch, cached after) and exposes an async-generator API that yields
// growing committed + nonCommitted transcripts as PCM samples are fed in.
//
// The hygiene pass below mirrors the regex guards that used to live in
// backend/lib/gemini.js — Whisper hallucinates in slightly different ways than
// Gemini but still occasionally outputs literal "thanks for watching" or
// bracketed timestamps on silent audio, which we don't want to ship to the
// agent loop.

import { useSpeechToText, type SpeechToTextType } from 'react-native-executorch';

// Bundled Whisper Tiny EN Quantized — the model + tokenizer ship inside the
// app instead of downloading from HuggingFace on first launch. require()
// returns a Metro asset id which the Expo ResourceFetcher resolves to a local
// file URI (Asset.fromModule). The tokenizer keeps a `.bin` extension so Metro
// treats it as a raw asset (a `.json` require would be parsed into a JS object
// and inlined into the bundle); the native HF tokenizer reads it as JSON by
// content regardless of filename.
//
// Files live in src/assets/models/ and are gitignored (168MB). Run
// `npm run fetch-model` after a fresh clone. See scripts/fetch-whisper-model.sh.
const WHISPER_TINY_EN_QUANTIZED_BUNDLED = {
  modelName: 'whisper-tiny-en-quantized' as const,
  isMultilingual: false as const,
  modelSource: require('@/src/assets/models/whisper-tiny-en-q.pte'),
  tokenizerSource: require('@/src/assets/models/whisper-tiny-en-q-tokenizer.bin'),
};

export function useWhisperStream(): SpeechToTextType {
  return useSpeechToText({ model: WHISPER_TINY_EN_QUANTIZED_BUNDLED });
}

// Phrases the model sometimes returns as a literal compliance response when
// the audio is silent or near-silent (Whisper's training data includes a lot
// of YouTube intros and outros that bleed through on quiet input).
const SILENCE_LITERAL_RE =
  /^[\s.,!?'"-]*(thanks? (for|so much for) watching|please subscribe|silence|inaudible|\[.*\]|\(.*\))[\s.,!?'"-]*$/i;

export function cleanTranscript(raw: string): string {
  let text = String(raw || '').trim();
  if (!text) return '';

  // Strip surrounding quotes the model sometimes adds.
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }

  // Silence-literal: treat as empty.
  if (SILENCE_LITERAL_RE.test(text)) return '';

  // Strip bracketed timestamp/annotation runs like "[ 0m0s900ms - 0m1s100ms ]"
  // or "[music]" / "[applause]" that Whisper occasionally injects.
  const cleaned = text
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned;
}
