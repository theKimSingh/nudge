// Apple Foundation Model reasoning backend (replaces Qwen for the "extract a
// calendar event from an utterance" step). Prompt + date heuristic ported from
// theKimSingh/nudge-local (training_apple/testing.js), which measured ~70%
// event-extraction accuracy on the Apple on-device foundation model WITHOUT
// fine-tuning.
//
// Runs FULLY ON-DEVICE via the native AppleFm module (FoundationModels /
// LanguageModelSession, iOS 26+) — no server, no network. This file owns the
// prompt + JSON parsing; the native module is a thin model-only bridge.
//
// This is the reasoning step AFTER ASR: it consumes the finalized transcript and
// returns a single structured event. It does NOT use the tool-calling agent loop
// (that's the Qwen path) — the foundation model emits JSON directly.

import { generate, isAvailable, type AppleFmAvailability } from '@/modules/apple-fm';

export type { AppleFmAvailability };
export { isAvailable };

export type AppleEvent = {
  id: number | null;
  title: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  /** HH:mm (24h) */
  start_time: string | null;
  /** HH:mm (24h) */
  end_time: string | null;
  repeats: 'daily' | 'weekdays' | 'weekly' | null;
};

const DAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

// Heuristic preprocessing (verbatim from Kim's harness): annotate weekday names
// with their resolved calendar date so the model doesn't have to do weekday math
// ("next monday" -> "next monday (2026-06-01)"). anchorDateStr is YYYY-MM-DD.
export function appendDatesToDayNames(text: string, anchorDateStr: string): string {
  const [year, month, day] = anchorDateStr.split('-').map(Number);
  const anchorDate = new Date(year, month - 1, day);
  const anchorDayIndex = anchorDate.getDay();

  const dayRegex =
    /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi;

  return text.replace(dayRegex, (match, nextModifier, dayName: string) => {
    const targetDayIndex = DAYS.indexOf(dayName.toLowerCase());
    let daysDiff = targetDayIndex - anchorDayIndex;
    if (nextModifier) {
      daysDiff += daysDiff <= 0 ? 7 : 7; // "next <day>" => next calendar week
    } else if (daysDiff <= 0) {
      daysDiff += 7; // passed or today => next occurrence
    }
    const resolved = new Date(anchorDate);
    resolved.setDate(anchorDate.getDate() + daysDiff);
    const yyyy = resolved.getFullYear();
    const mm = String(resolved.getMonth() + 1).padStart(2, '0');
    const dd = String(resolved.getDate()).padStart(2, '0');
    return `${match} (${yyyy}-${mm}-${dd})`;
  });
}

function buildSystemPrompt(todayISO: string): string {
  const [y, m, d] = todayISO.split('-').map(Number);
  const dayName = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ][new Date(y, m - 1, d).getDay()];

  // Based on Kim's validated prompt; relaxed to allow MULTIPLE events per
  // utterance ("breakfast at 7 and gym at 6" → two objects) since users speak
  // several at once.
  return `You are a helpful assistant that extracts event details.
    Today's date is ${todayISO} (${dayName}).
    Extract EVERY event mentioned in the user's text. To determine the correct "date", use ${todayISO} as your anchor point.

    If there is no end time provided, assume the event is 1 hour long.
    If the input text contains an explicit date in parentheses, e.g., (YYYY-MM-DD), you MUST use this date for the "date" field.
    You MUST respond with a JSON list containing ONE object PER event mentioned (usually one; more if the user names several), each containing ONLY these keys:
    "id" (integer tracking the event), "title", "date" (Strict format: YYYY-MM-DD), "start_time" (Strict format: HH:mm 24-hour clock), "end_time" (Strict format: HH:mm 24-hour clock), "repeats" ("daily", "weekdays", "weekly", or null)
    If a field is missing, unknown, or being explicitly cleared, use null. Output your response strictly as a raw JSON list, do not wrap it in markdown block tags.`;
}

/**
 * Run one transcript through the on-device Apple Foundation Model and return the
 * extracted event. Throws on model-unavailable / transport / parse failure so
 * the caller can surface it.
 */
export async function extractEvent(
  transcript: string,
  todayISO: string,
): Promise<{ events: AppleEvent[]; preprocessed: string; raw: string }> {
  const preprocessed = appendDatesToDayNames(transcript, todayISO);
  if (__DEV__ && preprocessed !== transcript) {
    console.log(`[apple-fm] heuristic: "${preprocessed}"`);
  }

  // On-device generation (FoundationModels). Throws a descriptive NSError-backed
  // message if Apple Intelligence is off / model not downloaded / device too old.
  const raw = await generate(buildSystemPrompt(todayISO), preprocessed, 0.1);

  if (!raw || !raw.trim()) {
    throw new Error('Apple FM returned an empty response');
  }

  const clean = raw.replace(/```json|```/g, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Apple FM returned non-JSON: ${clean.slice(0, 200)}`);
  }

  // The model returns a JSON list — ONE object per event mentioned (e.g.
  // "breakfast at 7 and gym at 6" → two). Map ALL of them, not just the first.
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const events: AppleEvent[] = list
    .filter((e): e is Partial<AppleEvent> => !!e && typeof e === 'object')
    .map((e) => ({
      id: e.id ?? null,
      title: e.title ?? null,
      date: e.date ?? null,
      start_time: e.start_time ?? null,
      end_time: e.end_time ?? null,
      repeats: (e.repeats as AppleEvent['repeats']) ?? null,
    }));
  return { events, preprocessed, raw };
}
