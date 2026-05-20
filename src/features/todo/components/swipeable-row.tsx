import { useCallback, useState, type ReactNode } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

const OPEN_OFFSET = 96;
const REVEAL_THRESHOLD = 80;
const FLING_VELOCITY = 1500;
const SCREEN_WIDTH = Dimensions.get('window').width;
const FULL_SWIPE_RATIO = 0.55;

type Props = {
  onDelete: () => void;
  /** When false, the horizontal swipe Pan is disabled. Used while the row
   *  is being vertically dragged by the SortableList so a sideways drift
   *  doesn't trigger swipe-to-delete simultaneously. */
  enabled?: boolean;
  children: ReactNode;
};

export function SwipeableRow({ onDelete, enabled = true, children }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const translateX = useSharedValue(0);
  const [isOpen, setIsOpen] = useState(false);

  const setOpenJS = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const close = useCallback(() => {
    translateX.value = withTiming(0, { duration: 220 });
    setIsOpen(false);
  }, [translateX]);

  // Tap the trash icon: close the row first, then fire onDelete. If the parent
  // shows a confirmation Alert and the user cancels, the row is already back
  // to its resting state. If they confirm, the row's FadeOut takes over.
  const handleDeletePress = useCallback(() => {
    close();
    onDelete();
  }, [close, onDelete]);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .enabled(enabled)
    .onUpdate((e) => {
      'worklet';
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      'worklet';
      const x = e.translationX;
      const v = e.velocityX;
      const fullSwipe =
        Math.abs(x) > SCREEN_WIDTH * FULL_SWIPE_RATIO ||
        Math.abs(v) > FLING_VELOCITY;
      if (fullSwipe) {
        // Fly the row offscreen, fire onDelete (parent may show a confirm
        // Alert), then snap back to 0. If the task is actually deleted, the
        // FadeOut on the renderItem wrapper unmounts the row before this
        // settle is visible. If the user cancels, the row slides back into
        // place rather than being stuck offscreen.
        translateX.value = withTiming(
          Math.sign(x || v) * SCREEN_WIDTH,
          { duration: 200 },
          () => {
            runOnJS(onDelete)();
            translateX.value = withTiming(0, { duration: 240 });
          },
        );
        runOnJS(setOpenJS)(false);
        return;
      }
      if (Math.abs(x) > REVEAL_THRESHOLD) {
        translateX.value = withTiming(Math.sign(x) * OPEN_OFFSET, {
          duration: 200,
        });
        runOnJS(setOpenJS)(true);
        return;
      }
      translateX.value = withTiming(0, { duration: 200 });
      runOnJS(setOpenJS)(false);
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const leftActionStyle = useAnimatedStyle(() => ({
    opacity:
      translateX.value > 0 ? Math.min(translateX.value / REVEAL_THRESHOLD, 1) : 0,
  }));

  const rightActionStyle = useAnimatedStyle(() => ({
    opacity:
      translateX.value < 0
        ? Math.min(-translateX.value / REVEAL_THRESHOLD, 1)
        : 0,
  }));

  return (
    <View style={styles.container}>
      <View style={[styles.underlay, { backgroundColor: palette.bgTertiary }]}>
        <Animated.View style={[styles.actionLeft, leftActionStyle]}>
          <Pressable
            onPress={handleDeletePress}
            hitSlop={8}
            style={({ pressed }) => [
              styles.actionBtn,
              pressed && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Delete task"
          >
            <IconSymbol name="trash" size={20} color={palette.text} />
          </Pressable>
        </Animated.View>
        <Animated.View style={[styles.actionRight, rightActionStyle]}>
          <Pressable
            onPress={handleDeletePress}
            hitSlop={8}
            style={({ pressed }) => [
              styles.actionBtn,
              pressed && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Delete task"
          >
            <IconSymbol name="trash" size={20} color={palette.text} />
          </Pressable>
        </Animated.View>
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.content,
            { backgroundColor: palette.background },
            contentStyle,
          ]}
        >
          {children}
          {isOpen ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={close}
              accessibilityLabel="Close delete action"
            />
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  underlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  content: {
    width: '100%',
  },
});
