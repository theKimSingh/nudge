# Nudge

React Native + Expo starter for the Nudge app.

## Get started

```bash
nvm use          # or install Node 20
npm install
npm run dev
```

`npm run dev` starts Metro and the Expo CLI. Press:

- `i` → iOS Simulator (macOS + Xcode)
- `a` → Android emulator / connected device
- `w` → Web
- Or scan the QR code with the [Expo Go](https://expo.dev/go) app on your phone (fastest path — works on mac or thinkpad, no native build needed)

## Backend (Supabase)

```bash
cp .env.example .env
# then fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Open the **Supabase** tab in the app to verify the connection. The client lives at [lib/supabase.ts](lib/supabase.ts); auth helpers + `useSession()` hook at [lib/auth.ts](lib/auth.ts).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start Metro + Expo CLI |
| `npm run ios` | Start Metro targeting iOS Simulator |
| `npm run android` | Start Metro targeting Android emulator/device |
| `npm run web` | Start Metro targeting the browser |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run doctor` | `expo-doctor` sanity check |
| `npm run lint` | Expo ESLint |
| `npm run reset-project` | Wipe the starter screens and start from a blank `app/` directory |

## Layout

```
app/              expo-router screens (tabs, modal)
components/       reusable UI
constants/        theme
hooks/            shared hooks
assets/           icons, splash
app.json          Expo config
```

## Tech

- Expo SDK 54, React Native 0.81, React 19
- `expo-router` for navigation
- TypeScript

## Migrating from the old Swift codebase

The repo was wiped and restarted as a fresh Expo project in one commit. If you had local Swift work in flight, stash or branch it first, then:

```bash
git fetch origin
git checkout main
git reset --hard origin/main   # discards local Swift work
nvm use
npm install
npm run dev
```
