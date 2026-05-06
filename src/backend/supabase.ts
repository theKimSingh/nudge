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

// SecureStore is iOS/Android only. In the browser, use localStorage so a page
// refresh keeps the Supabase session. During Expo Router's Node SSR pass,
// localStorage is unavailable, so fall back to memory.
const memoryStore = new Map<string, string>();
const browserStorage =
  typeof globalThis !== "undefined" && "localStorage" in globalThis
    ? globalThis.localStorage
    : null;

const storage =
  Platform.OS === "web"
    ? {
      getItem: async (key: string) =>
        browserStorage?.getItem(key) ?? memoryStore.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        if (browserStorage) browserStorage.setItem(key, value);
        else memoryStore.set(key, value);
      },
      removeItem: async (key: string) => {
        if (browserStorage) browserStorage.removeItem(key);
        else memoryStore.delete(key);
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
