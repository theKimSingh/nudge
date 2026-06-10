// Loads everything the Apple FM reasoning prompt needs to schedule like the
// Qwen agent did: the user's PROFILE (day-section + meal anchor times), their
// CONSTRAINTS (rules), and the CURRENT SCHEDULE (existing tasks ±3 days, each
// tagged with a handle E1/E2… so the model can target one for UPDATE/REMOVE).
//
// Without this context the model can only "extract + create" — so "move gym to
// 7pm" becomes a NEW gym. This is the data half of the fix; apple-fm.ts renders
// it into the prompt and parses the model's operations.

import { supabase } from '@/src/backend/supabase';
import { getProfile, type Profile } from '@/src/backend/profiles';
import { fetchTasksForDateRange } from '@/src/features/todo/api/tasks';

export type ScheduleItem = {
  handle: string; // E1, E2…
  id: string; // task id — used to update/delete the row
  date: string; // YYYY-MM-DD
  time_minutes: number;
  duration_minutes: number;
  title: string;
  repeat_rule: string;
  done: boolean;
};

export type AppleConstraint = { text: string; category: string; strength: string };

export type AppleContext = {
  profile: Profile | null;
  constraints: AppleConstraint[];
  schedule: ScheduleItem[];
  /** handle (E1) → task id, for resolving update/remove targets. */
  handleToId: Record<string, string>;
};

export type Slot = { date: string; start: number; end: number };

/**
 * Slide a [start, start+duration) interval forward past any overlapping slots on
 * the same date, returning the first non-conflicting start (minutes). This is
 * what makes "right after class" land correctly even when the model places the
 * new event ON TOP of class — and prevents double-booking in general.
 */
export function slidePastConflicts(
  date: string,
  start: number,
  duration: number,
  occupied: Slot[],
): number {
  let s = start;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 40) {
    changed = false;
    for (const o of occupied) {
      if (o.date !== date) continue;
      if (s < o.end && s + duration > o.start) {
        s = o.end; // collide → move to just after this slot
        changed = true;
      }
    }
  }
  if (s + duration > 1439) s = Math.max(0, 1439 - duration); // don't run past midnight
  return s;
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function loadAppleContext(
  userId: string,
  date: string,
): Promise<AppleContext> {
  const from = addDays(date, -3);
  const to = addDays(date, 3);

  const [profile, tasks, constraintsRes] = await Promise.all([
    getProfile(userId).catch(() => null),
    fetchTasksForDateRange(userId, from, to).catch(() => []),
    supabase.rpc('get_top_constraints', { p_limit: 50 }),
  ]);

  // Stable order (date, then time) → stable E-handles the model can reference.
  const sorted = [...tasks].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time_minutes - b.time_minutes,
  );
  // Collapse each recurring SERIES to a single representative (its earliest
  // instance in the window) so a daily task is one handle, not 7 — otherwise the
  // model sees "Gym" 7× and can't target it cleanly for an update.
  const seenSeries = new Set<string>();
  const deduped = sorted.filter((t) => {
    if (!t.series_id) return true;
    if (seenSeries.has(t.series_id)) return false;
    seenSeries.add(t.series_id);
    return true;
  });
  const schedule: ScheduleItem[] = deduped.map((t, i) => ({
    handle: `E${i + 1}`,
    id: t.id,
    date: t.date,
    time_minutes: t.time_minutes,
    duration_minutes: t.duration_minutes,
    title: t.title,
    repeat_rule: t.repeat_rule,
    done: t.done,
  }));
  const handleToId = Object.fromEntries(schedule.map((s) => [s.handle, s.id]));

  const constraints: AppleConstraint[] = (
    (constraintsRes.data as { text: string; category: string; strength: string }[] | null) ?? []
  ).map((c) => ({ text: c.text, category: c.category, strength: c.strength }));

  return { profile, constraints, schedule, handleToId };
}
