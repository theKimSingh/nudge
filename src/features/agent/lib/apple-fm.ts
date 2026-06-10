// Apple Foundation Model reasoning backend (replaces Qwen). Runs FULLY ON-DEVICE
// via the native AppleFm module (FoundationModels / LanguageModelSession, iOS 26+).
//
// This is schedule-AWARE: it sees the user's existing events (with handles), their
// profile (day-section + meal anchor times) and constraints, and emits OPERATIONS
// — add / update / remove — so "move gym to 7pm" updates the existing event
// instead of creating a duplicate. apple-context.ts loads the data; this file
// renders the prompt and parses the model's ops.

import { generate, isAvailable, type AppleFmAvailability } from '@/modules/apple-fm';
import type { AppleContext, ScheduleItem } from './apple-context';

export type { AppleFmAvailability };
export { isAvailable };

export type AppleAction = 'add' | 'update' | 'remove' | 'rule';

export type AppleOp = {
  action: AppleAction;
  /** Existing-event handle (E1/E2…) for update/remove; null for add. */
  target: string | null;
  title: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  /** HH:mm (24h) */
  start_time: string | null;
  /** HH:mm (24h) */
  end_time: string | null;
  repeats: 'daily' | 'weekdays' | 'weekly' | null;
  /** For action="rule": the standing preference text. */
  text: string | null;
  /** For action="rule": "hard" (absolute) or "soft" (preference). */
  strength: 'hard' | 'soft' | null;
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

// Heuristic preprocessing (from Kim's harness): annotate weekday + relative-day
// names with their resolved calendar date so the model doesn't do date math
// ("next monday" → "next monday (2026-06-15)", "tomorrow" → "tomorrow (…)").
export function appendDatesToDayNames(text: string, anchorDateStr: string): string {
  const [year, month, day] = anchorDateStr.split('-').map(Number);
  const anchor = new Date(year, month - 1, day);
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  // Relative-day words first (today/tomorrow/tonight) — the model is weakest here.
  let out = text
    .replace(/\b(today|tonight)\b/gi, (m) => `${m} (${fmt(anchor)})`)
    .replace(/\btomorrow\b/gi, (m) => {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() + 1);
      return `${m} (${fmt(d)})`;
    });

  const dayRegex =
    /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi;
  out = out.replace(dayRegex, (match, nextModifier, dayName: string) => {
    const target = DAYS.indexOf(dayName.toLowerCase());
    let diff = target - anchor.getDay();
    if (nextModifier) diff += diff <= 0 ? 7 : 7;
    else if (diff <= 0) diff += 7;
    const d = new Date(anchor);
    d.setDate(anchor.getDate() + diff);
    return `${match} (${fmt(d)})`;
  });
  return out;
}

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function weekdayName(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ][new Date(y, m - 1, d).getDay()];
}

function scheduleLine(s: ScheduleItem): string {
  const repeat = s.repeat_rule && s.repeat_rule !== 'none' ? ` repeat=${s.repeat_rule}` : '';
  const done = s.done ? ' done' : '';
  return `- ${s.handle} | ${s.date} ${minToHHMM(s.time_minutes)} (${s.duration_minutes}m) | "${s.title}"${repeat}${done}`;
}

function buildOpsPrompt(todayISO: string, targetDate: string, ctx: AppleContext): string {
  const p = ctx.profile;
  const morning = minToHHMM(p?.morning_start_minutes ?? 420);
  const afternoon = minToHHMM(p?.afternoon_start_minutes ?? 780);
  const evening = minToHHMM(p?.evening_start_minutes ?? 1080);
  const breakfast = minToHHMM(p?.breakfast_time_minutes ?? 480);
  const lunch = minToHHMM(p?.lunch_time_minutes ?? 750);
  const dinner = minToHHMM(p?.dinner_time_minutes ?? 1110);

  const scheduleBlock = ctx.schedule.length
    ? ctx.schedule.map(scheduleLine).join('\n')
    : '(no existing events)';
  const constraintBlock = ctx.constraints.length
    ? ctx.constraints.map((c, i) => `${i + 1}. [${c.strength}/${c.category}] ${c.text}`).join('\n')
    : '(none)';

  return `You are a calendar scheduling assistant. Today is ${todayISO} (${weekdayName(todayISO)}). Unless the user says another day, they are scheduling ${targetDate}.

CURRENT SCHEDULE (the user's existing events — refer to one by its handle, e.g. E2, to CHANGE or REMOVE it):
${scheduleBlock}

DAY SECTIONS for this user: morning starts ${morning}, afternoon starts ${afternoon}, evening starts ${evening}.
MEAL TIMES: breakfast ${breakfast}, lunch ${lunch}, dinner ${dinner}. Use these to anchor "after lunch", "before dinner", etc. A meal named WITHOUT a specific clock time (just "breakfast" / "lunch" / "dinner", even with words like "early") is scheduled AT its time above — e.g. "eat breakfast" → start_time ${breakfast}.
RELATIVE PLACEMENT: when the user places something relative to an EXISTING event in CURRENT SCHEDULE ("right after class", "before the gym", "after my meeting"), read that event's time from the schedule: "after X" / "right after X" STARTS exactly when X ENDS; "before X" ENDS when X STARTS. Do NOT just stack it at the end of the day.
TIME FORMAT: speech often drops the colon — "2 30" or "230" means 2:30, "350" or "3 50" means 3:50, "6 pm" means 18:00. For a RANGE like "from A to B" ("class from 2:30 to 3:50"), A is start_time and B is end_time — use B exactly as the end. Only assume a 1-hour duration when NO end time is mentioned at all; never override a stated end with a 1-hour guess.
USER RULES (honor these when you place events):
${constraintBlock}

For EACH thing the user asks for, choose ONE action:
- "add": a NEW event that is NOT already in CURRENT SCHEDULE.
- "update": the user CHANGES an event that IS already in CURRENT SCHEDULE — moving/rescheduling it, renaming it, or changing its time/day/repeat. Put that event's handle in "target". Fill the fields with the event's title and the NEW time/day.
- "remove": the user cancels/deletes an event in CURRENT SCHEDULE. Put its handle in "target".
- "rule": the user states a STANDING PREFERENCE about how to schedule — NOT a specific event on a specific day. Examples: "I hate going to the gym before mentally draining tasks", "no meetings before 10am", "keep my evenings free", "I prefer to study in the morning". Put the rule in "text" as a short lowercase third-person phrase (e.g. "no gym before mentally draining tasks", "no meetings before 10am"). Set "strength" to "hard" for absolutes ("never", "no X", "always") or "soft" for preferences ("prefer", "hate", "try to", "like to"). Do NOT also create an event for a rule.

CRITICAL RULE: If the user mentions an activity that ALREADY EXISTS in CURRENT SCHEDULE (the same thing — e.g. there is already a "Gym" and they now say "make the gym 7pm instead" or "move gym to 7"), that is an "update" of that handle — NOT a new "add". Words like "instead", "move", "reschedule", "change", "push", "make it" signal an update. Only use "add" when the thing is genuinely not on the schedule yet.
COMPLETENESS: one request may contain SEVERAL events and rules. Read it from start to finish and output one object for EVERY single one — including events with explicit times like "class from 2:30 to 3:50", AND any preference/rule at the end like "I hate doing X before Y". Never stop early or drop the last items.

Respond with ONLY a raw JSON list (no markdown, no prose), ONE object per action, each with these keys:
"action" ("add" | "update" | "remove" | "rule"),
"target" (the handle like "E2" for update/remove; null otherwise),
"title", "date" (YYYY-MM-DD), "start_time" (HH:mm 24-hour), "end_time" (HH:mm 24-hour),
"repeats" ("daily" | "weekdays" | "weekly" | null),
"text" (the rule phrase, for action="rule" only; null otherwise),
"strength" ("hard" | "soft", for action="rule" only; null otherwise).
If no end time is given, make the event 1 hour long. For "remove", only "action" and "target" matter; for "rule", only "action", "text" and "strength" matter — set the others null. If any value is unknown, use null. If the text contains an explicit date in parentheses (YYYY-MM-DD), you MUST use it.

Example — user says "I hate going to the gym before mentally draining tasks":
[{"action":"rule","target":null,"title":null,"date":null,"start_time":null,"end_time":null,"repeats":null,"text":"no gym before mentally draining tasks","strength":"soft"}]

Example — CURRENT SCHEDULE is empty; user says "eat breakfast, class from 2:30 to 3:50, and gym for an hour at 6pm" → THREE adds (everything is new):
[{"action":"add","target":null,"title":"Breakfast","date":"${targetDate}","start_time":"08:00","end_time":"08:30","repeats":null,"text":null,"strength":null},{"action":"add","target":null,"title":"Class","date":"${targetDate}","start_time":"14:30","end_time":"15:50","repeats":null,"text":null,"strength":null},{"action":"add","target":null,"title":"Gym","date":"${targetDate}","start_time":"18:00","end_time":"19:00","repeats":null,"text":null,"strength":null}]
Use "update"/"remove" ONLY for an event that ALREADY appears in CURRENT SCHEDULE above (with an E-handle). If CURRENT SCHEDULE is empty, every event is an "add".`;
}

/**
 * Run one transcript through the on-device Apple Foundation Model with full
 * schedule/profile/constraint context, and return the operations it wants to
 * apply (add/update/remove). Throws on model-unavailable / parse failure.
 */
export async function extractOps(
  transcript: string,
  todayISO: string,
  ctx: AppleContext,
): Promise<{ ops: AppleOp[]; preprocessed: string; raw: string }> {
  const preprocessed = appendDatesToDayNames(transcript, todayISO);
  if (__DEV__ && preprocessed !== transcript) {
    console.log(`[apple-fm] heuristic: "${preprocessed}"`);
  }

  const system = buildOpsPrompt(todayISO, todayISO, ctx);
  const raw = await generate(system, preprocessed, 0.1);

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

  const list = Array.isArray(parsed) ? parsed : [parsed];
  const ops: AppleOp[] = list
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => {
      const action = String(e.action ?? 'add').toLowerCase();
      return {
        action: (['add', 'update', 'remove', 'rule'].includes(action) ? action : 'add') as AppleAction,
        target: typeof e.target === 'string' ? e.target : null,
        title: typeof e.title === 'string' ? e.title : null,
        date: typeof e.date === 'string' ? e.date : null,
        start_time: typeof e.start_time === 'string' ? e.start_time : null,
        end_time: typeof e.end_time === 'string' ? e.end_time : null,
        repeats: (e.repeats as AppleOp['repeats']) ?? null,
        text: typeof e.text === 'string' ? e.text : null,
        strength: e.strength === 'hard' || e.strength === 'soft' ? e.strength : null,
      };
    });
  return { ops, preprocessed, raw };
}
