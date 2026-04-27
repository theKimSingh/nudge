import { ReactNode, createContext, useContext, useMemo, useState } from 'react';

import type { Goal, PendingSession } from '@/src/backend/onboarding-auth';

type OnboardingState = {
  pendingSession: PendingSession | null;
  name: string;
  goal: Goal | null;
  setPendingSession: (session: PendingSession | null) => void;
  setName: (name: string) => void;
  setGoal: (goal: Goal) => void;
};

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<Goal | null>(null);

  const value = useMemo<OnboardingState>(
    () => ({
      pendingSession,
      name,
      goal,
      setPendingSession,
      setName,
      setGoal,
    }),
    [pendingSession, name, goal],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingState {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used inside <OnboardingProvider>');
  }
  return context;
}
