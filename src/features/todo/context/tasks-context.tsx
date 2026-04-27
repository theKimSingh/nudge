import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

import { dateKey, type Task } from '../types';

type TaskTemplate = Omit<Task, 'id' | 'date' | 'seriesId'>;

type TasksContextValue = {
  tasks: Task[];
  addTaskInstance: (task: Omit<Task, 'id'>) => void;
  addTaskSeries: (template: TaskTemplate, dates: string[]) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  editTask: (id: string, patch: Partial<Omit<Task, 'id'>>) => void;
  replaceTasksForDate: (date: string, nextDayTasks: Task[]) => void;
};

const TasksContext = createContext<TasksContextValue | null>(null);

const TODAY = dateKey(new Date());

const SEED_TASKS: Task[] = [
  {
    id: 'seed-1',
    title: 'Read the design doc',
    date: TODAY,
    timeMinutes: 7 * 60 + 30,
    durationMinutes: 30,
    done: false,
    repeat: 'none',
  },
  {
    id: 'seed-2',
    title: 'CSE 480',
    date: TODAY,
    timeMinutes: 9 * 60,
    durationMinutes: 15,
    done: true,
    repeat: 'none',
  },
  {
    id: 'seed-3',
    title: 'Lunch',
    date: TODAY,
    timeMinutes: 13 * 60,
    durationMinutes: 60,
    done: false,
    repeat: 'none',
  },
  {
    id: 'seed-4',
    title: 'Gym — leg day',
    date: TODAY,
    timeMinutes: 16 * 60 + 30,
    durationMinutes: 90,
    done: false,
    repeat: 'weekdays',
  },
  {
    id: 'seed-5',
    title: 'Cook dinner',
    date: TODAY,
    timeMinutes: 19 * 60,
    durationMinutes: 45,
    done: false,
    repeat: 'daily',
  },
];

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);

  const value = useMemo<TasksContextValue>(
    () => ({
      tasks,
      addTaskInstance: (task) =>
        setTasks((cur) => [...cur, { ...task, id: nextId('t') }]),
      addTaskSeries: (template, dates) =>
        setTasks((cur) => {
          if (dates.length === 0) return cur;
          const seriesId = nextId('s');
          const additions: Task[] = dates.map((d, i) => ({
            ...template,
            id: `${seriesId}-${i}`,
            seriesId,
            date: d,
          }));
          return [...cur, ...additions];
        }),
      toggleTask: (id) =>
        setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, done: !t.done } : t))),
      deleteTask: (id) => setTasks((cur) => cur.filter((t) => t.id !== id)),
      editTask: (id, patch) =>
        setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t))),
      replaceTasksForDate: (date, nextDayTasks) =>
        setTasks((cur) => [...cur.filter((t) => t.date !== date), ...nextDayTasks]),
    }),
    [tasks],
  );

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used within TasksProvider');
  return ctx;
}
