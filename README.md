# Nudge

Nudge is a mobile voice assistant that helps users plan and actually follow through on their day. Instead of manually building schedules, users speak their plan each morning (~60 seconds), and the system generates a structured schedule and actively helps enforce it throughout the day.

## Motivation

We want to be able to create a personalized voice assistant that essentially keeps track of time. The voice assistant should be able to resolve time conflicts and remind the users to complete their tasks. The user should be able to delay some tasks (e.g. late for a meeting the assistant should send a message out) or add new tasks throughout the day. This allows the user to have a lot of flexibility while allowing them to achieve their own daily/weekly goals.

## Features

- Voice input for planning (speech-to-text using Wispr)
- Schedule generation and conflict resolution
- Calendar integration
- Notifications and reminders
- Backend with Supabase

## Setup

1. Clone the repository
2. Open in Xcode or VS Code with Swift support
3. Run `swift build` to build the package
4. For iOS app, create an Xcode project or use Swift Playgrounds

## Technologies

- SwiftUI for UI
- Supabase for backend
- Wispr for speech-to-text
- EventKit for calendar
- UserNotifications for notifications

## Current Status

- ✅ Project structure created
- ✅ Basic SwiftUI interface
- ✅ Supabase integration setup
- ✅ Calendar and notification services
- ✅ Builds successfully with Swift Package Manager

## Next Steps

1. **Configure Supabase**: Update URL and key in `SupabaseService.swift`
2. **Implement Wispr Integration**: Replace placeholder in `WisprService.swift`
3. **Add Schedule Parsing**: Implement logic to parse speech into tasks
4. **Conflict Resolution**: Add logic to detect and resolve time conflicts
5. **Task Management**: Add ability to delay, complete, or add tasks
6. **UI Enhancements**: Improve the interface with better views
7. **Testing**: Add unit tests and integration tests