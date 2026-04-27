import { supabase } from './supabase';
import { updateProfile } from './profiles';

export type PendingSession = { accessToken: string; userId: string };

export type Goal = 'work' | 'study' | 'balance';

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  console.log('[Auth] signUpWithEmail:', email);
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    console.error('[Auth] signUpWithEmail error:', error);
    throw error;
  }
  console.log('[Auth] signUpWithEmail success');
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<PendingSession> {
  console.log('[Auth] signInWithPassword:', email);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('[Auth] signInWithPassword error:', error);
    throw error;
  }
  console.log('[Auth] signInWithPassword success');
  return { accessToken: data.session.access_token, userId: data.user.id };
}

export async function verifyEmailOtp(email: string, code: string): Promise<PendingSession> {
  console.log('[Auth] verifyEmailOtp:', email);
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: 'signup',
  });
  if (error) {
    console.error('[Auth] verifyEmailOtp error:', error);
    throw error;
  }
  if (!data.session || !data.user) {
    const err = new Error('Verification did not return a session.');
    console.error('[Auth] verifyEmailOtp session missing');
    throw err;
  }
  console.log('[Auth] verifyEmailOtp success');
  return { accessToken: data.session.access_token, userId: data.user.id };
}

export async function resendEmailOtp(email: string): Promise<void> {
  console.log('[Auth] resendEmailOtp:', email);
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) {
    console.error('[Auth] resendEmailOtp error:', error);
    throw error;
  }
  console.log('[Auth] resendEmailOtp success');
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
  console.log('[Auth] persistSession starting for profile:', profile.name);
  let userId = session?.userId;
  if (!userId) {
    // Resume case: user signed in earlier (Supabase has the session in
    // SecureStore) but the in-memory OnboardingContext lost the
    // PendingSession after a relaunch.
    console.log('[Auth] persistSession: no session provided, attempting to get user from Supabase');
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error('[Auth] persistSession getUser error:', error);
      throw error;
    }
    userId = data.user?.id;
  }
  if (!userId) {
    console.error('[Auth] persistSession: no authenticated user found');
    throw new Error('persistSession: no authenticated user.');
  }
  console.log('[Auth] persistSession: updating profile for userId:', userId);
  await updateProfile(userId, {
    name: profile.name,
    goal: profile.goal,
    onboarded: true,
  });
  console.log('[Auth] persistSession success');
}

export async function requestNotificationPermission(): Promise<boolean> {
  // TODO(expo-notifications): Notifications.requestPermissionsAsync()
  return false;
}
