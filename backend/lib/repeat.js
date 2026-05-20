const BUFFER_MINUTES = 5;
const REPEAT_HORIZON_DAYS = 30;
const MINUTES_IN_DAY = 1440;

function dateKeyUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Mirrors src/features/todo/types.ts expandRepeatDates, but uses UTC math so
// it's stable regardless of server timezone. Date strings are YYYY-MM-DD
// calendar dates — no time component.
function expandRepeatDates(startKey, rule, horizonDays = REPEAT_HORIZON_DAYS) {
  if (rule === 'none') return [startKey];
  const [y, m, d] = startKey.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const out = [];
  for (let i = 0; i < horizonDays; i++) {
    const cur = new Date(start.getTime() + i * 86400000);
    if (rule === 'daily') {
      out.push(dateKeyUTC(cur));
    } else if (rule === 'weekdays') {
      const dow = cur.getUTCDay();
      if (dow >= 1 && dow <= 5) out.push(dateKeyUTC(cur));
    } else if (rule === 'weekly') {
      if (i % 7 === 0) out.push(dateKeyUTC(cur));
    }
  }
  return out;
}

// Earliest start time at/after `desired` that leaves BUFFER_MINUTES gap to
// every other task on the same date. Falls back to `desired` if nothing fits.
function resolveConflict(desired, duration, date, tasks, excludeId = null) {
  const sameDay = (tasks || [])
    .filter((t) => t.date === date && t.id !== excludeId)
    .sort((a, b) => a.time_minutes - b.time_minutes);

  let start = desired;
  for (let i = 0; i < 50; i++) {
    let advanced = false;
    for (const t of sameDay) {
      const tEnd = t.time_minutes + t.duration_minutes;
      const myEnd = start + duration;
      const overlap = start < tEnd + BUFFER_MINUTES && myEnd + BUFFER_MINUTES > t.time_minutes;
      if (overlap) {
        start = tEnd + BUFFER_MINUTES;
        advanced = true;
      }
    }
    if (!advanced) break;
  }
  if (start + duration > MINUTES_IN_DAY - 1) return desired;
  return start;
}

// Return the tasks on `date` whose time window overlaps [desired, desired+duration).
// Does NOT mutate anything — used to surface conflicts to the model so it can
// describe them to the user. Newly-created tasks land at the requested time
// even when there's an overlap; the user, not the backend, decides whether
// to keep, move, or delete the conflicting task.
function findOverlaps(desired, duration, date, tasks, excludeId = null) {
  const myEnd = desired + duration;
  return (tasks || [])
    .filter((t) => t.date === date && t.id !== excludeId)
    .filter((t) => {
      const tEnd = t.time_minutes + t.duration_minutes;
      return desired < tEnd && myEnd > t.time_minutes;
    })
    .sort((a, b) => a.time_minutes - b.time_minutes);
}

module.exports = {
  BUFFER_MINUTES,
  REPEAT_HORIZON_DAYS,
  expandRepeatDates,
  resolveConflict,
  findOverlaps,
};
