import { useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useRef } from 'react';
import { Animated, Easing } from 'react-native';

type Props = {
  children: ReactNode;
  delay?: number;
  fromBottom?: boolean;
};

export function FadeSlideIn({ children, delay = 0, fromBottom = false }: Props) {
  const initialOffset = fromBottom ? 30 : -20;
  const opacity = useRef(new Animated.Value(0)).current;
  const offset = useRef(new Animated.Value(initialOffset)).current;

  useFocusEffect(
    useCallback(() => {
      opacity.setValue(0);
      offset.setValue(initialOffset);
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
    }, [delay, initialOffset, opacity, offset]),
  );

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: offset }] }}>
      {children}
    </Animated.View>
  );
}
