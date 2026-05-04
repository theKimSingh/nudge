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
        timeMinutes: 9 * 60,
        durationMinutes: 60,
        done: false,
        repeat: 'none',
        color: data.events[0].color,
      },
      [date]
    );
  }
}