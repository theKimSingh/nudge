import { supabase } from "./supabase";

import type { Goal } from "./onboarding-auth";

export type Profile = {
  id: string;
  name: string;
  goal: Goal | null;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
};

const PROFILE_COLUMNS = "id, name, goal, onboarded, created_at, updated_at";

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
  patch: Partial<Pick<Profile, "name" | "goal" | "onboarded">>,
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
