import * as Haptics from 'expo-haptics';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/src/components/themed-text';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

type IconName = ComponentProps<typeof IconSymbol>['name'];

export type SettingsRowAccessory = 'chevron' | 'pro' | 'none' | ReactNode;

type Props = {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  accessory?: SettingsRowAccessory;
  destructive?: boolean;
  disabled?: boolean;
};

export function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
  accessory = 'chevron',
  destructive = false,
  disabled = false,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];

  const titleColor = destructive ? palette.error : palette.text;
  const iconColor = destructive ? palette.error : palette.text;

  const rightNode = renderAccessory(accessory, palette);
  const isInteractive = !!onPress && !disabled;

  const handlePress = isInteractive
    ? () => {
        Haptics.selectionAsync();
        onPress?.();
      }
    : undefined;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      onPress={handlePress}
      disabled={!isInteractive}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          opacity: disabled ? 0.5 : pressed && isInteractive ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.iconWrap}>
        <IconSymbol name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.titleWrap}>
        <ThemedText type="sen-body" style={{ color: titleColor }}>
          {title}
        </ThemedText>
      </View>
      {subtitle ? (
        <ThemedText
          type="sen-footnote"
          numberOfLines={1}
          style={[styles.subtitle, { color: palette.textMuted }]}
        >
          {subtitle}
        </ThemedText>
      ) : null}
      {rightNode ? <View style={styles.accessory}>{rightNode}</View> : null}
    </Pressable>
  );
}

function renderAccessory(
  accessory: SettingsRowAccessory,
  palette: (typeof Colors)['light' | 'dark'],
): ReactNode {
  if (accessory === 'none') return null;
  if (accessory === 'chevron') {
    return <IconSymbol name="chevron.right" size={18} color={palette.textMuted} />;
  }
  if (accessory === 'pro') {
    return (
      <View style={[styles.proPill, { backgroundColor: palette.accent }]}>
        <ThemedText
          type="sen-caption-bold"
          style={[styles.proLabel, { color: palette.textInverse }]}
        >
          PRO
        </ThemedText>
      </View>
    );
  }
  return accessory;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  iconWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    minWidth: 60,
  },
  subtitle: {
    maxWidth: 200,
    flexShrink: 1,
    textAlign: 'right',
  },
  accessory: {
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 18,
  },
  proPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  proLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
  },
});
