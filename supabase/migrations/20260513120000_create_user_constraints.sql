create table public.user_constraints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  category text not null default 'other'
    check (category in ('time','avoid','prefer','energy','other')),
  strength text not null default 'soft'
    check (strength in ('hard','soft')),
  ref_count integer not null default 1,
  last_referenced_at timestamptz not null default now(),
  superseded_by uuid references public.user_constraints (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_constraints enable row level security;

create policy "owner can read"
  on public.user_constraints for select
  using (auth.uid() = user_id);

create policy "owner can insert"
  on public.user_constraints for insert
  with check (auth.uid() = user_id);

create policy "owner can update"
  on public.user_constraints for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "owner can delete"
  on public.user_constraints for delete
  using (auth.uid() = user_id);

create unique index user_constraints_user_text_category_idx
  on public.user_constraints (user_id, lower(text), category)
  where superseded_by is null;

create index user_constraints_user_recency_idx
  on public.user_constraints (user_id, last_referenced_at desc, ref_count desc)
  where superseded_by is null;

create trigger user_constraints_set_updated_at
  before update on public.user_constraints
  for each row execute function public.set_updated_at();

create or replace function public.upsert_constraint(
  p_text text,
  p_category text,
  p_strength text
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
begin
  insert into public.user_constraints (user_id, text, category, strength)
  values (auth.uid(), p_text, p_category, p_strength)
  on conflict (user_id, lower(text), category) where superseded_by is null
  do update set
    ref_count = public.user_constraints.ref_count + 1,
    last_referenced_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.get_top_constraints(p_limit int)
returns setof public.user_constraints
language sql
stable
security invoker
as $$
  select *
  from public.user_constraints
  where user_id = auth.uid() and superseded_by is null
  order by (ref_count::float
            * exp(-extract(epoch from (now() - last_referenced_at)) / (86400.0 * 14)))
           desc
  limit p_limit;
$$;

create or replace function public.bump_constraint(p_id uuid)
returns void
language sql
security invoker
as $$
  update public.user_constraints
    set ref_count = ref_count + 1,
        last_referenced_at = now()
  where id = p_id and user_id = auth.uid();
$$;

create or replace function public.evict_old_constraints(p_cap int)
returns void
language plpgsql
security invoker
as $$
begin
  delete from public.user_constraints
  where user_id = auth.uid()
    and strength = 'soft'
    and id in (
      select id
      from public.user_constraints
      where user_id = auth.uid()
        and strength = 'soft'
        and superseded_by is null
      order by (ref_count::float
                * exp(-extract(epoch from (now() - last_referenced_at)) / (86400.0 * 14)))
               asc
      offset p_cap
    );
end;
$$;
