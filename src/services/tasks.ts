import { supabase } from '@/supabase/supabase';
import type { Database } from '@/src/types/database';

type Task = Database['public']['Tables']['tasks']['Row'];
type TaskInsert = Database['public']['Tables']['tasks']['Insert'];

export async function fetchTasksForDateRange(from: string, to: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })
    .order('time_minutes', { ascending: true })
    .throwOnError();

  return data || [];
}

export async function createTask(
  task: Omit<TaskInsert, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<Task> {
  // RLS will automatically set user_id from JWT's auth.uid()
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...task,
      user_id: (await supabase.auth.getUser()).data.user?.id || '',
    } as any)
    .select()
    .single()
    .throwOnError();

  return data!;
}

export async function createTaskBatch(
  tasks: Omit<TaskInsert, 'id' | 'user_id' | 'created_at' | 'updated_at'>[]
): Promise<Task[]> {
  const user = (await supabase.auth.getUser()).data.user;
  const userId = user?.id || '';

  const { data, error } = await supabase
    .from('tasks')
    .insert(
      tasks.map((t) => ({
        ...t,
        user_id: userId,
      } as any))
    )
    .select()
    .throwOnError();

  return data || [];
}

export async function updateTask(
  id: string,
  patch: Partial<Omit<Task, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
    .throwOnError();

  return data!;
}

export async function toggleTask(id: string, done: boolean): Promise<Task> {
  return updateTask(id, { done });
}

export async function deleteTask(id: string): Promise<void> {
  await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .throwOnError();
}

export async function deleteTasksBySeriesId(seriesId: string): Promise<void> {
  await supabase
    .from('tasks')
    .delete()
    .eq('series_id', seriesId)
    .throwOnError();
}
