import { supabase } from "./supabase";

import type { Goal } from "./onboarding-auth";

export type Profile = {
  id: string;
  name: string;
  goal: Goal | null;
  onboarded: boolean;
  // Meal defaults — minutes-from-midnight (0..1439). SQL defaults 480/750/1110.
  breakfast_time_minutes?: number;
  lunch_time_minutes?: number;
  dinner_time_minutes?: number;
  // Day-section anchors — when morning/afternoon/evening start. SQL defaults
  // 420/780/1080 (7am / 1pm / 6pm).
  morning_start_minutes?: number;
  afternoon_start_minutes?: number;
  evening_start_minutes?: number;
  created_at: string;
  updated_at: string;
};

export type ProfilePatch = Partial<
  Pick<
    Profile,
    | "name"
    | "goal"
    | "onboarded"
    | "breakfast_time_minutes"
    | "lunch_time_minutes"
    | "dinner_time_minutes"
    | "morning_start_minutes"
    | "afternoon_start_minutes"
    | "evening_start_minutes"
  >
>;

const PROFILE_COLUMNS =
  "id, name, goal, onboarded, breakfast_time_minutes, lunch_time_minutes, dinner_time_minutes, morning_start_minutes, afternoon_start_minutes, evening_start_minutes, created_at, updated_at";

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function updateProfile(
  userId: string,
  patch: ProfilePatch,
): Promise<Profile> {
  const { data } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select(PROFILE_COLUMNS)
    .single()
    .throwOnError();
  return data as Profile;
}
