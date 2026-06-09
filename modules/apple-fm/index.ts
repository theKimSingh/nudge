// JS interface to the native AppleFm module (Apple on-device Foundation Model).
// Native impl: ios/AppleFmModule.swift. Only present in a dev/release build that
// included the module — not in Expo Go.
import { requireNativeModule } from 'expo-modules-core';

type AppleFmNative = {
  isAvailable(): Promise<{ available: boolean; reason: string }>;
  generate(system: string, user: string, temperature: number): Promise<string>;
};

// Lazily require so importing this module on a build WITHOUT the native side
// (or on Android) throws only when actually used, not at import time.
let cached: AppleFmNative | null = null;
function native(): AppleFmNative {
  if (!cached) cached = requireNativeModule('AppleFm') as AppleFmNative;
  return cached;
}

export type AppleFmAvailability = {
  available: boolean;
  /** '' when available; otherwise: appleIntelligenceNotEnabled | modelNotReady |
   *  deviceNotEligible | osTooOld | unknown */
  reason: string;
};

export function isAvailable(): Promise<AppleFmAvailability> {
  return native().isAvailable();
}

/** Run one turn on the on-device Apple Foundation Model; returns raw text. */
export function generate(
  system: string,
  user: string,
  temperature = 0.1,
): Promise<string> {
  return native().generate(system, user, temperature);
}
