import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { dateKey, type Task } from '../types';
import {
  fetchTasksForDateRange,
  createTask,
  createTaskBatch,
  updateTask,
  toggleTask as toggleTaskService,
  deleteTask as deleteTaskService,
} from '@/src/services/tasks';
import { supabase } from '@/supabase/supabase';

type TaskTemplate = Omit<Task, 'id' | 'date' | 'series_id' | 'user_id' | 'created_at' | 'updated_at'>;

export type TasksContextValue = {
  tasks: Task[];
  loading: boolean;
  addTaskInstance: (task: Omit<TaskTemplate, 'source'> & { date: string; source?: 'todo_list' | 'calendar_import' }) => Promise<void>;
  addTaskSeries: (template: Omit<TaskTemplate, 'source'> & { source?: 'todo_list' | 'calendar_import' }, dates: string[]) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  editTask: (id: string, patch: Partial<Omit<TaskTemplate, 'source'>>) => Promise<void>;
  replaceTasksForDate: (date: string, nextDayTasks: Task[]) => Promise<void>;
};

const TasksContext = createContext<TasksContextValue | null>(null);

const TODAY = dateKey(new Date());

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Load initial tasks on mount
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.user?.id) {
          setLoading(false);
          return;
        }

        const endDate = new Date(TODAY);
        endDate.setDate(endDate.getDate() + 90);
        const endDateStr = dateKey(endDate);

        const fetchedTasks = await fetchTasksForDateRange(TODAY, endDateStr);
        setTasks(fetchedTasks);
      } catch (err) {
        console.error('Failed to load tasks:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Subscribe to realtime changes
  useEffect(() => {
    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTasks((cur) => [...cur, payload.new as Task]);
          } else if (payload.eventType === 'UPDATE') {
            setTasks((cur) =>
              cur.map((t) => (t.id === payload.new.id ? (payload.new as Task) : t))
            );
          } else if (payload.eventType === 'DELETE') {
            setTasks((cur) => cur.filter((t) => t.id !== payload.old.id));
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
        try {
          const { data } = await supabase.auth.getSession();
          if (!data.session?.user?.id) throw new Error('Not authenticated');

          await createTask({
            ...task,
            user_id: data.session.user.id,
            source: 'todo_list',
          } as any);
        } catch (e) {
          console.error('addTaskInstance failed:', e);
          throw e;
        }
      },

      addTaskSeries: async (template, dates) => {
        try {
          const { data } = await supabase.auth.getSession();
          if (!data.session?.user?.id) throw new Error('Not authenticated');

          const seriesId = uuidv4();
          const newTasks = dates.map((date) => ({
            ...template,
            date,
            seriesId,
            user_id: data.session.user.id,
            source: 'todo_list',
          } as any));

          await createTaskBatch(newTasks);
        } catch (e) {
          console.error('addTaskSeries failed:', e);
          throw e;
        }
      },

      toggleTask: async (id) => {
        try {
          const task = tasks.find((t) => t.id === id);
          if (!task) return;
          await toggleTaskService(id, !task.done);
        } catch (e) {
          console.error('toggleTask failed:', e);
          throw e;
        }
      },

      deleteTask: async (id) => {
        try {
          await deleteTaskService(id);
        } catch (e) {
          console.error('deleteTask failed:', e);
          throw e;
        }
      },

      editTask: async (id, patch) => {
        try {
          await updateTask(id, patch as any);
        } catch (e) {
          console.error('editTask failed:', e);
          throw e;
        }
      },

      replaceTasksForDate: async (date, nextDayTasks) => {
        try {
          const { data } = await supabase.auth.getSession();
          if (!data.session?.user?.id) throw new Error('Not authenticated');

          const existingForDate = tasks.filter((t) => t.date === date);
          for (const task of existingForDate) {
            await deleteTaskService(task.id);
          }

          const newTasks = nextDayTasks.map((task) => ({
            ...task,
            user_id: data.session.user.id,
            source: 'todo_list',
          } as any));

          if (newTasks.length > 0) {
            await createTaskBatch(newTasks);
          }
        } catch (e) {
          console.error('replaceTasksForDate failed:', e);
          throw e;
        }
      },
    }),
    [tasks, loading],
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