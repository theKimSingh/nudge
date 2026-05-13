import { supabase } from '@/src/backend/supabase';
import type { Database } from '@/src/types/database';

type Task = Database['public']['Tables']['tasks']['Row'];
type TaskInsert = Database['public']['Tables']['tasks']['Insert'];

/**
 * Fetch tasks in date range
 */
export async function fetchTasksForDateRange(
  userId: string,
  from: string,
  to: string
): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })
    .order('time_minutes', { ascending: true })
    .throwOnError();

  return data ?? [];
}

/**
 * Create single task
 */
export async function createTask(
  userId: string,
  task: Omit<TaskInsert, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<Task> {
  const { data } = await supabase
    .from('tasks')
    .insert({
      ...task,
      user_id: userId,
    } as any)
    .select()
    .single()
    .throwOnError();

  return data!;
}

/**
 * Batch create
 */
export async function createTaskBatch(
  userId: string,
  tasks: Omit<TaskInsert, 'id' | 'user_id' | 'created_at' | 'updated_at'>[]
): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .insert(
      tasks.map((t) => ({
        ...t,
        user_id: userId,
      }))
    )
    .select()
    .throwOnError();

  return data ?? [];
}

/**
 * Update task
 */
export async function updateTask(
  userId: string,
  id: string,
  patch: Partial<Omit<Task, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<Task> {
  const { data } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()
    .throwOnError();

  return data!;
}

/**
 * Toggle task
 */
export async function toggleTask(
  userId: string,
  id: string,
  done: boolean
): Promise<Task> {
  return updateTask(userId, id, { done });
}

/**
 * Delete task
 */
export async function deleteTask(userId: string, id: string): Promise<void> {
  const { data } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .throwOnError();

  if (!data?.length) {
    throw new Error('Task was not deleted. It may not belong to the current user.');
  }
}

/**
 * Delete series
 */
export async function deleteTasksBySeriesId(
  userId: string,
  seriesId: string
): Promise<void> {
  await supabase
    .from('tasks')
    .delete()
    .eq('series_id', seriesId)
    .eq('user_id', userId)
    .throwOnError();
}
