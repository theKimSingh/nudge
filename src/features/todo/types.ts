export type TaskSection = 'morning' | 'afternoon' | 'evening';
export type RepeatRule = 'none' | 'daily' | 'weekdays' | 'weekly';

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  date: string; // YYYY-MM-DD
  time_minutes: number;
  duration_minutes: number;
  done: boolean;
  repeat_rule: RepeatRule;
  series_id?: string | null;
  color?: string | null;
  source: 'todo_list' | 'calendar_import';
  created_at: string;
  updated_at: string;
};

export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const SECTION_ORDER: TaskSection[] = ['morning', 'afternoon', 'evening'];

export const SECTION_LABELS: Record<TaskSection, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

export const REPEAT_LABELS: Record<RepeatRule, string> = {
  none: 'Never',
  daily: 'Daily',
  weekdays: 'Weekdays',
  weekly: 'Weekly',
};

export const DURATION_OPTIONS_MINUTES: number[] = [15, 30, 45, 60, 90, 120, 180];

export const REPEAT_HORIZON_DAYS = 365;

export function expandRepeatDates(
  startKey: string,
  rule: RepeatRule,
  horizonDays: number = REPEAT_HORIZON_DAYS,
): string[] {
  if (rule === 'none') return [startKey];

  const [y, m, d] = startKey.split('-').map(Number);
  const start = new Date(y, m - 1, d);

  const out: string[] = [];
  for (let i = 0; i < horizonDays; i++) {
    const cur = new Date(start);
    cur.setDate(start.getDate() + i);

    if (rule === 'daily') {
      out.push(dateKey(cur));
    } else if (rule === 'weekdays') {
      const dow = cur.getDay();
      if (dow >= 1 && dow <= 5) out.push(dateKey(cur));
    } else if (rule === 'weekly') {
      if (i % 7 === 0) out.push(dateKey(cur));
    }
  }
  return out;
}

export const BUFFER_MINUTES = 15;
export const MAX_START_MINUTES = 23 * 60 + 45;

export const SECTION_ANCHOR_MINUTES: Record<TaskSection, number> = {
  morning: 7 * 60,
  afternoon: 13 * 60,
  evening: 18 * 60,
};

export function deriveSection(timeMinutes: number): TaskSection {
  if (timeMinutes < 12 * 60) return 'morning';
  if (timeMinutes < 18 * 60) return 'afternoon';
  return 'evening';
}

export function formatTimeDisplay(timeMinutes: number): string {
  const total = ((timeMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

export function formatTimeRange(timeMinutes: number, durationMinutes: number): string {
  return `${formatTimeDisplay(timeMinutes)} - ${formatTimeDisplay(timeMinutes + durationMinutes)}`;
}

export function formatDurationShort(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = minutes / 60;
  if (Number.isInteger(h)) return `${h}h`;
  return `${h.toFixed(1).replace('.0', '')}h`;
}

export function dateToMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function minutesToDate(timeMinutes: number, base: Date = new Date()): Date {
  const d = new Date(base);
  d.setHours(Math.floor(timeMinutes / 60));
  d.setMinutes(timeMinutes % 60);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}
