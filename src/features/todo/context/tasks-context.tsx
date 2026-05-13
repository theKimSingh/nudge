import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { REPEAT_HORIZON_DAYS, dateKey, type Task } from '../types';
import {
  fetchTasksForDateRange,
  createTask,
  createTaskBatch,
  updateTask,
  toggleTask as toggleTaskService,
  deleteTask as deleteTaskService,
  deleteTasksBySeriesId,
} from '../api/tasks';
import { supabase } from '@/src/backend/supabase';

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type TaskTemplate = Omit<
  Task,
  'id' | 'date' | 'series_id' | 'user_id' | 'created_at' | 'updated_at'
>;

export type TasksContextValue = {
  tasks: Task[];
  loading: boolean;
  addTaskInstance: (
    task: Omit<TaskTemplate, 'source'> & {
      date: string;
      source?: 'todo_list' | 'calendar_import';
    }
  ) => Promise<void>;
  addTaskSeries: (
    template: Omit<TaskTemplate, 'source'> & {
      source?: 'todo_list' | 'calendar_import';
    },
    dates: string[]
  ) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  deleteTaskSeries: (seriesId: string, fromDate?: string) => Promise<void>;
  editTask: (
    id: string,
    patch: Partial<Omit<TaskTemplate, 'source'>>
  ) => Promise<void>;
  replaceTasksForDate: (date: string, nextDayTasks: Task[]) => Promise<void>;
};

const TasksContext = createContext<TasksContextValue | null>(null);

const TODAY = dateKey(new Date());

function mergeTask(cur: Task[], task: Task): Task[] {
  return cur.some((t) => t.id === task.id)
    ? cur.map((t) => (t.id === task.id ? task : t))
    : [...cur, task];
}

function toTaskInsert(task: Task) {
  return {
    title: task.title,
    description: task.description ?? null,
    date: task.date,
    time_minutes: task.time_minutes,
    duration_minutes: task.duration_minutes,
    repeat_rule: task.repeat_rule,
    series_id: task.series_id ?? null,
    done: task.done,
    color: task.color ?? null,
    source: task.source,
  };
}

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  const requireSession = async () => {
    const userId = session?.user?.id;

    if (userId) {
      return userId;
    }

    const { data } = await supabase.auth.getSession();
    setSession(data.session ?? null);

    const refreshedUserId = data.session?.user?.id;
    if (!refreshedUserId) {
      throw new Error('User not logged in');
    }

    return refreshedUserId;
  };

  /**
   * Load initial session + tasks
   */
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        const currentSession = data.session ?? null;
        setSession(currentSession);

        if (!currentSession?.user?.id) {
          setTasks([]);
          setLoading(false);
          return;
        }

        const endDate = new Date(TODAY);
        endDate.setDate(endDate.getDate() + REPEAT_HORIZON_DAYS);

        const fetchedTasks = await fetchTasksForDateRange(
          currentSession.user.id,
          TODAY,
          dateKey(endDate)
        );

        setTasks(fetchedTasks);
      } catch (err) {
        console.error('Failed to load tasks:', err);
      } finally {
        setLoading(false);
      }
    }

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);

        if (newSession?.user?.id) {
          const endDate = new Date(TODAY);
          endDate.setDate(endDate.getDate() + REPEAT_HORIZON_DAYS);

          const fetchedTasks = await fetchTasksForDateRange(
            newSession.user.id,
            TODAY,
            dateKey(endDate)
          );

          setTasks(fetchedTasks);
        } else {
          setTasks([]);
        }
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  /**
   * realtime sync
   */
  useEffect(() => {
    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTasks((cur) => mergeTask(cur, payload.new as Task));
          } else if (payload.eventType === 'UPDATE') {
            setTasks((cur) =>
              cur.map((t) =>
                t.id === payload.new.id ? (payload.new as Task) : t
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setTasks((cur) =>
              cur.filter((t) => t.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const value = useMemo<TasksContextValue>(
    () => ({
      tasks,
      loading,

      addTaskInstance: async (task) => {
        const userId = await requireSession();

        const created = await createTask(userId, task);
        setTasks((cur) => mergeTask(cur, created));
      },

      addTaskSeries: async (template, dates) => {
        const userId = await requireSession();

        const seriesId = uuidv4();

        const newTasks = dates.map((date) => ({
          ...template,
          date,
          series_id: seriesId,
        }));

        const created = await createTaskBatch(userId, newTasks);
        setTasks((cur) => created.reduce(mergeTask, cur));
      },

      toggleTask: async (id) => {
        const userId = await requireSession();

        let previousTask: Task | undefined;
        let nextDone: boolean | undefined;

        setTasks((cur) =>
          cur.map((task) => {
            if (task.id !== id) return task;

            previousTask = task;
            nextDone = !task.done;
            return { ...task, done: nextDone };
          })
        );

        if (!previousTask || nextDone === undefined) return;

        const rollbackTask = previousTask;

        try {
          const updated = await toggleTaskService(userId, id, nextDone);
          setTasks((cur) => mergeTask(cur, updated));
        } catch (err) {
          setTasks((cur) => mergeTask(cur, rollbackTask));
          throw err;
        }
      },

      deleteTask: async (id) => {
        const userId = await requireSession();
        await deleteTaskService(userId, id);
        setTasks((cur) => cur.filter((t) => t.id !== id));
      },

      deleteTaskSeries: async (seriesId, fromDate) => {
        const userId = await requireSession();
        await deleteTasksBySeriesId(userId, seriesId, fromDate);
        setTasks((cur) =>
          cur.filter((t) => {
            if (t.series_id !== seriesId) return true;
            return fromDate ? t.date < fromDate : false;
          }),
        );
      },

      editTask: async (id, patch) => {
        const userId = await requireSession();
        const updated = await updateTask(userId, id, patch as any);
        setTasks((cur) => mergeTask(cur, updated));
      },

      replaceTasksForDate: async (date, nextDayTasks) => {
        const userId = await requireSession();

        const existing = tasks.filter((t) => t.date === date);

        for (const t of existing) {
          await deleteTaskService(userId, t.id);
        }

        if (nextDayTasks.length) {
          const created = await createTaskBatch(
            userId,
            nextDayTasks.map(toTaskInsert)
          );
          setTasks((cur) => [
            ...cur.filter((t) => t.date !== date),
            ...created,
          ]);
        } else {
          setTasks((cur) => cur.filter((t) => t.date !== date));
        }
      },
    }),
    [tasks, loading, session]
  );

  return (
    <TasksContext.Provider value={value}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used within TasksProvider');
  return ctx;
}
