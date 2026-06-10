import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { Colors } from '@/src/constants/theme';
import { getProfile, type Profile } from '@/src/backend/profiles';
import { signOut, useSession } from '@/src/backend/session';
import { minutesToAmPm } from '@/src/features/agent/lib/time-format';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';

export function ProfileScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let cancelled = false;
    const uid = session?.user.id;
    if (!uid) return;
    getProfile(uid)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        /* Non-fatal — row just shows fallback. */
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  function push(path: string) {
    router.push(path as never);
  }

  function handleSignOut() {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(onboarding)/welcome');
        },
      },
    ]);
  }

  const meals = profile
    ? `${minutesToAmPm(profile.breakfast_time_minutes ?? 480)} · ${minutesToAmPm(
        profile.lunch_time_minutes ?? 750,
      )} · ${minutesToAmPm(profile.dinner_time_minutes ?? 1110)}`
    : undefined;

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="sen-large-title">Profile</ThemedText>
          {session?.user.email ? (
            <ThemedText
              type="sen-footnote"
              style={[styles.email, { color: palette.textSecondary }]}
            >
              {session.user.email}
            </ThemedText>
          ) : null}
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <SettingsSection heading="Profile">
            <SettingsRow
              icon="person.fill"
              title="Name"
              subtitle={profile?.name || 'Not set'}
              onPress={() => push('/(tabs)/profile/edit-name')}
            />
            <SettingsRow
              icon="sun.max.fill"
              title="Day section times"
              onPress={() => push('/(tabs)/profile/day-times')}
            />
            <SettingsRow
              icon="fork.knife"
              title="Meals"
              subtitle={meals}
              onPress={() => push('/(tabs)/profile/meal-times')}
            />
            <SettingsRow
              icon="list.bullet"
              title="Rules & preferences"
              onPress={() => push('/(tabs)/profile/preferences')}
            />
          </SettingsSection>

          <SettingsSection heading="Account">
            <SettingsRow
              icon="rectangle.portrait.and.arrow.right"
              title="Sign out"
              accessory="none"
              onPress={handleSignOut}
            />
          </SettingsSection>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  email: { marginTop: 4 },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 140,
  },
});
