// Engine-agnostic transcript hygiene. On silent/near-silent audio, ASR models
// occasionally emit literal compliance phrases ("thanks for watching"), bracketed
// annotations ("[music]", "[ 0m0s900ms - 0m1s100ms ]"), or stray surrounding
// quotes — none of which should reach the agent loop.

// Phrases the model sometimes returns when the audio is silent or near-silent
// (ASR training data includes a lot of YouTube intros/outros that bleed through
// on quiet input).
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
  // or "[music]" / "[applause]" that the model occasionally injects.
  const cleaned = text
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned;
}
