import { supabase } from './supabase';
import { updateProfile } from './profiles';

export type PendingSession = { accessToken: string; userId: string };

export type Goal = 'work' | 'study' | 'balance';

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<PendingSession> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { accessToken: data.session.access_token, userId: data.user.id };
}

export async function verifyEmailOtp(email: string, code: string): Promise<PendingSession> {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: 'signup',
  });
  if (error) throw error;
  if (!data.session || !data.user) {
    throw new Error('Verification did not return a session.');
  }
  return { accessToken: data.session.access_token, userId: data.user.id };
}

export async function resendEmailOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw error;
}

export async function signInWithApple(): Promise<PendingSession> {
  throw new Error('Apple sign-in is not available yet.');
}

export async function signInWithGoogle(): Promise<PendingSession> {
  throw new Error('Google sign-in is not available yet.');
}

export async function persistSession(
  session: PendingSession | null,
  profile: { name: string; goal: Goal | null },
): Promise<void> {
  let userId = session?.userId;
  if (!userId) {
    // Resume case: user signed in earlier (Supabase has the session in
    // SecureStore) but the in-memory OnboardingContext lost the
    // PendingSession after a relaunch.
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    userId = data.user?.id;
  }
  if (!userId) {
    throw new Error('persistSession: no authenticated user.');
  }
  await updateProfile(userId, {
    name: profile.name,
    goal: profile.goal,
    onboarded: true,
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  // TODO(expo-notifications): Notifications.requestPermissionsAsync()
  return false;
}
