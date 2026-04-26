import { ReactNode, useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  children: ReactNode;
  delay?: number;
  fromBottom?: boolean;
};

export function FadeSlideIn({ children, delay = 0, fromBottom = false }: Props) {
  const opacity = useSharedValue(0);
  const offset = useSharedValue(fromBottom ? 30 : -20);

  useEffect(() => {
    const config = { duration: 500, easing: Easing.out(Easing.cubic) };
    opacity.value = withDelay(delay * 1000, withTiming(1, config));
    offset.value = withDelay(delay * 1000, withTiming(0, config));
  }, [delay, opacity, offset]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: offset.value }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}
