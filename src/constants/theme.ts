/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    accent: '#5E72E4',
    accentLight: '#8FA0F0',
    bgSecondary: '#F5F5F7',
    bgTertiary: '#EBEBF0',
    textSecondary: '#6B6B6B',
    textMuted: '#9A9A9A',
    textDisabled: '#C5C5C5',
    textInverse: '#FFFFFF',
    buttonFill: '#000000',
    buttonLabel: '#FFFFFF',
    tabActiveBg: '#26262A',
    surface: '#FFFFFF',
    surfaceText: '#11181C',
    overlayDim: 'rgba(0,0,0,0.6)',
    border: '#E5E7EB',
    error: '#DC2626',
    errorBg: '#FEE2E2',
    success: '#16A34A',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    accent: '#8FA0F0',
    accentLight: '#5E72E4',
    bgSecondary: '#1F2022',
    bgTertiary: '#2A2B2E',
    textSecondary: '#A8A9AC',
    textMuted: '#7C7D80',
    textDisabled: '#4A4B4E',
    textInverse: '#11181C',
    buttonFill: '#FFFFFF',
    buttonLabel: '#11181C',
    tabActiveBg: '#D4D5D8',
    surface: '#2A2B2E',
    surfaceText: '#ECEDEE',
    overlayDim: 'rgba(0,0,0,0.6)',
    border: '#2A2B2E',
    error: '#F87171',
    errorBg: '#3F1D1D',
    success: '#4ADE80',
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
    displayThin: 'DMSans_100Thin',
    displayRegular: 'DMSans_400Regular',
    displayMedium: 'DMSans_500Medium',
    displaySemiBold: 'DMSans_600SemiBold',
    displayBold: 'DMSans_700Bold',
    displayBlack: 'DMSans_900Black',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
    displayThin: 'DMSans_100Thin',
    displayRegular: 'DMSans_400Regular',
    displayMedium: 'DMSans_500Medium',
    displaySemiBold: 'DMSans_600SemiBold',
    displayBold: 'DMSans_700Bold',
    displayBlack: 'DMSans_900Black',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    displayThin: "'DMSans_100Thin', system-ui, sans-serif",
    displayRegular: "'DMSans_400Regular', system-ui, sans-serif",
    displayMedium: "'DMSans_500Medium', system-ui, sans-serif",
    displaySemiBold: "'DMSans_600SemiBold', system-ui, sans-serif",
    displayBold: "'DMSans_700Bold', system-ui, sans-serif",
    displayBlack: "'DMSans_900Black', system-ui, sans-serif",
  },
});
