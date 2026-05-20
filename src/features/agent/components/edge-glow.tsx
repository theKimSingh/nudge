import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

type Props = {
  amplitude: SharedValue<number>;
  active: boolean;
};

const COLOR_CYCLE_MS = 3500;
const BREATHE_MS = 1500;

type EdgeColors = {
  // 3 stops per edge: at-edge solid → mid soft → fully transparent.
  // Lets the color stay strong near the edge then fall off fast toward center.
  top: [string, string, string];
  bottom: [string, string, string];
  left: [string, string, string];
  right: [string, string, string];
};

// Each base color contributes three alpha levels: edge (strong), mid (soft),
// inner (0). Bottom edge is heavier (taller strip), so its top stop is higher.
const C = {
  pink: {
    top: ['rgba(255,107,157,0.7)', 'rgba(255,107,157,0.25)', 'rgba(255,107,157,0)'] as [string, string, string],
    bottom: ['rgba(255,107,157,0)', 'rgba(255,107,157,0.3)', 'rgba(255,107,157,0.75)'] as [string, string, string],
    left: ['rgba(255,107,157,0.55)', 'rgba(255,107,157,0.2)', 'rgba(255,107,157,0)'] as [string, string, string],
    right: ['rgba(255,107,157,0)', 'rgba(255,107,157,0.2)', 'rgba(255,107,157,0.55)'] as [string, string, string],
  },
  purple: {
    top: ['rgba(199,125,255,0.7)', 'rgba(199,125,255,0.25)', 'rgba(199,125,255,0)'] as [string, string, string],
    bottom: ['rgba(124,92,255,0)', 'rgba(124,92,255,0.3)', 'rgba(124,92,255,0.75)'] as [string, string, string],
    left: ['rgba(199,125,255,0.55)', 'rgba(199,125,255,0.2)', 'rgba(199,125,255,0)'] as [string, string, string],
    right: ['rgba(199,125,255,0)', 'rgba(199,125,255,0.2)', 'rgba(199,125,255,0.55)'] as [string, string, string],
  },
  indigo: {
    top: ['rgba(91,141,239,0.7)', 'rgba(91,141,239,0.25)', 'rgba(91,141,239,0)'] as [string, string, string],
    bottom: ['rgba(91,141,239,0)', 'rgba(91,141,239,0.3)', 'rgba(91,141,239,0.75)'] as [string, string, string],
    left: ['rgba(91,141,239,0.55)', 'rgba(91,141,239,0.2)', 'rgba(91,141,239,0)'] as [string, string, string],
    right: ['rgba(91,141,239,0)', 'rgba(91,141,239,0.2)', 'rgba(91,141,239,0.55)'] as [string, string, string],
  },
  cyan: {
    top: ['rgba(34,211,238,0.7)', 'rgba(34,211,238,0.25)', 'rgba(34,211,238,0)'] as [string, string, string],
    bottom: ['rgba(34,211,238,0)', 'rgba(34,211,238,0.3)', 'rgba(34,211,238,0.75)'] as [string, string, string],
    left: ['rgba(34,211,238,0.55)', 'rgba(34,211,238,0.2)', 'rgba(34,211,238,0)'] as [string, string, string],
    right: ['rgba(34,211,238,0)', 'rgba(34,211,238,0.2)', 'rgba(34,211,238,0.55)'] as [string, string, string],
  },
};

// Each palette assigns a DIFFERENT color to each edge, so at any moment the
// perimeter shows 4 different colors (never "all pink"). Palettes rotate the
// color assignment clockwise so the rainbow visibly flows around the frame.
const PALETTES: EdgeColors[] = [
  { top: C.pink.top, right: C.purple.right, bottom: C.indigo.bottom, left: C.cyan.left },
  { top: C.purple.top, right: C.indigo.right, bottom: C.cyan.bottom, left: C.pink.left },
  { top: C.indigo.top, right: C.cyan.right, bottom: C.pink.bottom, left: C.purple.left },
];

// Sharper falloff: color stays at full strength for the first slice of the
// strip, then ramps to mid, then to 0.
const STOP_LOCATIONS_EDGE_TO_CENTER = [0, 0.35, 1] as const;
const STOP_LOCATIONS_CENTER_TO_EDGE = [0, 0.65, 1] as const;

export function EdgeGlow({ amplitude, active }: Props) {
  const containerOpacity = useSharedValue(0);
  const breathe = useSharedValue(0);
  const cycle = useSharedValue(0);

  useEffect(() => {
    containerOpacity.value = withTiming(active ? 1 : 0, {
      duration: 600,
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
      withTiming(Math.PI * 2, {
        duration: COLOR_CYCLE_MS,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerStyle = useAnimatedStyle(() => {
    'worklet';
    const breatheMul = 0.8 + breathe.value * 0.2;
    const ampMul = 0.9 + amplitude.value * 0.2;
    return { opacity: containerOpacity.value * breatheMul * ampMul };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, containerStyle]}
    >
      {PALETTES.map((palette, i) => (
        <PaletteLayer key={i} palette={palette} index={i} cycle={cycle} />
      ))}
    </Animated.View>
  );
}

type PaletteLayerProps = {
  palette: EdgeColors;
  index: number;
  cycle: SharedValue<number>;
};

function PaletteLayer({ palette, index, cycle }: PaletteLayerProps) {
  const layerStyle = useAnimatedStyle(() => {
    'worklet';
    const phase = cycle.value + (index * Math.PI * 2) / PALETTES.length;
    // Compress to [0.35, 0.65]: every palette is always quite visible so the
    // result is always a 4-way blend, never one palette taking over.
    const norm = (Math.sin(phase) + 1) / 2;
    const opacity = 0.35 + norm * 0.3;
    return { opacity };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, layerStyle]}
    >
      <LinearGradient
        colors={palette.top}
        locations={STOP_LOCATIONS_EDGE_TO_CENTER}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.edge, styles.top]}
      />
      <LinearGradient
        colors={palette.left}
        locations={STOP_LOCATIONS_EDGE_TO_CENTER}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.edge, styles.left]}
      />
      <LinearGradient
        colors={palette.right}
        locations={STOP_LOCATIONS_CENTER_TO_EDGE}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.edge, styles.right]}
      />
      <LinearGradient
        colors={palette.bottom}
        locations={STOP_LOCATIONS_CENTER_TO_EDGE}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.edge, styles.bottom]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  edge: {
    position: 'absolute',
  },
  top: {
    top: 0,
    left: 0,
    right: 0,
    height: 85,
  },
  bottom: {
    bottom: 0,
    left: 0,
    right: 0,
    // Taller so the gradient reaches further up the screen and the band that
    // holds the chips + "I'm listening…" sits inside a colored area instead
    // of a white gap above the tab bar.
    height: 200,
  },
  left: {
    top: 0,
    bottom: 0,
    left: 0,
    width: 55,
  },
  right: {
    top: 0,
    bottom: 0,
    right: 0,
    width: 55,
  },
});
