import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';

import { supabase } from '@/src/backend/supabase';
import { useSession } from '@/src/backend/session';
import { ThemedText } from '@/src/components/themed-text';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

import { SettingsScreenChrome } from '../components/settings-screen-chrome';

type Rule = {
  id: string;
  text: string;
};

export function PreferencesScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { session } = useSession();

  const [rules, setRules] = useState<Rule[]>([]);
  const [adding, setAdding] = useState(false);

  // Load user_constraints from the DB so the rules shown here are the same
  // ones the voice prompt's "KNOWN USER PREFERENCES" block reads. Previously
  // this was in-memory only — rules vanished on app restart and never
  // reached the agent context.
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('user_constraints')
        .select('id, text')
        .eq('user_id', uid)
        .is('superseded_by', null)
        .order('last_referenced_at', { ascending: false });
      if (cancelled || error || !data) return;
      setRules(data.map((r) => ({ id: r.id, text: r.text })));
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  async function addRule(text: string) {
    // Use the `upsert_constraint` RPC so existing rows bump their ref_count
    // instead of creating duplicates. Returns the row id (existing or new).
    const { data, error } = await supabase
      .rpc('upsert_constraint', {
        p_text: text.toLowerCase(),
        p_category: 'other',
        p_strength: 'hard',
      });
    if (error) return;
    const id = typeof data === 'string' ? data : String(data ?? '');
    if (!id) return;
    setRules((prev) => {
      // Don't double-render if upsert hit an existing row already on screen.
      if (prev.some((r) => r.id === id)) return prev;
      return [{ id, text }, ...prev];
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function removeRule(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Optimistic remove; the DB delete is RLS-protected so only the owner
    // can run it. If it fails the row reappears on next mount.
    setRules((prev) => prev.filter((r) => r.id !== id));
    await supabase.from('user_constraints').delete().eq('id', id);
  }

  return (
    <SettingsScreenChrome
      title="Rules & preferences"
      subtitle="What Nudge has learned and what you've told it. Add a rule to skip the learning curve."
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add rule"
        onPress={() => {
          Haptics.selectionAsync();
          setAdding(true);
        }}
        style={({ pressed }) => [
          styles.addBtn,
          { backgroundColor: palette.buttonFill, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <IconSymbol name="plus" size={16} color={palette.buttonLabel} />
        <ThemedText type="sen-headline" style={{ color: palette.buttonLabel }}>
          Add rule
        </ThemedText>
      </Pressable>

      {rules.length === 0 ? (
        <View
          style={[
            styles.empty,
            { backgroundColor: palette.bgSecondary, borderColor: palette.border },
          ]}
        >
          <ThemedText
            type="sen-body"
            style={{ color: palette.textSecondary, textAlign: 'center' }}
          >
            Nudge will learn your preferences as you plan. Add rules here to
            skip the wait.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.list}>
          {rules.map((r) => (
            <View
              key={r.id}
              style={[
                styles.ruleRow,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            >
              <View style={styles.ruleBody}>
                <ThemedText type="sen-body">{r.text}</ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove rule"
                onPress={() => removeRule(r.id)}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <IconSymbol name="trash" size={18} color={palette.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <AddRuleSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onSave={(text) => {
          addRule(text);
          setAdding(false);
        }}
      />
    </SettingsScreenChrome>
  );
}

function AddRuleSheet({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];

  const [text, setText] = useState('');
  const trimmed = text.trim();
  const canSave = trimmed.length > 0;

  function handleClose() {
    setText('');
    onClose();
  }

  function handleSave() {
    if (!canSave) return;
    onSave(trimmed);
    setText('');
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Fade-in dim backdrop. Stays put while the sheet slides. */}
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(160)}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: palette.overlayDim },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>

      {/* Anchor the sheet to the bottom; KAV lifts it above the keyboard. */}
      <KeyboardAvoidingView
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetAnchor}
      >
        <Animated.View
          entering={SlideInDown.duration(260)}
          exiting={SlideOutDown.duration(220)}
          style={[
            styles.sheet,
            {
              backgroundColor: palette.background,
              shadowColor: '#000',
            },
          ]}
        >
          <View style={[styles.dragHandle, { backgroundColor: palette.bgTertiary }]} />

          <View style={styles.sheetHeader}>
            <ThemedText type="sen-title-3">New rule</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={handleClose}
              hitSlop={10}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            >
              <IconSymbol name="xmark" size={20} color={palette.textMuted} />
            </Pressable>
          </View>

          <View
            style={[
              styles.fieldWrap,
              { borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          >
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="e.g. No gym before class"
              placeholderTextColor={palette.textMuted}
              multiline
              autoFocus
              style={[styles.fieldInput, { color: palette.text }]}
              onSubmitEditing={handleSave}
              returnKeyType="done"
            />
          </View>

          <Pressable
            disabled={!canSave}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: palette.buttonFill,
                opacity: !canSave ? 0.4 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <ThemedText type="sen-headline" style={{ color: palette.buttonLabel }}>
              Save rule
            </ThemedText>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: 'row',
    gap: 8,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    marginTop: 24,
    padding: 20,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  list: {
    marginTop: 20,
    gap: 8,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ruleBody: {
    flex: 1,
  },
  sheetAnchor: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    padding: 20,
    paddingTop: 12,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 36,
    gap: 14,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldWrap: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 96,
  },
  fieldInput: {
    fontSize: 17,
    lineHeight: 22,
    minHeight: 68,
    textAlignVertical: 'top',
  },
  saveBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
