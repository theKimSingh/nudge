import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/src/components/ui/glass-surface';
import { Fonts } from '@/src/constants/theme';
import { formatTimeDisplay } from '@/src/features/todo/types';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

import type { TaskToast } from '../hooks/use-agent-session';

import { TranscriptStream } from './transcript-stream';

type Props = {
  /** Past events. Newest at index 0. */
  toasts: TaskToast[];
  /** Current live transcript (user's words). Takes the bottom slot when set. */
  transcript: string;
  /** Plain hint shown at the bottom when there's no transcript. */
  hint: string | null;
};

// Cap chip stack height so we don't push the transcript out of view.
const MAX_CHIPS = 3;
// How far above the native tab bar the entire band sits.
const BAND_BOTTOM_PX = 100;

function lowercaseTime(minutes: number): string {
  return formatTimeDisplay(minutes).toLowerCase().replace(/\s/g, '');
}

function lineFor(toast: TaskToast): string {
  if (toast.kind === 'question') return toast.text;
  if (toast.kind === 'removed') return `Removed ${toast.title}`;
  if (toast.kind === 'added') {
    if (typeof toast.time_minutes === 'number') {
      return `Added ${toast.title} at ${lowercaseTime(toast.time_minutes)}`;
    }
    return `Added ${toast.title}`;
  }
  // updated
  if (typeof toast.time_minutes === 'number') {
    return `Moved ${toast.title} to ${lowercaseTime(toast.time_minutes)}`;
  }
  return `Updated ${toast.title}`;
}

export function FeedbackBand({ toasts, transcript, hint }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const dark = scheme === 'dark';

  // Render oldest-first so the chip stack visually fills upward, with the
  // newest sitting immediately above the bottom hint/transcript line.
  const visible = toasts.slice(0, MAX_CHIPS).slice().reverse();

  const chipTint = dark ? 'rgba(14,14,16,0.55)' : 'rgba(255,255,255,0.55)';
  const chipText = dark ? '#FFFFFF' : '#0A0A0A';
  const hintColor = dark ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,10,0.92)';
  const hintShadow = dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)';

  return (
    <View
      pointerEvents="none"
      style={[styles.band, { bottom: insets.bottom + BAND_BOTTOM_PX }]}
    >
      {visible.length > 0 ? (
        <View style={styles.chipStack}>
          {visible.map((toast, i, arr) => {
          // Older chips (top of stack) get more transparent; newest (just
          // above the hint line) stays fully opaque.
          const ageRank = arr.length - 1 - i; // 0 = newest, N-1 = oldest
          const opacity = Math.max(0.35, 1 - ageRank * 0.3);
          return (
            // Outer wrapper owns the layout/entering/exiting animations
            // (which all touch opacity). The inner View carries the static
            // rank-based opacity so the two don't collide. Without this
            // split Reanimated warns "Property 'opacity' of
            // AnimatedComponent(View) may be overwritten by a layout
            // animation."
            // No `exiting` — exit-animations orphan-render at the chip's
            // OLD absolute position, which often collides with the hint
            // that just snapped up into the freed space, leaving the
            // chip half-faded over "I'm listening…". Instead the chip
            // unmounts cleanly when its TTL expires; LinearTransition on
            // the surviving siblings keeps the rest of the stack smooth.
            <Animated.View
              key={toast.id}
              entering={FadeIn.duration(240)}
              layout={LinearTransition.duration(220)}
            >
              <View style={{ opacity }}>
                <GlassSurface
                  tint="regular"
                  scheme="auto"
                  tintColor={chipTint}
                  style={styles.chip}
                >
                  <Animated.Text
                    style={[styles.chipText, { color: chipText }]}
                    numberOfLines={2}
                  >
                    {lineFor(toast)}
                  </Animated.Text>
                </GlassSurface>
              </View>
            </Animated.View>
          );
          })}
        </View>
      ) : null}
      {transcript ? (
        <View style={styles.transcriptSlot}>
          <TranscriptStream text={transcript} />
        </View>
      ) : null}
      {hint ? (
        <Animated.Text
          key={hint}
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(180)}
          style={[
            styles.hint,
            { color: hintColor, textShadowColor: hintShadow },
          ]}
        >
          {hint}
        </Animated.Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    // No `gap` here — it doesn't reliably update during Reanimated
    // layout transitions on the chip stack, which causes chips to
    // visually crash into the transcript or status mid-animation.
    // Spacing lives inside each section's paddingBottom instead, so the
    // gap is part of the section's own size and animates with it.
  },
  chipStack: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
    // Buffer big enough that the chip's shadowRadius (10) can't bleed
    // into the section below, plus comfortable breathing room.
    paddingBottom: 24,
  },
  transcriptSlot: {
    width: '100%',
    alignItems: 'center',
    // Hard ceiling so a runaway transcript can't push the band off the
    // top of the screen. TranscriptStream also self-trims via MAX_TOKENS,
    // but this clips any leftover overflow as the absolute backstop.
    // Tokens that don't fit get clipped from the bottom (newer tokens at
    // the bottom of the wrap) — acceptable since they'll fade out within
    // a few seconds anyway.
    maxHeight: 96,
    overflow: 'hidden',
    // Same shadow-buffer reasoning as chipStack — the transcript token
    // textShadowRadius (8) plus the hint textShadowRadius (10) can't
    // overlap once this padding is between them.
    paddingBottom: 22,
  },
  chip: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: 'hidden',
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  chipText: {
    fontFamily: Fonts.displayBold,
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    fontFamily: Fonts.displayBold,
    fontWeight: '700',
    fontSize: 22,
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
});
