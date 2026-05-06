import type { MarkedDates } from './calendar-parser';
import type { TasksContextValue } from '@/src/features/todo/context/tasks-context';

export function importICSAsTasks(
  marked: MarkedDates,
  addTaskSeries: TasksContextValue['addTaskSeries']
) {
  for (const [date, data] of Object.entries(marked)) {
    addTaskSeries(
      {
        title: data.events[0].title,
        time_minutes: 9 * 60,
        duration_minutes: 60,
        done: false,
        repeat_rule: 'none',
        color: data.events[0].color,
        source: 'calendar_import',
      },
      [date]
    );
  }
}