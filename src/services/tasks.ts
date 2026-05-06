import { supabase } from '@/supabase/supabase';
import type { Database } from '@/src/types/database';

type Task = Database['public']['Tables']['tasks']['Row'];

export async function fetchTasksForDateRange(from: string, to: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })
    .order('time_minutes', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createTask(
  task: Omit<Task, 'id' | 'created_at' | 'updated_at'>
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select()
    .single();

  if (error) throw error;
  return data!;
}

export async function createTaskBatch(
  tasks: Omit<Task, 'id' | 'created_at' | 'updated_at'>[]
): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .insert(tasks)
    .select();

  if (error) throw error;
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
    .single();

  if (error) throw error;
  return data!;
}

export async function toggleTask(id: string, done: boolean): Promise<Task> {
  return updateTask(id, { done });
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function deleteTasksBySeriesId(seriesId: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('series_id', seriesId);

  if (error) throw error;
}
