-- Profiles: one-to-one with auth.users. Captures the data collected
-- during onboarding (name, goal) plus the `onboarded` flag the router
-- uses to decide whether to send a returning user to the tabs or back
-- through onboarding.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  goal text check (goal in ('work', 'study', 'balance')),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "owner can read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "owner can insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "owner can update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "owner can delete"
  on public.profiles for delete
  using (auth.uid() = id);

-- Create the profile row only once the user has confirmed their email.
-- Supabase sets `email_confirmed_at` on auth.users when verifyOtp succeeds,
-- so the profile appears at that moment rather than at sign-up time. The
-- TG_OP='INSERT' branch handles auto-confirmed users (e.g. OAuth flows
-- where the row is created already-confirmed).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    insert into public.profiles (id) values (new.id)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh on every UPDATE.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
