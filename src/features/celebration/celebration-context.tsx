import * as Haptics from 'expo-haptics';
import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

type CelebrationValue = {
  // Monotonic counter — each increment kicks off a fresh burst in the
  // CelebrationOverlay. The overlay keys its content by this value so the
  // previous burst is fully unmounted before the new one mounts.
  trigger: number;
  // Fires confetti + success haptic. Fires every time it's called — caller
  // is responsible for any gating they want (e.g. only on done=true).
  celebrate: () => void;
};

const Context = createContext<CelebrationValue | null>(null);

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [trigger, setTrigger] = useState(0);

  const celebrate = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
      // Some devices/simulators don't support haptics; ignore.
    });
    setTrigger((t) => t + 1);
  }, []);

  return (
    <Context.Provider value={{ trigger, celebrate }}>{children}</Context.Provider>
  );
}

export function useCelebration(): CelebrationValue {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useCelebration must be used within CelebrationProvider');
  return ctx;
}
