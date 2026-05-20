-- Enable Supabase Realtime delivery for tables that the backend writes to on
-- the user's behalf. Without this, /plan-day-audio writes succeed but the
-- client never gets push-notified about them.
do $$
begin
  begin
    alter publication supabase_realtime add table public.tasks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.user_constraints;
  exception when duplicate_object then null;
  end;
end $$;
