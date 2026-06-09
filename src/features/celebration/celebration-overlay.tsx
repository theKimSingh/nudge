import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useCelebration } from './celebration-context';

// Monochrome sky-blue palette + white. Single hue family keeps the moment
// feeling like Nudge's signature rather than generic celebration.
const PIECE_COLORS = ['#BAE6FD', '#7DD3FC', '#E0F2FE', '#FFFFFF'];

// All pieces emit from the center of the screen at t=0, burst outward in a
// random direction within the upper hemisphere (30°–150° from horizontal),
// arc to a peak, then fall past the bottom edge under gravity-like ease-in.
const PIECE_COUNT = 60;
const RISE_DURATION_MIN_MS = 420;
const RISE_DURATION_MAX_MS = 620;
const FALL_DURATION_MIN_MS = 1100;
const FALL_DURATION_MAX_MS = 1500;
const THROW_DIST_MIN = 180;
const THROW_DIST_MAX = 420;
const DOT_SHARE = 0.6;
const DOT_MIN = 6;
const DOT_MAX = 10;
const RECT_W_MIN = 5;
const RECT_W_MAX = 7;
const RECT_H_MIN = 12;
const RECT_H_MAX = 18;

type PieceShape = 'dot' | 'rect';

type PieceConfig = {
  id: number;
  shape: PieceShape;
  size: number;        // dot diameter or rect width
  longSide: number;    // rect height (= size for dots)
  color: string;
  originX: number;     // absolute screen x at which the piece is rendered
  originY: number;     // absolute screen y at which the piece is rendered
  peakX: number;       // translateX at peak (end of rise phase)
  peakY: number;       // translateY at peak (negative = above origin)
  finalX: number;      // translateX at end of fall
  finalY: number;      // translateY at end of fall (past screen bottom)
  riseDurationMs: number;
  fallDurationMs: number;
  rotationDeg: number;
};

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickColor(): string {
  return PIECE_COLORS[Math.floor(Math.random() * PIECE_COLORS.length)];
}

function generatePiece(id: number, w: number, h: number): PieceConfig {
  const shape: PieceShape = Math.random() < DOT_SHARE ? 'dot' : 'rect';
  const size = shape === 'dot' ? randBetween(DOT_MIN, DOT_MAX) : randBetween(RECT_W_MIN, RECT_W_MAX);
  const longSide = shape === 'dot' ? size : randBetween(RECT_H_MIN, RECT_H_MAX);

  const originX = w / 2;
  const originY = h / 2;

  // Random direction in the upper hemisphere. 30°–150° (math degrees from
  // positive x-axis going counterclockwise) keeps every piece moving upward
  // at least somewhat — none start by falling.
  const angleRad = (randBetween(30, 150) * Math.PI) / 180;
  const throwDist = randBetween(THROW_DIST_MIN, THROW_DIST_MAX);

  // Translate at peak. Screen y is inverted vs math y, so the math-positive
  // sin (upward) becomes a negative screen translation.
  const peakX = Math.cos(angleRad) * throwDist;
  const peakY = -Math.sin(angleRad) * throwDist;

  // After peak, the piece continues horizontally a little (~30% of the rise
  // distance) and falls past the bottom of the screen.
  const fallDrift = Math.cos(angleRad) * throwDist * 0.3;
  const finalX = peakX + fallDrift;
  // Fall target in absolute screen coords = h + 120. Translation = target -
  // origin, so the piece's translateY ends at (h + 120 - originY).
  const finalY = h + 120 - originY;

  return {
    id,
    shape,
    size,
    longSide,
    color: pickColor(),
    originX,
    originY,
    peakX,
    peakY,
    finalX,
    finalY,
    riseDurationMs: randBetween(RISE_DURATION_MIN_MS, RISE_DURATION_MAX_MS),
    fallDurationMs: randBetween(FALL_DURATION_MIN_MS, FALL_DURATION_MAX_MS),
    rotationDeg: randBetween(-360, 360),
  };
}

function ConfettiPiece({ config }: { config: PieceConfig }) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rot = useSharedValue(0);
  // Visible from the moment of the burst — no fade-in.
  const opacity = useSharedValue(1);

  useEffect(() => {
    const total = config.riseDurationMs + config.fallDurationMs;

    // Rise to peak (ease-out, decelerating like air resistance), then fall
    // (ease-in, accelerating under gravity).
    tx.value = withSequence(
      withTiming(config.peakX, {
        duration: config.riseDurationMs,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(config.finalX, {
        duration: config.fallDurationMs,
        easing: Easing.in(Easing.quad),
      }),
    );
    ty.value = withSequence(
      withTiming(config.peakY, {
        duration: config.riseDurationMs,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(config.finalY, {
        duration: config.fallDurationMs,
        easing: Easing.in(Easing.quad),
      }),
    );
    rot.value = withTiming(config.rotationDeg, {
      duration: total,
      easing: Easing.linear,
    });
    // Hold full opacity through rise + most of fall, fade out over final ~30%.
    opacity.value = withDelay(
      total * 0.65,
      withTiming(0, {
        duration: total * 0.3,
        easing: Easing.out(Easing.quad),
      }),
    );
    // Single-shot animation on mount; parent re-keys on each trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animated = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${rot.value}deg` },
    ],
    opacity: opacity.value,
  }));

  const shapeStyle =
    config.shape === 'dot'
      ? {
          width: config.size,
          height: config.size,
          borderRadius: config.size / 2,
          backgroundColor: config.color,
        }
      : {
          width: config.size,
          height: config.longSide,
          borderRadius: 1.5,
          backgroundColor: config.color,
        };

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.piece,
        shapeStyle,
        { left: config.originX, top: config.originY },
        animated,
      ]}
    />
  );
}

function ConfettiBurst({ onComplete }: { onComplete: () => void }) {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => generatePiece(i, width, height)),
    [width, height],
  );

  // Self-remove after the longest piece has finished its fall + fade. Small
  // buffer so we don't yank the last frame.
  useEffect(() => {
    const maxLife = pieces.reduce(
      (m, p) => Math.max(m, p.riseDurationMs + p.fallDurationMs),
      0,
    );
    const t = setTimeout(onComplete, maxLife + 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {pieces.map((p) => (
        <ConfettiPiece key={p.id} config={p} />
      ))}
    </>
  );
}

export function CelebrationOverlay() {
  const { trigger } = useCelebration();
  // Maintain a queue of active bursts so rapid successive celebrations stack
  // on top of each other rather than the new burst yanking the previous one.
  // Each burst removes itself from the queue after its pieces complete.
  const [bursts, setBursts] = useState<number[]>([]);
  const lastSeenRef = useRef(0);

  useEffect(() => {
    if (trigger > lastSeenRef.current) {
      lastSeenRef.current = trigger;
      setBursts((b) => [...b, trigger]);
    }
  }, [trigger]);

  const removeBurst = useCallback((id: number) => {
    setBursts((b) => b.filter((x) => x !== id));
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bursts.map((id) => (
        <ConfettiBurst key={id} onComplete={() => removeBurst(id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
  },
});
