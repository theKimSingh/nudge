import { Platform } from 'react-native';
import Constants from 'expo-constants';

const BACKEND_PORT = 8000;

/**
 * Lazy resolver — throws inside the call site, not at module load, so the app
 * still boots when EXPO_PUBLIC_BACKEND_URL isn't set (e.g. on a physical device).
 * Only the network call fails, with a clear message.
 *
 * Resolution order:
 *   1. EXPO_PUBLIC_BACKEND_URL env override (always wins)
 *   2. Expo dev-server hostUri — canonical LAN IP for any client connecting
 *      to this Metro instance. Works for both sim and real-device Expo Go,
 *      so we don't rely on the unreliable `Constants.isDevice` check.
 *   3. Simulator/emulator loopback fallbacks
 *   4. Throw with a hint
 */
export function getBackendUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl) return envUrl;

  // Prefer Metro's host. `hostUri` looks like "192.168.1.10:8081" — strip the
  // bundler port and use BACKEND_PORT. This is the only signal that's correct
  // for Expo Go on a real device (Constants.isDevice has been unreliable).
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { manifest?: { debuggerHost?: string } }).manifest
      ?.debuggerHost ??
    null;
  if (hostUri) {
    const host = String(hostUri).split(':')[0];
    if (host) return `http://${host}:${BACKEND_PORT}`;
  }

  // Fallback for environments without a dev server host (release builds, etc.).
  if (Platform.OS === 'ios') return `http://localhost:${BACKEND_PORT}`;
  if (Platform.OS === 'android') return `http://10.0.2.2:${BACKEND_PORT}`;

  throw new Error(
    'Set EXPO_PUBLIC_BACKEND_URL in .env to your dev machine LAN IP (e.g. http://192.168.1.10:8000).',
  );
}
