# Nudge

Voice-first daily planner. React Native + Expo, TypeScript, Supabase.

## Get started

```bash
nvm use            # or install Node 20
npm install
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see below)
npm run dev
```

Then press:

- `i` → iOS Simulator (macOS + Xcode)
- `a` → Android emulator / connected device
- `w` → Web
- Or scan the QR with the [Expo Go](https://expo.dev/go) app

If you've changed `.env`, restart Metro with `npx expo start -c` so it picks up the new values.

### Supabase env vars

We share **one** Supabase project. To get the keys:

1. Sign in to [supabase.com](https://supabase.com) — ask the project owner to add you as a member of the project.
2. Open the project → **Settings** → **API**.
3. Copy:
   - `Project URL` → `EXPO_PUBLIC_SUPABASE_URL`
   - `anon` / `public` key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Only the **anon** key. Never copy the `service_role` key into the app.

### Do I need to run `supabase db push`?

**No.** Migrations under [supabase/migrations/](supabase/migrations/) are checked in for history, but they're applied to the shared Supabase project once by whoever made them. As a teammate, you just consume the already-migrated database.

You only need the Supabase CLI if you're authoring a **new** schema change. In that case:

```bash
npx supabase login
npx supabase link --project-ref <ref>     # ref is in the project URL
npx supabase migration new <name>          # creates supabase/migrations/<ts>_<name>.sql
# edit the file, then:
npx supabase db push
```

Commit the migration file with your change so the rest of the team has it.

## Layout

```
src/
  app/                    expo-router screens
    (onboarding)/         welcome → info → auth → profile-setup → goals → notifications
    (tabs)/               main app tabs (home, supabase debug)
    _layout.tsx           root layout
    index.tsx             session/profile-aware redirect
  backend/                Supabase client, auth helpers, profiles service
    supabase.ts           single shared client (uses expo-secure-store for tokens)
    session.ts            useSession() hook + signOut helper
    onboarding-auth.ts    signUp / signIn / verifyOtp / persistSession
    profiles.ts           getProfile / updateProfile
  features/
    onboarding/           feature-sliced: screens, components, context
  components/             shared UI primitives (themed-text, themed-view, …)
  constants/              theme tokens
  hooks/                  shared hooks
supabase/
  migrations/             SQL migrations (apply via dashboard or db push)
assets/                   icons, splash, illustrations
app.json                  Expo config
```

Convention: feature-specific code lives in [src/features/](src/features/); shared code lives in [src/components/](src/components/), [src/hooks/](src/hooks/), [src/backend/](src/backend/).

## Auth flow (current)

Email + password only. OAuth (Apple / Google) is stubbed out.

1. New user signs up → Supabase sends a 6-digit OTP to their email.
2. User enters the OTP in the app → Supabase confirms email → trigger creates a `profiles` row.
3. App walks them through name → goal → notifications → marks `profiles.onboarded = true` → enters main tabs.

Tokens are stored in iOS Keychain / Android Keystore via [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/). Sessions auto-refresh while the app is foregrounded.

The "Confirm signup" email template in Supabase **must** use `{{ .Token }}` (the 6-digit code), not `{{ .ConfirmationURL }}` (the magic link). The mobile app expects the OTP path.

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

- Expo SDK 54, React Native 0.81, React 19, TypeScript
- `expo-router` for navigation
- Supabase (`@supabase/supabase-js`) for auth + Postgres
- `expo-secure-store` for token persistence
