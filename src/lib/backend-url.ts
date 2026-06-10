import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

const BACKEND_PORT = 8000;

const LOOPBACK = new Set(['localhost', '127.0.0.1']);

/**
 * Pull the dev machine's LAN host (where Metro — and therefore the backend —
 * runs) straight from the running dev session, so the whole team auto-connects
 * with zero per-machine config. Two sources, in order:
 *   a) Expo manifest `hostUri` ("192.168.1.10:8081") — present in Expo Go and
 *      some dev clients.
 *   b) The RN bundle URL (`SourceCode.scriptURL`,
 *      "http://192.168.1.10:8081/index.bundle?…") — the reliable signal in a
 *      dev client on a physical device, where `hostUri` is usually null.
 * Loopback hosts are skipped here so simulators fall through to the explicit
 * loopback fallback below (where localhost correctly means the host machine).
 */
// Extract a bare host from either a URL ("http://192.168.1.10:8081/…",
// "exp://192.168.1.10:8081") or a "host:port" string.
function extractHost(value: string | null | undefined): string | null {
  if (!value) return null;
  const withScheme = value.match(/^[a-z]+:\/\/([^/:?]+)/i);
  if (withScheme?.[1]) return withScheme[1];
  const bare = value.split(/[:/?]/)[0];
  return bare || null;
}

function metroHost(): string | null {
  const c = Constants as unknown as {
    expoGoConfig?: { debuggerHost?: string };
    manifest?: { debuggerHost?: string; hostUri?: string; bundleUrl?: string };
    manifest2?: {
      extra?: { expoClient?: { hostUri?: string } };
      launchAsset?: { url?: string };
    };
    linkingUri?: string;
  };

  // Every place Metro's host can surface across Expo Go, dev clients, classic
  // bridge, and bridgeless new-arch. We don't know which is populated in a given
  // runtime, so try them all and take the first non-loopback host.
  let getDevServerUrl: string | undefined;
  try {
    // RN's own dev-server lookup — the reliable source under bridgeless, where
    // NativeModules.SourceCode is undefined.
    getDevServerUrl = require('react-native/Libraries/Core/Devtools/getDevServer').default?.()?.url;
  } catch {
    // not available (e.g. release build)
  }

  const candidates: (string | null | undefined)[] = [
    Constants.expoConfig?.hostUri,
    c.manifest2?.extra?.expoClient?.hostUri,
    c.manifest2?.launchAsset?.url,
    c.expoGoConfig?.debuggerHost,
    c.manifest?.hostUri,
    c.manifest?.debuggerHost,
    c.manifest?.bundleUrl,
    (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode
      ?.scriptURL,
    getDevServerUrl,
  ];

  if (__DEV__) {
    console.log('[backend-url] host candidates:', JSON.stringify(candidates));
  }

  for (const raw of candidates) {
    const host = extractHost(raw);
    if (host && !LOOPBACK.has(host)) return host;
  }
  return null;
}

/**
 * Lazy resolver — throws inside the call site, not at module load, so the app
 * still boots when no host can be resolved. Only the network call fails, with a
 * clear message.
 *
 * Resolution order:
 *   1. EXPO_PUBLIC_BACKEND_URL env override (set only when the backend runs on a
 *      different host than Metro; normally leave unset so the team auto-derives)
 *   2. Metro dev-server LAN host (see metroHost) — auto-detected every launch
 *   3. Simulator/emulator loopback fallbacks
 *   4. Throw with a hint
 */
export function getBackendUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl) return envUrl;

  const host = metroHost();
  if (host) return `http://${host}:${BACKEND_PORT}`;

  // Fallback for environments without a dev server host (release builds, etc.).
  if (Platform.OS === 'ios') return `http://localhost:${BACKEND_PORT}`;
  if (Platform.OS === 'android') return `http://10.0.2.2:${BACKEND_PORT}`;

  throw new Error(
    'Set EXPO_PUBLIC_BACKEND_URL in .env to your dev machine LAN IP (e.g. http://192.168.1.10:8000).',
  );
}
