create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  date date not null,
  time_minutes integer not null check (time_minutes >= 0 and time_minutes < 1440),
  duration_minutes integer not null check (duration_minutes > 0),
  repeat_rule text not null default 'none'
    check (repeat_rule in ('none', 'daily', 'weekdays', 'weekly')),
  series_id uuid,
  done boolean not null default false,
  color text,
  source text not null default 'todo_list'
    check (source in ('todo_list', 'calendar_import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "owner can read"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "owner can insert"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "owner can update"
  on public.tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "owner can delete"
  on public.tasks for delete
  using (auth.uid() = user_id);

create index tasks_user_date_idx
  on public.tasks (user_id, date, time_minutes);

create index tasks_user_series_idx
  on public.tasks (user_id, series_id)
  where series_id is not null;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();
