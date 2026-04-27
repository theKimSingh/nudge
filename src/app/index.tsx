import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { getProfile, type Profile } from '@/src/backend/profiles';
import { useSession } from '@/src/backend/session';

export default function Index() {
  const { session, loading: sessionLoading } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    getProfile(session.user.id)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (sessionLoading) return null;
  if (!session) return <Redirect href="/(onboarding)/welcome" />;
  if (profileLoading) return null;
  if (profile?.onboarded) return <Redirect href="/(tabs)/todo" />;
  return <Redirect href="/(onboarding)/profile-setup" />;
}
