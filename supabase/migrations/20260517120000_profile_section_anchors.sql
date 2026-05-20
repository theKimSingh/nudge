-- Per-user day-section anchors. Mirrors the meal-time pattern at
-- supabase/migrations/20260514130000_profile_meal_defaults.sql. Defaults
-- match the frontend SECTION_ANCHOR_MINUTES constant in
-- src/features/todo/types.ts (7:00 / 13:00 / 18:00) so existing rows pick
-- up sensible values without any frontend change.
alter table public.profiles
  add column morning_start_minutes integer not null default 420
    check (morning_start_minutes >= 0 and morning_start_minutes < 1440),
  add column afternoon_start_minutes integer not null default 780
    check (afternoon_start_minutes >= 0 and afternoon_start_minutes < 1440),
  add column evening_start_minutes integer not null default 1080
    check (evening_start_minutes >= 0 and evening_start_minutes < 1440);
