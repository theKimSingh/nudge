create or replace function public.routine_duration_stats(p_user uuid)
returns table(norm_title text, median_duration int, n int)
language sql stable security invoker as $$
  with norm as (
    select regexp_replace(lower(title), '[^a-z0-9]+', ' ', 'g') as t, duration_minutes
    from public.tasks where user_id = p_user
  ), tokens as (
    select trim(regexp_replace(t, '\s+(the|a|to|go|sesh|session|class|practice)\s+', ' ', 'g')) as t,
           duration_minutes
    from norm
  )
  select t, percentile_cont(0.5) within group (order by duration_minutes)::int, count(*)::int
  from tokens
  where length(t) > 1
  group by t
  having count(*) >= 2
  order by count(*) desc
  limit 50;
$$;
