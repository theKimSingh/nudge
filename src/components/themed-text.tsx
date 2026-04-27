import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts } from '@/src/constants/theme';
import { useThemeColor } from '@/src/hooks/use-theme-color';

export type ThemedTextType =
  | 'default'
  | 'title'
  | 'defaultSemiBold'
  | 'subtitle'
  | 'link'
  | 'sen-display'
  | 'sen-large-title'
  | 'sen-counter'
  | 'sen-wordmark'
  | 'sen-title'
  | 'sen-title-2'
  | 'sen-title-3'
  | 'sen-input'
  | 'sen-headline'
  | 'sen-body'
  | 'sen-subheadline'
  | 'sen-footnote'
  | 'sen-label'
  | 'sen-label-bold'
  | 'sen-caption'
  | 'sen-caption-medium'
  | 'sen-caption-bold'
  | 'sen-caption-2'
  | 'sen-legal';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemedTextType;
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        senStyles[type],
        style,
      ]}
      {...rest}
    />
  );
}

const senStyles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: '#0a7ea4',
  },
  'sen-display': {
    fontFamily: Fonts.displayBold,
    fontSize: 40,
    letterSpacing: -0.5,
  },
  'sen-large-title': {
    fontFamily: Fonts.displayBold,
    fontSize: 36,
    letterSpacing: -0.5,
  },
  'sen-counter': {
    fontFamily: Fonts.displayBlack,
    fontSize: 36,
    letterSpacing: -0.5,
  },
  'sen-wordmark': {
    fontFamily: Fonts.displayRegular,
    fontSize: 28,
  },
  'sen-title': {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 26,
  },
  'sen-title-2': {
    fontFamily: Fonts.displayBold,
    fontSize: 22,
    letterSpacing: 0.3,
  },
  'sen-title-3': {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 20,
  },
  'sen-input': {
    fontFamily: Fonts.displayMedium,
    fontSize: 22,
  },
  'sen-headline': {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 16,
  },
  'sen-body': {
    fontFamily: Fonts.displayRegular,
    fontSize: 16,
  },
  'sen-subheadline': {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 15,
  },
  'sen-footnote': {
    fontFamily: Fonts.displayRegular,
    fontSize: 15,
  },
  'sen-label': {
    fontFamily: Fonts.displayRegular,
    fontSize: 14,
  },
  'sen-label-bold': {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 14,
  },
  'sen-caption': {
    fontFamily: Fonts.displayRegular,
    fontSize: 13,
  },
  'sen-caption-medium': {
    fontFamily: Fonts.displayMedium,
    fontSize: 13,
  },
  'sen-caption-bold': {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
  },
  'sen-caption-2': {
    fontFamily: Fonts.displayRegular,
    fontSize: 12,
  },
  'sen-legal': {
    fontFamily: Fonts.displayMedium,
    fontSize: 12,
  },
});
