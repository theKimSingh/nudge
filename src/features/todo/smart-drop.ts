import {
  BUFFER_MINUTES,
  MAX_START_MINUTES,
  SECTION_ANCHOR_MINUTES,
  type Task,
  type TaskSection,
} from './types';

// First start-minute of the *next* section. Cascading is allowed to push
// tasks up to (but not at/past) this value — beyond it, `deriveSection`
// would reclassify the task into the next section, which is rarely what
// the user intended when they reordered the source section.
const SECTION_UPPER_BOUND: Record<TaskSection, number> = {
  morning: 12 * 60,
  afternoon: 18 * 60,
  evening: 24 * 60,
};

/**
 * Recompute start times within a section after a drop.
 *
 * Strategy:
 *  - Position 0: the dropped task starts at the section anchor (e.g. 7am).
 *  - Position n>0: the dropped task starts at prev.end + BUFFER.
 *  - Subsequent tasks cascade forward ONLY if they collide with the new
 *    time. The cascade stops at the first non-colliding task (sections
 *    are sorted by time, so nothing after can collide either) AND stops
 *    early if the next push would shove a task past the section's upper
 *    bound (we'd rather accept local overlap than spill into the next
 *    section).
 *  - Times are clamped at MAX_START_MINUTES (23:45) to avoid wrapping
 *    past midnight.
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
    newStart = prev.time_minutes + prev.duration_minutes + BUFFER_MINUTES;
  }
  newStart = Math.min(newStart, MAX_START_MINUTES);
  result[droppedIndex] = { ...result[droppedIndex], time_minutes: newStart };

  const upperBound = SECTION_UPPER_BOUND[section];

  for (let i = droppedIndex + 1; i < result.length; i++) {
    const prev = result[i - 1];
    const earliest = prev.time_minutes + prev.duration_minutes + BUFFER_MINUTES;
    if (result[i].time_minutes >= earliest) {
      // No collision. Because callers sort sections by time, no later
      // task in this section can collide either.
      break;
    }
    if (earliest >= upperBound) {
      // Pushing this task further would put its start at/past the next
      // section. Stop here; the user can resolve the overlap manually.
      break;
    }
    result[i] = {
      ...result[i],
      time_minutes: Math.min(earliest, MAX_START_MINUTES),
    };
  }

  return result;
}
