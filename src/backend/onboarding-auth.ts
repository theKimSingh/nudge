// Auth API stubs. All bodies are placeholders — Supabase wiring lands here later
// without any change to the screens that call these functions.

export type PendingSession = { accessToken: string; userId: string };

export type Goal = 'work' | 'study' | 'balance';

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  // TODO(supabase): supabase.auth.signUp({ email, password }) and trigger email OTP
  void email;
  void password;
  throw new Error('not wired');
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<PendingSession> {
  // TODO(supabase): supabase.auth.signInWithPassword({ email, password })
  void email;
  void password;
  throw new Error('not wired');
}

export async function verifyEmailOtp(email: string, code: string): Promise<PendingSession> {
  // TODO(supabase): supabase.auth.verifyOtp({ email, token: code, type: 'email' })
  void email;
  void code;
  throw new Error('not wired');
}

export async function resendEmailOtp(email: string): Promise<void> {
  // TODO(supabase): supabase.auth.signInWithOtp({ email })
  void email;
  throw new Error('not wired');
}

export async function signInWithApple(): Promise<PendingSession> {
  // TODO(supabase + expo-apple-authentication)
  throw new Error('not wired');
}

export async function signInWithGoogle(): Promise<PendingSession> {
  // TODO(supabase OAuth via expo-auth-session)
  throw new Error('not wired');
}

export async function persistSession(
  session: PendingSession | null,
  profile: { name: string; goal: Goal | null },
): Promise<void> {
  // TODO(supabase): write profiles row, store session in expo-secure-store, flip onboarded flag
  void session;
  void profile;
  throw new Error('not wired');
}

export async function requestNotificationPermission(): Promise<boolean> {
  // TODO(expo-notifications): Notifications.requestPermissionsAsync()
  return false;
}
