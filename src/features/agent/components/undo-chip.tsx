import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeOut, SlideInDown } from 'react-native-reanimated';

import { ThemedText } from '@/src/components/themed-text';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

type Props = {
  label: string | null;
  onUndo: () => void;
  visibleMs?: number;
};

const DEFAULT_VISIBLE_MS = 5000;

export function UndoChip({ label, onUndo, visibleMs = DEFAULT_VISIBLE_MS }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];

  const [internalLabel, setInternalLabel] = useState<string | null>(label);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setInternalLabel(label);
    if (label != null) {
      timerRef.current = setTimeout(() => {
        setInternalLabel(null);
        timerRef.current = null;
      }, visibleMs);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [label, visibleMs]);

  if (internalLabel == null) return null;

  const bg = scheme === 'dark' ? palette.surface : palette.buttonFill;
  const fg = palette.textInverse;

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(18)}
      exiting={FadeOut.duration(180)}
    >
      <Pressable
        onPress={onUndo}
        accessibilityRole="button"
        accessibilityLabel={`Undo: ${internalLabel}`}
        hitSlop={8}
        style={({ pressed }) => [
          styles.chip,
          { backgroundColor: bg, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <ThemedText type="sen-caption-bold" style={{ color: fg }}>
          {`Undo: ${internalLabel}`}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
});
