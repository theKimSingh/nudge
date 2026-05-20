/**
 * Shared time helpers used by the onboarding meal-rhythm screen and the
 * agent overlay. Times are stored as integer minutes-from-midnight
 * (0..1439) but presented to the user in 12-hour AM/PM form.
 */

export type AmPm = 'AM' | 'PM';

export type HourMinAmPm = {
  hour12: number; // 1..12
  minute: number; // 0..59
  ampm: AmPm;
};

export function clampToDay(m: number): number {
  if (!Number.isFinite(m)) return 0;
  const i = Math.trunc(m);
  if (i < 0) return 0;
  if (i > 1439) return 1439;
  return i;
}

export function minutesToHHMM(m: number): string {
  const c = clampToDay(m);
  const h = Math.floor(c / 60);
  const mm = c % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function minutesToAmPm(m: number): string {
  const c = clampToDay(m);
  const h24 = Math.floor(c / 60);
  const mm = c % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12raw = h24 % 12;
  const h12 = h12raw === 0 ? 12 : h12raw;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return 0;
  const h = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return 0;
  return clampToDay(h * 60 + mm);
}

/**
 * Convert minutes-from-midnight (0..1439) into 12-hour AM/PM components.
 *  - 0    -> { hour12: 12, minute: 0,  ampm: 'AM' }
 *  - 480  -> { hour12: 8,  minute: 0,  ampm: 'AM' }
 *  - 720  -> { hour12: 12, minute: 0,  ampm: 'PM' }
 *  - 750  -> { hour12: 12, minute: 30, ampm: 'PM' }
 *  - 1110 -> { hour12: 6,  minute: 30, ampm: 'PM' }
 */
export function minutesToHourMinAmPm(m: number): HourMinAmPm {
  const total = clampToDay(m);
  const hour24 = Math.floor(total / 60);
  const minute = total % 60;
  const ampm: AmPm = hour24 < 12 ? 'AM' : 'PM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute, ampm };
}

/**
 * Convert 12-hour AM/PM components back into minutes-from-midnight (0..1439).
 * Out-of-range inputs are clamped/wrapped sensibly.
 */
export function hourMinAmPmToMinutes(
  hour12: number,
  minute: number,
  ampm: AmPm,
): number {
  let h = Math.trunc(hour12);
  if (!Number.isFinite(h)) h = 12;
  // Normalize hour into 1..12.
  h = (((h - 1) % 12) + 12) % 12 + 1;
  let mm = Math.trunc(minute);
  if (!Number.isFinite(mm)) mm = 0;
  if (mm < 0) mm = 0;
  if (mm > 59) mm = 59;
  let hour24 = h % 12; // 12 -> 0, 1..11 -> 1..11
  if (ampm === 'PM') hour24 += 12;
  return clampToDay(hour24 * 60 + mm);
}

/**
 * Format minutes-from-midnight as a human-friendly "h:mm AM/PM" string.
 * Equivalent to {@link minutesToAmPm}; exposed under this name so the
 * onboarding screen and agent overlay reference the same canonical export.
 */
export function formatHHMMAmPm(m: number): string {
  return minutesToAmPm(m);
}
