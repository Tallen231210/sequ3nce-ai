# Swift App Calendar Implementation Guide

This document provides instructions for implementing the calendar integration feature in the Sequ3nce iOS/macOS Swift app, mirroring the desktop Electron implementation.

## Overview

Closers can connect their personal calendars (Google Calendar, Calendly, Cal.com, Outlook) via ICS feed URL. The app displays their upcoming events with a "next up" countdown.

## API Endpoints

All endpoints are hosted at: `https://ideal-ram-982.convex.site`

### 1. Get Calendar Status
Check if the closer has connected their calendar.

```
GET /getCloserCalendarStatusByEmail?email={closerEmail}
```

**Response:**
```json
{
  "connected": true,
  "icsUrl": "https://calendar.google.com/calendar/ical/...",
  "lastSynced": 1705123456000
}
```
or `null` if closer not found.

### 2. Connect Calendar
Connect a calendar by providing the ICS feed URL.

```
POST /connectCalendarByEmail
Content-Type: application/json

{
  "email": "closer@example.com",
  "icsUrl": "https://calendar.google.com/calendar/ical/..."
}
```

**Response:**
```json
{
  "success": true
}
```

### 3. Disconnect Calendar
Remove the calendar connection.

```
POST /disconnectCalendarByEmail
Content-Type: application/json

{
  "email": "closer@example.com"
}
```

**Response:**
```json
{
  "success": true
}
```

### 4. Sync Calendar
Manually trigger a calendar sync.

```
POST /syncCalendarByEmail
Content-Type: application/json

{
  "email": "closer@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "syncedEvents": 15
}
```

### 5. Get Events
Fetch calendar events within a date range.

```
GET /getCloserEventsByEmail?email={email}&startDate={timestamp}&endDate={timestamp}
```

**Query Parameters:**
- `email`: Closer's email address
- `startDate`: Unix timestamp in milliseconds (e.g., `1705104000000`)
- `endDate`: Unix timestamp in milliseconds

**Response:**
```json
[
  {
    "_id": "abc123",
    "uid": "event-uid-from-ics",
    "title": "Sales Call with John",
    "description": "Discovery call",
    "startTime": 1705140000000,
    "endTime": 1705143600000,
    "location": "Zoom",
    "isAllDay": false
  }
]
```

## UI Implementation

### Screen Structure

1. **Schedule Button** - In main navigation/menu
2. **Schedule View** - Shows connected status and events

### Schedule View States

#### State 1: Not Connected
Show a form to connect the calendar:

```
┌─────────────────────────────────────┐
│          Connect Your Calendar       │
│                                      │
│  Paste your ICS feed URL below to   │
│  sync your calendar with Sequ3nce   │
│                                      │
│  ┌────────────────────────────────┐ │
│  │ https://calendar.google.com... │ │
│  └────────────────────────────────┘ │
│                                      │
│        [Connect Calendar]            │
│                                      │
│  ▼ How do I find my ICS URL?        │
│                                      │
│  • Google Calendar:                  │
│    Settings → Integrate calendar →   │
│    Secret address in iCal format     │
│                                      │
│  • Calendly:                         │
│    Scheduled events → Export →       │
│    ICS feed URL                      │
│                                      │
│  • Outlook:                          │
│    Settings → Shared calendars →     │
│    Publish a calendar                │
│                                      │
│  • Cal.com:                          │
│    Settings → Calendar → ICS feed    │
└─────────────────────────────────────┘
```

#### State 2: Connected - Events List
Show upcoming events grouped by day:

```
┌─────────────────────────────────────┐
│  My Schedule                    ⟳ ✕ │
│─────────────────────────────────────│
│  ┌─────────────────────────────────┐│
│  │ 🟢 Next up in 23 minutes       ││
│  │    Call with Sarah Thompson    ││
│  └─────────────────────────────────┘│
│                                      │
│  TODAY                               │
│  ─────────────────────────────────  │
│  2:00 PM  Call with Sarah Thompson  │
│           45 min · Zoom              │
│                                      │
│  4:30 PM  Follow-up with Mike       │
│           30 min                     │
│                                      │
│  TOMORROW                            │
│  ─────────────────────────────────  │
│  9:00 AM  Discovery: ABC Corp       │
│           1 hour · Google Meet       │
│                                      │
│  11:30 AM Team sync                  │
│           30 min                     │
│                                      │
│  ─────────────────────────────────  │
│  Last synced: 5 minutes ago          │
│  [Disconnect Calendar]               │
└─────────────────────────────────────┘
```

### Data Models

```swift
struct CalendarStatus: Codable {
    let connected: Bool
    let icsUrl: String?
    let lastSynced: Int?  // Unix timestamp in ms
}

struct CalendarEvent: Codable, Identifiable {
    let _id: String
    let uid: String
    let title: String
    let description: String?
    let startTime: Int  // Unix timestamp in ms
    let endTime: Int    // Unix timestamp in ms
    let location: String?
    let isAllDay: Bool?

    var id: String { _id }

    var startDate: Date {
        Date(timeIntervalSince1970: Double(startTime) / 1000)
    }

    var endDate: Date {
        Date(timeIntervalSince1970: Double(endTime) / 1000)
    }

    var duration: String {
        let minutes = (endTime - startTime) / (1000 * 60)
        if minutes < 60 {
            return "\(minutes) min"
        }
        let hours = minutes / 60
        let remainingMinutes = minutes % 60
        if remainingMinutes > 0 {
            return "\(hours)h \(remainingMinutes)min"
        }
        return "\(hours) hour\(hours > 1 ? "s" : "")"
    }
}
```

### API Service

```swift
class CalendarService {
    private let baseURL = "https://ideal-ram-982.convex.site"

    func getStatus(email: String) async throws -> CalendarStatus? {
        let url = URL(string: "\(baseURL)/getCloserCalendarStatusByEmail?email=\(email.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")")!
        let (data, _) = try await URLSession.shared.data(from: url)
        return try? JSONDecoder().decode(CalendarStatus.self, from: data)
    }

    func connect(email: String, icsUrl: String) async throws -> Bool {
        var request = URLRequest(url: URL(string: "\(baseURL)/connectCalendarByEmail")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["email": email, "icsUrl": icsUrl])

        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode([String: Bool].self, from: data)
        return response["success"] ?? false
    }

    func disconnect(email: String) async throws -> Bool {
        var request = URLRequest(url: URL(string: "\(baseURL)/disconnectCalendarByEmail")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["email": email])

        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode([String: Bool].self, from: data)
        return response["success"] ?? false
    }

    func sync(email: String) async throws -> Int {
        var request = URLRequest(url: URL(string: "\(baseURL)/syncCalendarByEmail")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["email": email])

        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode([String: Any].self, from: data)
        return (response["syncedEvents"] as? Int) ?? 0
    }

    func getEvents(email: String, startDate: Date, endDate: Date) async throws -> [CalendarEvent] {
        let startMs = Int(startDate.timeIntervalSince1970 * 1000)
        let endMs = Int(endDate.timeIntervalSince1970 * 1000)

        let url = URL(string: "\(baseURL)/getCloserEventsByEmail?email=\(email.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")&startDate=\(startMs)&endDate=\(endMs)")!
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder().decode([CalendarEvent].self, from: data)
    }
}
```

### "Next Up" Countdown Logic

```swift
func timeUntilNextEvent(_ events: [CalendarEvent]) -> String? {
    let now = Date()

    // Find the next upcoming event
    guard let nextEvent = events.first(where: { $0.startDate > now }) else {
        return nil
    }

    let interval = nextEvent.startDate.timeIntervalSince(now)
    let minutes = Int(interval / 60)

    if minutes < 1 {
        return "Starting now"
    } else if minutes < 60 {
        return "\(minutes) minute\(minutes == 1 ? "" : "s")"
    } else {
        let hours = minutes / 60
        let remainingMinutes = minutes % 60
        if remainingMinutes > 0 {
            return "\(hours)h \(remainingMinutes)min"
        }
        return "\(hours) hour\(hours == 1 ? "" : "s")"
    }
}
```

### Date Grouping

```swift
func groupEventsByDay(_ events: [CalendarEvent]) -> [(String, [CalendarEvent])] {
    let calendar = Calendar.current
    let today = calendar.startOfDay(for: Date())
    let tomorrow = calendar.date(byAdding: .day, value: 1, to: today)!

    var groups: [String: [CalendarEvent]] = [:]

    for event in events {
        let eventDay = calendar.startOfDay(for: event.startDate)

        let label: String
        if eventDay == today {
            label = "Today"
        } else if eventDay == tomorrow {
            label = "Tomorrow"
        } else {
            let formatter = DateFormatter()
            formatter.dateFormat = "EEEE, MMMM d"
            label = formatter.string(from: event.startDate)
        }

        if groups[label] == nil {
            groups[label] = []
        }
        groups[label]!.append(event)
    }

    // Sort groups by date
    return groups.sorted { first, second in
        let order = ["Today", "Tomorrow"]
        let i1 = order.firstIndex(of: first.key) ?? Int.max
        let i2 = order.firstIndex(of: second.key) ?? Int.max
        if i1 != i2 { return i1 < i2 }
        return first.key < second.key
    }
}
```

## Implementation Checklist

- [ ] Add "Schedule" button to main navigation
- [ ] Create Schedule view/screen
- [ ] Implement CalendarService API calls
- [ ] Build "not connected" state with ICS URL input
- [ ] Build "connected" state with event list
- [ ] Add "Next up in X minutes" banner
- [ ] Group events by day (Today, Tomorrow, etc.)
- [ ] Show event details (time, duration, location)
- [ ] Add sync button with loading state
- [ ] Add disconnect button
- [ ] Handle error states (invalid URL, network errors)
- [ ] Auto-refresh events periodically (every 5 minutes)
- [ ] Update "next up" countdown in real-time (every minute)

## Notes

- ICS URLs are typically long - use a multi-line text field or paste detection
- The backend syncs calendars every 15 minutes automatically via cron job
- Events are stored server-side, so the app just needs to fetch and display
- The closer's email is used as the identifier (same email they log in with)
