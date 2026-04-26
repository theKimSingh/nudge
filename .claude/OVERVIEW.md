# Nudge — Project Overview

> This document is the single source of truth for *what Nudge is, why it exists, and what is in/out of scope*. It governs how Claude Code should reason about future prompts in this repo. When a request conflicts with this overview, surface the conflict before acting.

---

## 1. One-line description

**Nudge** is a mobile voice assistant that turns ~60 seconds of morning speech into a structured daily schedule and then actively helps the user follow through on it via reminders and rescheduling.

## 2. Motivation

Most planning apps stop at *organizing* the day — they don't help the user actually *execute* it. Nudge is built around the thesis that a voice-first, low-friction capture step plus assertive in-day enforcement (reminders → escalation → rescheduling) produces better follow-through than a calendar app.

The assistant should:
- Capture the day's plan from natural speech (no manual typing).
- Resolve time conflicts and produce a realistic schedule (meals, breaks, time estimates).
- Stay flexible: let users delay tasks, add new ones, and reschedule mid-day.
- Hold the user accountable, not just visualize their plan.

## 3. Target user & primary loop

- **Who**: students and individuals juggling classes, work blocks, gym, errands, etc., who want to commit to a daily plan but underuse traditional calendars.
- **Daily loop**:
  1. Morning: speak the plan (~60s) → schedule generated.
  2. Throughout day: receive reminders, check off tasks, optionally delay/add tasks.
  3. Missed task → smart rescheduling, escalating notifications.
  4. End of day: implicit check-in / streak / accountability signal.

## 4. Goals & scope

### 4.1 MVP (must-haves, English-only)
- Voice input to capture the daily plan.
- Speech → structured tasks + schedule.
- Smart schedule generator with constraints (e.g. "no gym before class"), meal/break insertion, duration estimates.
- Task checklist UI.
- Reminder notifications when tasks aren't completed.
- Smart rescheduling when tasks are missed.

### 4.2 Stretch goals (post-MVP, do not pre-build for these)
- Google Calendar / Canvas integration.
- Apple Calendar / `.ics` sync.
- Distraction detection (e.g. excessive screen time).
- Escalation system: notification → repeated alert → optional call.
- Context-aware notification blocking (during class/presentation).
- Personalization based on user behavior over time.
- Multi-language support.
- Streaks and focused study timers.
- TestFlight + App Store deployment.

### 4.3 Explicitly out of scope (for now)
- Manual calendar drag-and-drop editors as a primary input path — voice is the primary modality.
- Team/shared scheduling.
- Anything that requires server-side compute beyond Supabase + a single LLM call.
- Cross-device sync beyond what Supabase auth + tables give for free.

## 5. Risk-ranked feature list (high → low risk)

This is the order in which uncertainty resolves. When in doubt, *prove out higher-risk items first*; do not polish lower-risk surfaces while higher-risk pieces are unproven.

1. Voice input capture (permissions, recording, latency).
2. Speech → structured tasks + schedule (the core AI pipeline).
3. Task checklist UI.
4. Constraint-aware schedule generator.
5. Reminder notifications on incomplete tasks.

## 6. The three core challenges

These shape every architectural decision. New work should explicitly state which of these it addresses.

| # | Challenge | What "good" looks like |
|---|-----------|------------------------|
| 01 | **Voice agent** — design an AI agent + pipeline that turns natural speech into a reliable schedule | Low ASR word-error rate, high event-extraction accuracy, clean conversion to `.ics`, info persists across the day |
| 02 | **Implementation** — sync with other calendars (Apple Calendar, `.ics`), ship to TestFlight + App Store | Working end-to-end on a physical device under TestFlight |
| 03 | **User retention** — accessible UI, no notification fatigue, real habit formation | Daily check-in consistency, sustained notification engagement, low uninstall rate |

## 7. Evaluation plan

Three axes — every meaningful change should consider its impact on at least one:

1. **Model accuracy**
   - ASR word-error rate (speech → text).
   - Event extraction accuracy (text → structured tasks).
   - Correctness of generated `.ics` files.
   - Info persistence across edits/reschedules.
2. **Responsiveness**
   - End-to-end latency: utterance ended → schedule visible.
   - Use placeholders / progressive rendering when total latency is unavoidable.
3. **User study**
   - Task completion rate.
   - Daily check-in consistency.
   - Notification engagement during specific events.

A small in-house dataset will be built for accuracy testing. External datasets to lean on:
- `KNWEvans/routines` (Hugging Face).
- DeepMind `natural-plan/calendar_scheduling`.

## 8. Tech stack & architecture

### 8.1 Mobile app (this repo)
- **Expo SDK 54**, React Native 0.81, React 19, TypeScript.
- **Navigation**: `expo-router` (file-based), with route groups already scaffolded for `(onboarding)` and `(tabs)`.
- **State / data**: Supabase JS client (`@supabase/supabase-js`) with `@react-native-async-storage/async-storage` for session persistence.
- **UI primitives**: `expo-image`, `expo-haptics`, `expo-symbols`, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-svg`.
- **Fonts**: DM Sans via `@expo-google-fonts/dm-sans`.
- **Env**: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`). Never read service-role keys client-side.

### 8.2 Backend
- **Supabase** for auth, Postgres, RLS, and (later) Edge Functions for any trusted AI-pipeline orchestration.
- A **single LLM API call** per morning capture is the design target. Prefer one well-shaped call over chained calls until proven necessary.
- AI options on the table (decision pending — see §10):
  - OpenAI Whisper / tiny-Whisper for ASR.
  - Gemini API or Claude/OpenAI for structured extraction + scheduling.
  - Stretch: local on-device model (e.g. small Llama variant + tiny Whisper) for privacy/latency.

### 8.3 Repo layout (current)

```
app.json                Expo config
src/
  app/                  expo-router screens
    (onboarding)/       onboarding flow
    (tabs)/             main tabs (incl. supabase test screen)
    _layout.tsx         root layout
    modal.tsx           modal route
  backend/              supabase client, session, auth helpers
  features/             vertical feature slices
    onboarding/
      components/
      context/
      screens/
  components/           shared UI (themed-text, themed-view, parallax, etc.)
  constants/            theme tokens
  hooks/                shared hooks (theme, color scheme)
assets/                 icons, splash, illustrations
docs/                   long-form design docs (currently empty)
.claude/                Claude Code config + this overview
```

**Convention**: feature-specific code lives in `src/features/<feature>/{screens,components,context,api}`; truly shared code lives in `src/{components,hooks,constants,backend}`. Don't reach across feature folders.

## 9. Trade-offs to keep in mind

These come straight from the design doc and should color recommendations:

**Pros (lean into these)**
- Low friction — 60-second morning capture.
- Accountability beyond organization.
- Contextual awareness (personal constraints, Canvas, Google Calendar).
- Implementation simplicity — RN/Expo + Supabase + one API call.

**Cons (mitigate, don't ignore)**
- **Habit dependency**: app only works if users commit. → onboarding must build the habit; don't bury the morning capture.
- **Notification fatigue**: too many reminders → mute. → escalation must be earned, not default.
- **Privacy**: schedules are personal. → minimize data sent to third-party LLMs; never log raw transcripts beyond what's needed.
- **Crowded market**: similar products exist. → the wedge is voice-first capture + active enforcement, not "another planner."

## 10. Open decisions

When a prompt requires picking one of these, surface that the decision is open rather than silently choosing.

- **AI model for the voice → schedule pipeline**: off-the-shelf API (Gemini/Claude/OpenAI) vs on-device (tiny Whisper + small Llama). Prototype-first with API; revisit.
- **Calendar interop format**: `.ics` first vs native EventKit (iOS) first.
- **Notification escalation policy**: how aggressive, opt-in vs opt-out for calls.

## 11. How Claude Code should use this overview

- **Default to MVP scope** in §4.1. Don't pre-build stretch goals.
- **Respect the risk ordering** in §5: don't polish low-risk surfaces while the voice pipeline is unproven.
- **One LLM call** is the design target — flag designs that quietly chain multiple calls.
- **Privacy-first**: default to minimizing what leaves the device; treat schedule content as sensitive.
- **Feature-sliced layout** (§8.3): put new feature code under `src/features/<feature>/`, not in the global `components/` or `hooks/` folders.
- **Supabase keys**: only `EXPO_PUBLIC_SUPABASE_ANON_KEY` is allowed in client code. Anything needing service-role access goes in an Edge Function.
- **Notifications**: every new reminder/notification surface must consider the fatigue trade-off in §9.
- **When unsure**, ask which of the three core challenges (§6) the work is in service of — if the answer isn't clear, the work probably shouldn't happen yet.
