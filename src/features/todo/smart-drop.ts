import {
  BUFFER_MINUTES,
  MAX_START_MINUTES,
  SECTION_ANCHOR_MINUTES,
  type Task,
  type TaskSection,
} from './types';

/**
 * Recompute start times within a section after a drop.
 *
 * Strategy:
 *  - Position 0: the dropped task starts at the section anchor (e.g. 7am).
 *  - Position n>0: the dropped task starts at prev.end + BUFFER.
 *  - All subsequent tasks cascade forward only if they would collide.
 *  - Times are clamped at MAX_START_MINUTES (23:45) to avoid wrapping past midnight.
 *
 * The dropped task's index in `sectionTasks` reflects its post-drop position.
 */
export function rescheduleSection(
  sectionTasks: Task[],
  section: TaskSection,
  droppedIndex: number,
): Task[] {
  if (sectionTasks.length === 0) return [];

  const result = [...sectionTasks];

  let newStart: number;
  if (droppedIndex === 0) {
    newStart = SECTION_ANCHOR_MINUTES[section];
  } else {
    const prev = result[droppedIndex - 1];
    newStart = prev.timeMinutes + prev.durationMinutes + BUFFER_MINUTES;
  }
  newStart = Math.min(newStart, MAX_START_MINUTES);
  result[droppedIndex] = { ...result[droppedIndex], timeMinutes: newStart };

  for (let i = droppedIndex + 1; i < result.length; i++) {
    const prev = result[i - 1];
    const earliest = prev.timeMinutes + prev.durationMinutes + BUFFER_MINUTES;
    if (result[i].timeMinutes < earliest) {
      result[i] = {
        ...result[i],
        timeMinutes: Math.min(earliest, MAX_START_MINUTES),
      };
    }
  }

  return result;
}
