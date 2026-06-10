import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { TAB_BAR_HEIGHT, TAB_BAR_LIFT } from '@/src/components/tab-bar';
import { GlassSurface } from '@/src/components/ui/glass-surface';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useAgentSessionCtx } from '@/src/features/agent/context/agent-session-context';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

const MIC_SIZE = TAB_BAR_HEIGHT;
// Pin the mic to the right wall with a small inset so it clears the centered
// native tab pill instead of overlapping it.
const SCREEN_EDGE_MARGIN = 16;

// Halo tight around the 60px button: 100px total -> only 20px of glow per side.
const HALO_SIZE = 100;

const COLOR_CYCLE_MS = 3500;
const BREATHE_MS = 1500;
const SEGMENTS = 56;

// Each ring: base radius (in 100-unit viewBox; mic glass edge ≈ 30, container edge = 50),
// number of sine peaks around the circle, starting phase, and a rotation multiplier
// (integer so phase wraps cleanly when its `time` SharedValue snaps from 2π → 0).
// `gradPeak` is the radial-gradient offset (0..1) where the soft band's opacity
// peaks — keep it aligned with baseR/50 so the wavy edge sits at the band.
type RingConfig = {
  baseR: number;
  waves: number;
  phaseOffset: number;
  spinMul: number; // integer
  spinPeriodMs: number;
  gradPeak: number;
};
const RINGS: RingConfig[] = [
  { baseR: 34, waves:  7, phaseOffset: 0,           spinMul:  1, spinPeriodMs: 4200, gradPeak: 0.68 },
  { baseR: 44, waves: 10, phaseOffset: Math.PI / 2, spinMul: -1, spinPeriodMs: 5600, gradPeak: 0.88 },
];

// Same colors as the screen edge glow. Each palette also carries an `aura` pair
// (inner / outer color stops) that paints the smooth button-edge halo.
// Two palettes (down from three) keep mid-tones crisp in the small mic area.
const PINK = '#FF6B9D';
const PURPLE = '#C77DFF';
const INDIGO = '#5B8DEF';
const CYAN = '#22D3EE';
type GradientPair = [string, string];
type Palette = {
  rings: [GradientPair, GradientPair];
  aura: GradientPair; // [inner peak color, outer falloff color]
};
const PALETTES: Palette[] = [
  { rings: [[PINK,   PURPLE], [INDIGO, CYAN]],   aura: [PURPLE, PINK]   },
  { rings: [[INDIGO, CYAN],   [PINK,   PURPLE]], aura: [CYAN,   INDIGO] },
];

const AnimatedPath = Animated.createAnimatedComponent(Path);

function ringPath(
  baseR: number,
  waves: number,
  phaseOffset: number,
  spinMul: number,
  t: number,
  amp: number,
) {
  'worklet';
  const phase = phaseOffset + spinMul * t;
  // Visible peaks riding outward from the aura: ~1 vb-px idle, ~6.5 vb-px loud.
  const waveAmp = 1.0 + amp * 5.5;
  let d = '';
  for (let i = 0; i < SEGMENTS; i++) {
    const theta = (i / SEGMENTS) * Math.PI * 2;
    const r = baseR + waveAmp * Math.sin(waves * theta + phase);
    const x = 50 + Math.cos(theta) * r;
    const y = 50 + Math.sin(theta) * r;
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
  }
  return d + 'Z';
}

export function FloatingMic() {
  const insets = useSafeAreaInsets();
  const agent = useAgentSessionCtx();
  // 'loading' (model warming on cold start) and 'idle' are both inactive
  // states from the button's perspective — neither should render the
  // halo/edge-glow.
  const agentActive =
    agent.phase !== 'idle' && agent.phase !== 'loading';
  const modelLoading = agent.phase === 'loading';
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const isDark = scheme === 'dark';

  // Match the native Liquid Glass tab bar: light frost in light mode, dark
  // glass in dark mode.
  const idleTint = isDark ? 'rgba(28,28,30,0.55)' : 'rgba(255,255,255,0.5)';
  const activeTint = isDark ? 'rgba(14,14,16,0.35)' : 'rgba(255,255,255,0.25)';

  const onMicPress = () => {
    if (modelLoading) return; // model not ready yet; tap is a no-op
    if (__DEV__) {
      console.log(
        `[floating-mic] onMicPress phase=${agent.phase} agentActive=${agentActive}`,
      );
    }
    if (agentActive) {
      void agent.stop('mic_button_tap');
    } else {
      // No date arg — the session uses the todo tab's viewed day (set via
      // setViewedDate), falling back to today.
      void agent.start();
    }
  };

  const bottom = insets.bottom + TAB_BAR_LIFT + (TAB_BAR_HEIGHT - MIC_SIZE) / 2;
  const haloOffset = (HALO_SIZE - MIC_SIZE) / 2;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { bottom, right: SCREEN_EDGE_MARGIN }]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.haloWrap,
          { top: -haloOffset, left: -haloOffset, width: HALO_SIZE, height: HALO_SIZE },
        ]}
      >
        <MicWaveHalo active={agentActive} amplitude={agent.amplitude} />
      </View>
      <GlassSurface
        tint={agentActive ? 'clear' : 'regular'}
        interactive
        scheme="auto"
        tintColor={agentActive ? activeTint : idleTint}
        style={styles.glass}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={agentActive ? 'Stop agent' : 'Plan my day'}
          onPress={onMicPress}
          style={({ pressed }) => [
            styles.pressTarget,
            { transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}
        >
          <IconSymbol
            name="mic.fill"
            size={26}
            color={palette.surfaceText}
          />
        </Pressable>
      </GlassSurface>
    </View>
  );
}

type MicWaveHaloProps = {
  active: boolean;
  amplitude: SharedValue<number>;
};

function MicWaveHalo({ active, amplitude }: MicWaveHaloProps) {
  const containerOpacity = useSharedValue(0);
  const breathe = useSharedValue(0);
  const cycle = useSharedValue(0);

  // Per-ring time values (0..2π, wrap-safe because spinMul is integer).
  const t0 = useSharedValue(0);
  const t1 = useSharedValue(0);

  useEffect(() => {
    containerOpacity.value = withTiming(active ? 1 : 0, {
      duration: 400,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [active, containerOpacity]);

  useEffect(() => {
    breathe.value = withRepeat(
      withTiming(1, { duration: BREATHE_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    cycle.value = withRepeat(
      withTiming(Math.PI * 2, { duration: COLOR_CYCLE_MS, easing: Easing.linear }),
      -1,
      false,
    );
    t0.value = withRepeat(
      withTiming(Math.PI * 2, { duration: RINGS[0].spinPeriodMs, easing: Easing.linear }),
      -1,
      false,
    );
    t1.value = withRepeat(
      withTiming(Math.PI * 2, { duration: RINGS[1].spinPeriodMs, easing: Easing.linear }),
      -1,
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Audio + breathe + active fade compose into one opacity, same recipe as EdgeGlow.
  const containerStyle = useAnimatedStyle(() => {
    'worklet';
    const breatheMul = 0.8 + breathe.value * 0.2;
    const ampMul = 0.9 + amplitude.value * 0.4;
    return { opacity: containerOpacity.value * breatheMul * ampMul };
  });

  // One derived path per ring — shared across all 3 palette layers so the
  // expensive trig+string loop runs 2× per frame, not 6×.
  const d0 = useDerivedValue(() =>
    ringPath(RINGS[0].baseR, RINGS[0].waves, RINGS[0].phaseOffset, RINGS[0].spinMul, t0.value, amplitude.value),
  );
  const d1 = useDerivedValue(() =>
    ringPath(RINGS[1].baseR, RINGS[1].waves, RINGS[1].phaseOffset, RINGS[1].spinMul, t1.value, amplitude.value),
  );
  const ringPaths: SharedValue<string>[] = [d0, d1];

  return (
    <Animated.View style={[styles.haloFill, containerStyle]} pointerEvents="none">
      {PALETTES.map((palette, i) => (
        <PaletteLayer key={i} index={i} cycle={cycle} palette={palette} ringPaths={ringPaths} />
      ))}
    </Animated.View>
  );
}

type PaletteLayerProps = {
  index: number;
  cycle: SharedValue<number>;
  palette: Palette;
  ringPaths: SharedValue<string>[];
};

function PaletteLayer({ index, cycle, palette, ringPaths }: PaletteLayerProps) {
  const layerStyle = useAnimatedStyle(() => {
    'worklet';
    const phase = cycle.value + (index * Math.PI * 2) / PALETTES.length;
    // Compress to [0.40, 0.80] — with only 2 palettes each carries more weight
    // at its peak so color flow stays lively without muddying the small area.
    const norm = (Math.sin(phase) + 1) / 2;
    return { opacity: 0.40 + norm * 0.40 };
  });

  const auraId = `mic-aura-${index}`;
  const ringId0 = `mic-ring-${index}-0`;
  const ringId1 = `mic-ring-${index}-1`;

  // Aura: smooth radial gradient whose alpha PEAKS right at the button perimeter
  // (offset 0.62, viewBox radius ≈ 31 ≈ button edge) and softly fades to 0 by
  // the viewBox edge. Mirrors edge-glow's "strong-at-edge, soft falloff" recipe.
  // Rings: wavy discs on top, much subtler alpha now that aura carries the look.
  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, layerStyle]}
      pointerEvents="none"
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={auraId} cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0"    stopColor={palette.aura[0]} stopOpacity={0} />
            <Stop offset="0.55" stopColor={palette.aura[0]} stopOpacity={0} />
            <Stop offset="0.60" stopColor={palette.aura[0]} stopOpacity={0.88} />
            <Stop offset="0.78" stopColor={palette.aura[1]} stopOpacity={0.32} />
            <Stop offset="0.92" stopColor={palette.aura[1]} stopOpacity={0.08} />
            <Stop offset="1"    stopColor={palette.aura[1]} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={ringId0} cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0"                       stopColor={palette.rings[0][0]} stopOpacity={0} />
            <Stop offset={RINGS[0].gradPeak - 0.2} stopColor={palette.rings[0][0]} stopOpacity={0} />
            <Stop offset={RINGS[0].gradPeak}       stopColor={palette.rings[0][1]} stopOpacity={0.45} />
            <Stop offset={RINGS[0].gradPeak + 0.1} stopColor={palette.rings[0][0]} stopOpacity={0.22} />
            <Stop offset="1"                       stopColor={palette.rings[0][0]} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={ringId1} cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0"                       stopColor={palette.rings[1][0]} stopOpacity={0} />
            <Stop offset={RINGS[1].gradPeak - 0.2} stopColor={palette.rings[1][0]} stopOpacity={0} />
            <Stop offset={RINGS[1].gradPeak}       stopColor={palette.rings[1][1]} stopOpacity={0.38} />
            <Stop offset={RINGS[1].gradPeak + 0.1} stopColor={palette.rings[1][0]} stopOpacity={0.18} />
            <Stop offset="1"                       stopColor={palette.rings[1][0]} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#${auraId})`} />
        <RingFill pathValue={ringPaths[0]} gradId={ringId0} />
        <RingFill pathValue={ringPaths[1]} gradId={ringId1} />
      </Svg>
    </Animated.View>
  );
}

function RingFill({
  pathValue,
  gradId,
}: {
  pathValue: SharedValue<string>;
  gradId: string;
}) {
  const animatedProps = useAnimatedProps(() => ({ d: pathValue.value }));
  return (
    <AnimatedPath
      animatedProps={animatedProps}
      fill={`url(#${gradId})`}
      stroke="none"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: MIC_SIZE,
    height: MIC_SIZE,
    zIndex: 1000,
  },
  haloWrap: {
    position: 'absolute',
  },
  haloFill: {
    flex: 1,
  },
  glass: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    // iOS 26 Liquid Glass pills derive depth from the material itself, not
    // an external drop shadow. Match by removing the shadow — GlassSurface
    // already provides subtle edge highlights.
  },
  pressTarget: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
