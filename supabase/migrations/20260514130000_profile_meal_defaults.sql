alter table public.profiles
  add column breakfast_time_minutes integer not null default 480
    check (breakfast_time_minutes >= 0 and breakfast_time_minutes < 1440),
  add column lunch_time_minutes integer not null default 750
    check (lunch_time_minutes >= 0 and lunch_time_minutes < 1440),
  add column dinner_time_minutes integer not null default 1110
    check (dinner_time_minutes >= 0 and dinner_time_minutes < 1440);
