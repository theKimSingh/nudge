create table public.agent_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  utterance_seg_id text,
  call_id text not null,
  tool_name text not null,
  inverse jsonb not null,
  label text not null,
  applied_at timestamptz not null default now(),
  undone_at timestamptz
);

alter table public.agent_journal enable row level security;

create policy "owner can read" on public.agent_journal
  for select using (auth.uid() = user_id);

create policy "owner can insert" on public.agent_journal
  for insert with check (auth.uid() = user_id);

create policy "owner can update own" on public.agent_journal
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Partial index optimises the "last N undoable entries" lookup the agent
-- runs on every turn; entries with undone_at set are excluded.
create index agent_journal_user_recent_idx
  on public.agent_journal (user_id, applied_at desc) where undone_at is null;

-- Defends against idempotent replay: a retried tool call with the same
-- (session, call) pair must collapse to a single journal row.
create unique index agent_journal_session_call_uniq
  on public.agent_journal (user_id, session_id, call_id);
