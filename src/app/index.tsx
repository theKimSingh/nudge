import { Redirect } from 'expo-router';

import { useSession } from '@/src/backend/session';

export default function Index() {
  const { session, loading } = useSession();

  if (loading) return null;

  // TODO(supabase): once a `profiles.onboarded` flag exists, gate on
  // `session && profile?.onboarded` instead of session alone.
  if (session) return <Redirect href="/(tabs)/home" />;
  return <Redirect href="/(onboarding)/welcome" />;
}
