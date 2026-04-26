import { Stack } from 'expo-router';

import { OnboardingProvider } from '@/src/features/onboarding/context/onboarding-context';

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="info" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="profile-setup" />
        <Stack.Screen name="goals" />
        <Stack.Screen name="notifications" />
      </Stack>
    </OnboardingProvider>
  );
}
