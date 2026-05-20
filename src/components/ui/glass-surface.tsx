import { BlurView, type BlurTint } from 'expo-blur';
import {
  GlassView,
  isGlassEffectAPIAvailable,
} from 'expo-glass-effect';
import type { PropsWithChildren } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

type GlassTint = 'regular' | 'clear';
type GlassScheme = 'auto' | 'light' | 'dark';

type GlassSurfaceProps = PropsWithChildren<{
  style?: ViewStyle | ViewStyle[];
  tint?: GlassTint;
  tintColor?: string;
  scheme?: GlassScheme;
  /** Enables the iOS 26 drag-to-refract "magnifying lens" effect. */
  interactive?: boolean;
  /** Only used for the BlurView fallback. */
  intensity?: number;
}> &
  Omit<ViewProps, 'style'>;

// Cache the runtime check so we don't re-call the native bridge per render.
// `isGlassEffectAPIAvailable()` returns false when the binary doesn't include
// expo-glass-effect (Expo Go) OR when iOS < 26. In either case we fall back
// to BlurView, which is just a Gaussian blur — NOT real Liquid Glass.
const LIQUID_GLASS_AVAILABLE =
  Platform.OS === 'ios' && isGlassEffectAPIAvailable();

if (__DEV__) {
  // Logs once at module load so you can confirm whether real Liquid Glass is
  // active in this binary. False on Expo Go; true on a dev build that
  // included expo-glass-effect.
  console.log('[glass-surface] LIQUID_GLASS_AVAILABLE:', LIQUID_GLASS_AVAILABLE);
}

function blurTintFor(tint: GlassTint, scheme: GlassScheme): BlurTint {
  if (scheme === 'dark') {
    return tint === 'clear' ? 'systemThinMaterialDark' : 'systemChromeMaterialDark';
  }
  if (scheme === 'light') {
    return tint === 'clear' ? 'systemThinMaterialLight' : 'systemChromeMaterialLight';
  }
  return tint === 'clear' ? 'systemThinMaterial' : 'systemChromeMaterial';
}

export function GlassSurface({
  style,
  tint = 'regular',
  tintColor,
  scheme = 'auto',
  interactive = false,
  intensity = 80,
  children,
  ...rest
}: GlassSurfaceProps) {
  if (LIQUID_GLASS_AVAILABLE) {
    return (
      <GlassView
        glassEffectStyle={tint}
        isInteractive={interactive}
        tintColor={tintColor}
        colorScheme={scheme}
        style={style}
        {...rest}
      >
        {children}
      </GlassView>
    );
  }

  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return (
      <BlurView
        tint={blurTintFor(tint, scheme)}
        intensity={intensity}
        experimentalBlurMethod="dimezisBlurView"
        // overflow: 'hidden' is required on iOS so UIVisualEffectView respects
        // borderRadius. Without it, blurred surfaces with a borderRadius render
        // as squares (visible on Expo Go where this BlurView fallback runs in
        // place of the iOS 26 GlassView).
        style={[{ overflow: 'hidden' }, style]}
        {...rest}
      >
        {tintColor ? (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { backgroundColor: tintColor }]}
          />
        ) : null}
        {children}
      </BlurView>
    );
  }

  return (
    <View
      style={[
        { backgroundColor: tintColor ?? 'rgba(255,255,255,0.95)' },
        style as ViewStyle,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
