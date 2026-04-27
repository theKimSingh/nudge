---
name: nudge-frontend
description: Use whenever working on Nudge's UI — anything touching screens, components, styling, theming, navigation/routing, animations, icons, fonts, or accessibility. Triggers on keywords like "screen", "component", "style", "stylesheet", "theme", "color", "dark mode", "light mode", "tab", "route", "navigation", "expo-router", "link", "modal", "icon", "font", "animation", "reanimated", "haptic", "scroll", "list", "flatlist", "image", "accessibility", "a11y", or any file path under `app/`, `components/`, `src/components/`, `src/features/*/screens/`, `src/features/*/components/`, `src/constants/theme.ts`, or `src/hooks/`.
---

# Nudge Frontend Skill

Authoritative rules for all UI work in the Nudge React Native + Expo app. The app is destined for the App Store, so accessibility and platform conventions are non-negotiable.

The user has chosen **`StyleSheet` only** for styling — no NativeWind, no styled-components, no Restyle, no Tamagui. Don't suggest adding them.

---

## Folder layout (feature-based)

`app/` is for routes only. Real UI code lives in `src/`.

```
app/                              # Expo Router routes — thin files only
├── _layout.tsx                  # Root layout (theme + AuthProvider)
├── (tabs)/                      # Tab group
├── (authed)/                    # Protected group (see backend skill)
└── modal.tsx                    # Modal route

src/
├── components/                  # App-wide shared components
│   ├── themed-text.tsx
│   ├── themed-view.tsx
│   ├── parallax-scroll-view.tsx
│   ├── haptic-tab.tsx
│   ├── external-link.tsx
│   ├── hello-wave.tsx
│   └── ui/                      # Primitives
│       ├── icon-symbol.tsx
│       ├── icon-symbol.ios.tsx
│       └── collapsible.tsx
├── constants/
│   └── theme.ts                 # Colors + Fonts (single source of truth)
├── hooks/
│   ├── use-color-scheme.ts
│   ├── use-color-scheme.web.ts
│   └── use-theme-color.ts
└── features/
    └── <feature>/
        ├── screens/<Screen>.tsx       # Screen components
        └── components/                # Feature-only components
```

Route files in `app/` should be thin — they import a screen component from `src/features/<feature>/screens/` and render it. Don't put real UI logic inline in a route file.

**File naming**: kebab-case for filenames (`profile-screen.tsx`), PascalCase for the exported component (`export function ProfileScreen()`). Matches the existing codebase.

**Migration note**: when first creating `src/`, move the existing `components/`, `constants/`, `hooks/` into it and update imports. The `@/*` path alias in [tsconfig.json](tsconfig.json) means `@/src/components/themed-text` works once moved. Until then, leave existing files where they are and add new code under `src/`.

---

## Styling — StyleSheet only

### The rules

- **Always** `StyleSheet.create({...})` at the bottom of the file.
- **No** inline style objects, except where a value is computed from a prop or animated value (`{ width: progress * 100 }`).
- **No** NativeWind, styled-components, Restyle, Tamagui, CSS files, SCSS.
- Style key names use `camelCase` and describe the **role** (`container`, `headerRow`, `primaryButton`, `cardTitle`), never the appearance (`redText`, `bigPadding`).
- Co-locate styles with the component that uses them. Don't extract to a shared `styles.ts`. If two components need the same styles, the styles belong on a shared component instead.

### Pattern

```typescript
import { StyleSheet } from 'react-native';
import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';

export function GreetingCard({ name }: { name: string }) {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Hello, {name}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
});
```

---

## Shared components — check before writing new

**Always** check `src/components/` and `src/components/ui/` before writing a new component. The existing primitives are:

| Need              | Use                       | Notes                                                                                         |
| ----------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| Text              | `ThemedText`              | `type` prop: `default \| title \| defaultSemiBold \| subtitle \| link`                        |
| View              | `ThemedView`              | Auto background based on light/dark                                                           |
| Icon              | `IconSymbol`              | Auto-switches SF Symbols (iOS) ↔ Material Icons (Android/web). Extend the mapping in [components/ui/icon-symbol.tsx](components/ui/icon-symbol.tsx) when adding a new icon. |
| Tab bar button    | `HapticTab`               | Adds iOS haptic feedback                                                                      |
| Link to web       | `ExternalLink`            | Opens in-app browser on native, normal link on web                                            |
| Parallax header   | `ParallaxScrollView`      | Pass `headerImage` and `headerBackgroundColor: { dark, light }`                               |
| Expandable        | `Collapsible`             | `title` + `children`                                                                          |
| Wave animation    | `HelloWave`               | Decorative                                                                                    |

### The "never import Text/View directly" rule

Never `import { Text, View } from 'react-native'` in a screen or feature component. Use `ThemedText` / `ThemedView` so light/dark mode just works. The only place raw `Text`/`View` is acceptable is **inside** a themed primitive's own implementation.

### Adding a new shared component

If you genuinely need a new shared component:

1. Place it in `src/components/` (or `src/components/ui/` for primitives).
2. Accept `lightColor?: string` and `darkColor?: string` props.
3. Read defaults via `useThemeColor({ light, dark }, 'colorName')` from [hooks/use-theme-color.ts](hooks/use-theme-color.ts).
4. Spread the underlying RN props (`...rest`) so callers can pass `accessibilityLabel`, `style`, etc.
5. Match the file/export naming pattern of existing components.

---

## Theming

All colors flow through `Colors.light` and `Colors.dark` in `src/constants/theme.ts` (currently at [constants/theme.ts](constants/theme.ts)).

### Adding a new semantic color

Add it to **both** `light` and `dark`. The `useThemeColor` hook is typed against the intersection — TypeScript will reject a name that's only in one.

```typescript
export const Colors = {
  light: {
    // ...existing
    error: '#B3261E',
    success: '#1B5E20',
  },
  dark: {
    // ...existing
    error: '#F2B8B5',
    success: '#A5D6A7',
  },
};
```

### Hard rules

- **Never** hardcode a hex value in a component's `StyleSheet`. If the color isn't in the theme, add it to the theme first.
- **Fonts** come from `Fonts` in `theme.ts` (Platform.select-based). Add new font roles there, never inline.

---

## Routing (Expo Router)

- File-based via `expo-router` v6. The structure is already wired up in [app/](app/).
- `typedRoutes: true` is set in [app.json](app.json) — use the typed `Link` and `router.push()` so route mistakes become **compile errors**, not runtime crashes.
- Group folders for layout sharing:
  - `app/(tabs)/` — tab navigation
  - `app/(authed)/` — protected screens (mount inside, redirect anon users from `_layout.tsx`)
  - `app/(modals)/` — modal presentations
- Deep links use the `nudge://` scheme already registered in `app.json`.
- Stack screen options live in the parent `_layout.tsx`, not on individual screens.

---

## Animations

- Use `react-native-reanimated` (already installed at v4).
- Keep animation logic in worklets (`useAnimatedStyle`, `useDerivedValue`, `withTiming`, etc.). Never trigger layout animations from a render.
- Match the existing patterns in [components/parallax-scroll-view.tsx](components/parallax-scroll-view.tsx) (scroll-driven animation with `useAnimatedScrollHandler` + `interpolate`) and [components/hello-wave.tsx](components/hello-wave.tsx) (CSS-style keyframe animation).

---

## Platform branching

Two patterns, in order of preference:

1. **File extension splits** for whole-component differences:
   - `foo.ios.tsx`, `foo.android.tsx`, `foo.web.tsx`
   - Already used by `icon-symbol.*` and `use-color-scheme.*`. Metro picks the right one automatically.
2. **`process.env.EXPO_OS`** for one-off conditionals inside a single function:
   - `if (process.env.EXPO_OS === 'ios') { ... }`
   - Used by [components/haptic-tab.tsx](components/haptic-tab.tsx) and [components/external-link.tsx](components/external-link.tsx).

Don't reach for `Platform.OS` from `react-native` — `process.env.EXPO_OS` is the Expo-recommended form and is already established in this codebase.

---

## Accessibility (App Store reviewers will check this)

- Every interactive element gets `accessibilityRole` (`button`, `link`, `header`, etc.) **and** `accessibilityLabel`.
- Touch targets are **≥ 44 × 44 pt** (iOS HIG). For icon-only buttons, set `hitSlop` to expand the touchable area.
- Color contrast meets **WCAG AA** (4.5:1 for normal text, 3:1 for large text and UI). When adding a new color to the theme, verify contrast against both the light and the dark background.
- Forms: `accessibilityLabel` on every input, error messages announced via `accessibilityLiveRegion` on Android / `AccessibilityInfo.announceForAccessibility` on iOS.
- Test with VoiceOver (iOS Settings → Accessibility → VoiceOver) before declaring a screen done.

---

## Performance

- Lists with **>20 items** use `FlatList` (or `FlashList` from `@shopify/flash-list` if added) with a `keyExtractor`. **Never** `.map()` inside a `ScrollView` for a list that can grow.
- `React.memo`, `useMemo`, `useCallback` only after profiling shows a real cost. Don't pre-optimise — React 19's compiler (enabled in `app.json` `experiments.reactCompiler`) handles most cases.
- Images: `import { Image } from 'expo-image'`, **never** `from 'react-native'`. `expo-image` gives you caching, transitions, and better memory behaviour.
- For images in lists, set explicit `width` and `height` (or `contentFit`) — undefined dimensions kill scroll perf.

---

## What NOT to do

- **No** Redux, Zustand, Recoil, MobX. Local state via `useState`; cross-screen state via the auth context (or a feature-scoped React context if genuinely needed).
- **No** CSS files, `.scss`, styled-components, NativeWind. `StyleSheet.create` only.
- **No** `Text`/`View` imports from `react-native` in screens — use `ThemedText`/`ThemedView`.
- **No** `Image` from `react-native` — use `expo-image`.
- **No** hardcoded colors in components — extend the theme.
- **No** new dependency without checking `package.json` first **and** asking the user before installing.

---

## Quick checklist before declaring frontend work done

1. Component file uses `StyleSheet.create` at the bottom?
2. No `Text`/`View` from `react-native`? (Use themed primitives.)
3. No hardcoded hex colors? (Use theme.)
4. New color → added to both `light` and `dark`?
5. New icon → mapping added in [components/ui/icon-symbol.tsx](components/ui/icon-symbol.tsx)?
6. Interactive elements → `accessibilityRole` + `accessibilityLabel`?
7. Touch targets → ≥ 44 × 44 pt?
8. List → `FlatList` with `keyExtractor`?
9. Image → `expo-image`?
10. Tested in **both** light and dark mode?