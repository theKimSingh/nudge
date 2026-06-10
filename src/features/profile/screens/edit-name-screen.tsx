import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/src/components/themed-text';
import { Colors } from '@/src/constants/theme';
import { getProfile } from '@/src/backend/profiles';
import { useSession } from '@/src/backend/session';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

import { SettingsScreenChrome } from '../components/settings-screen-chrome';

export function EditNameScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { session } = useSession();
  const [name, setName] = useState('');

  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    getProfile(uid).then((p) => {
      if (p?.name) setName(p.name);
    });
  }, [session?.user.id]);

  return (
    <SettingsScreenChrome
      title="Your name"
      subtitle="How Nudge greets you and refers to you in plans."
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.body}
      >
        <View
          style={[
            styles.field,
            { borderColor: palette.border, backgroundColor: palette.surface },
          ]}
        >
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={palette.textMuted}
            autoCapitalize="words"
            autoCorrect={false}
            style={[styles.input, { color: palette.text }]}
          />
        </View>

        <Pressable
          disabled={name.trim().length === 0}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          }}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: palette.buttonFill,
              opacity:
                name.trim().length === 0 ? 0.4 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <ThemedText type="sen-headline" style={{ color: palette.buttonLabel }}>
            Save
          </ThemedText>
        </Pressable>
      </KeyboardAvoidingView>
    </SettingsScreenChrome>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 16,
  },
  field: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  input: {
    fontSize: 22,
  },
  cta: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
