import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!url || !anonKey) {
  console.warn(
    "Supabase env vars missing — copy .env.example to .env and fill in EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

// SecureStore is iOS/Android only. On web (and during Expo Router's Node SSR
// pass at `expo start`), fall back to an in-memory adapter so import-time
// session recovery doesn't crash.
const memoryStore = new Map<string, string>();

const storage =
  Platform.OS === "web"
    ? {
      getItem: async (key: string) => memoryStore.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        memoryStore.set(key, value);
      },
      removeItem: async (key: string) => {
        memoryStore.delete(key);
      },
    }
    : {
      getItem: (key: string) => SecureStore.getItemAsync(key),
      setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key),
    };

export const supabase = createClient(url, anonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const isSupabaseConfigured = Boolean(url && anonKey);
