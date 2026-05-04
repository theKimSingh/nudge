# Nudge Backend

Simple proxy server for handling CORS-restricted calendar imports.

## Setup

```bash
npm install
npm start
```

Server runs on `http://localhost:8000`

## Endpoints

- `GET /health` - Health check
- `GET /proxy-ics?url=<calendar-url>` - Fetch and proxy ICS calendar data (bypasses CORS)

## Why This Proxy?

Google Calendar and other calendar providers don't include CORS headers on their ICS endpoints. This causes "CORS policy" errors when fetching from a web browser.

The proxy server fetches the ICS data server-side (where CORS doesn't apply) and returns it to the client.

## Usage

Use the public address in iCal Format

The calendar must be made public and all events should be visible not only free/busy

Frontend calls `http://localhost:8000/proxy-ics?url=https://calendar.google.com/calendar/ical/...`

The backend fetches the URL and returns the ICS content.
