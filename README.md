# Nudge

React Native + Expo application featuring an intelligent AI-powered Calendar and a Python backend.

## Features
- **Smart Calendar**: Custom React Native calendar view supporting daily, weekly, and monthly views with standard `.ics` import.
- **AI Magic Import**: Paste raw natural language text (e.g. "Meeting every Tuesday at 2pm") into the app, and the Python backend will automatically parse and plot the recurring events onto your calendar using Google's Gemini AI.
- **Advanced Event Creator**: Add standard or recurring events directly on your phone using native iOS/Android date and time pickers.

## Getting Started

To run the full stack, you need to start both the Python Backend and the Expo Frontend.

### 1. Python AI Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. Create a `.env` file inside the `backend` folder and add your Gemini API key:
   ```env
   GEMINI_API_KEY="your_api_key_here"
   ```
4. Start the server (runs on `localhost:8000`):
   ```bash
   python main.py
   ```

### 2. React Native Frontend

Open a **new** terminal window at the root of the project:

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

## Project Structure

```
app/              expo-router screens (tabs, calendar, modal)
assets/           branding, icons, splash screens
backend/          FastAPI Python backend for Gemini AI scheduling
components/       reusable UI components
constants/        theme configuration
utils/            calendar parsing utilities
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
