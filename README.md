# Nudge

Voice-first daily planner with **on-device speech recognition**. React Native + Expo, TypeScript, Supabase. Whisper Tiny EN runs locally via [react-native-executorch](https://github.com/software-mansion/react-native-executorch); no audio ever leaves the device.

## Get started

```bash
nvm use            # or install Node 20
npm install
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see below)

# First time on this machine — build the dev client (3-5 min):
npm run ios        # or `npm run android`

# After that, just start Metro:
npm run dev
```

> **You cannot use Expo Go.** The app ships custom native modules (ExecuTorch + live PCM mic) that have to be compiled into the binary. `npm run ios` / `npm run android` builds a *dev client* — a custom version of Expo Go with your project's native modules linked — and installs it on the simulator/device. After that, `npm run dev` does hot reloads exactly like Expo Go.

> Rebuild the dev client (re-run `npm run ios`) only when you add/remove a native module, change `app.json` plugin config, or bump iOS/Android deployment targets. Routine JS/TS edits don't need a rebuild.

iOS 17+ and Android 13+ required (ExecuTorch's floor). If you change `.env`, restart Metro with `npx expo start --dev-client -c` so it picks up the new values.

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

## Voice / on-device ASR

The voice flow is entirely local for transcription; only the resulting text is sent to the backend agent loop.

```
mic ─► react-native-live-audio-stream (16 kHz int16 PCM, 250 ms chunks)
       │
       ├─► RMS in dB ──► amplitude SharedValue (edge-glow) + dB-threshold VAD (endpoint detection)
       │
       └─► Whisper Tiny EN Quantized (react-native-executorch)
              │  stream() yields { committed, nonCommitted } token-by-token
              ▼
         setTranscript(live)  ─► FeedbackBand (text grows as user speaks)
              │
         on VAD speech_end
              ▼
         ws.send({ type: 'utterance_text', text })  ─► backend Gemini agent loop
```

### Example voice inputs

**Adding tasks:**
- "Add gym tomorrow at 7 AM for an hour"
- "Schedule standup at 10:30 on Tuesday, make it 30 minutes"
- "Breakfast, lunch, and dinner today"

**Constraints & preferences:**
- "No meetings before 10 AM" → stores a hard constraint
- "I hate mornings" → stores a soft preference (low energy in early hours)
- **"Don't schedule gym after 8 PM"** → stores an "avoid" constraint (do not do X after/before Y)
- "I'm usually done with work by 6, reschedule that meeting to earlier"

**Modifications:**
- "Undo that" / "Scratch that" → reverts the last operation
- "Move gym to 6 PM instead" → updates the most recent gym task
- "Mark that done" → completes a task

Key files: [src/features/agent/lib/pcm-stream.ts](src/features/agent/lib/pcm-stream.ts), [src/features/agent/lib/whisper-asr.ts](src/features/agent/lib/whisper-asr.ts), [src/features/agent/lib/vad.ts](src/features/agent/lib/vad.ts), [src/features/agent/hooks/use-agent-session.ts](src/features/agent/hooks/use-agent-session.ts).

First launch downloads the Whisper Tiny EN Quantized model (~75 MB) via [react-native-executorch-expo-resource-fetcher](https://github.com/software-mansion/react-native-executorch); cached after.

There's a standalone smoke-test route at [src/app/asr-smoke.tsx](src/app/asr-smoke.tsx) — visit `/asr-smoke` to validate the Whisper + mic plumbing in isolation.

## Layout

```
src/
  app/                    expo-router screens
    (onboarding)/         welcome → info → auth → profile-setup → goals → notifications
    (tabs)/               main app tabs (todo, calendar)
    asr-smoke.tsx         standalone Whisper streaming smoke-test screen
    _layout.tsx           root layout — calls initExecutorch() here
    index.tsx             session/profile-aware redirect
  backend/                Supabase client, auth helpers, profiles service
    supabase.ts           single shared client (uses expo-secure-store for tokens)
    session.ts            useSession() hook + signOut helper
    onboarding-auth.ts    signUp / signIn / verifyOtp / persistSession
    profiles.ts           getProfile / updateProfile
  features/
    agent/                voice session orchestrator (Whisper + VAD + WS)
      hooks/              use-agent-session
      lib/                pcm-stream, whisper-asr, vad, agent-ws
      components/         listening-overlay, feedback-band, edge-glow, transcript-stream
      context/            agent-session-context
    onboarding/           feature-sliced: screens, components, context
    todo/                 screens, components, context, api/, smart-drop, types
    calendar/             screens, components, utils
    profile/              screens
  components/             shared UI primitives (themed-text, themed-view, floating-mic, ui/icon-symbol)
  constants/              theme tokens
  hooks/                  shared hooks (use-color-scheme, use-theme-color, color-scheme-override)
  types/                  shared TS types (database, svg.d.ts)
  assets/                 icons, splash, illustrations
supabase/
  migrations/             SQL migrations (apply via dashboard or db push)
backend/                  Node/Express agent server (WS agent session, ICS proxy)
app.json                  Expo config — expo-build-properties pins iOS 17 / Android 13
ios/, android/            generated by `expo prebuild` — committed for dev-client builds
```

Convention: feature-specific code lives in [src/features/](src/features/) (including each feature's `api/`); shared code lives in [src/components/](src/components/), [src/hooks/](src/hooks/), [src/backend/](src/backend/).

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
| `npm run dev` / `npm run start` | Start Metro in dev-client mode (assumes dev client already installed) |
| `npm run ios` | Build + install the iOS dev client, then start Metro |
| `npm run android` | Build + install the Android dev client, then start Metro |
| `npm run web` | Start Metro targeting the browser (voice features disabled on web) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run doctor` | `expo-doctor` sanity check |
| `npm run lint` | Expo ESLint |
| `npm run reset-project` | Wipe the starter screens and start from a blank `app/` directory |

## Tech

- Expo SDK 54, React Native 0.81, React 19, TypeScript, New Architecture
- `expo-router` for navigation
- Supabase (`@supabase/supabase-js`) for auth + Postgres
- `expo-secure-store` for token persistence
- **Voice**: [react-native-executorch](https://github.com/software-mansion/react-native-executorch) (Whisper Tiny EN Quantized, on-device) + [react-native-live-audio-stream](https://github.com/iamtraction/react-native-live-audio-stream) (16 kHz int16 PCM mic capture)
- **Agent reasoning**: Google Gemini 2.5 Flash, called from the backend after the on-device transcript is shipped over WS
