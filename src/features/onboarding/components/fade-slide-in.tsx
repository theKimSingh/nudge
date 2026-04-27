import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

type Props = {
  children: ReactNode;
  delay?: number;
  fromBottom?: boolean;
  noSlide?: boolean;
};

export function FadeSlideIn({ children, delay = 0, fromBottom = false, noSlide = false }: Props) {
  const initialOffset = noSlide ? 0 : fromBottom ? 30 : -20;
  const opacity = useRef(new Animated.Value(0)).current;
  const offset = useRef(new Animated.Value(initialOffset)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        delay: delay * 1000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(offset, {
        toValue: 0,
        duration: 500,
        delay: delay * 1000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, offset]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: offset }] }}>
      {children}
    </Animated.View>
  );
}
