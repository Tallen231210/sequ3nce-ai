# Electron App Rebuild Spec — Swift Parity

Master specification for rebuilding the Sequ3nce Electron desktop app to match the Swift macOS app. This document is the single source of truth for tracking progress.

**Current Electron Version:** 1.2.45
**Target Parity With:** Swift app v2.2.0 (build 73)
**Build Status:** Compiles clean as of 2026-02-23

---

## Architecture Overview

The Electron app needs **two UI modes**, controlled by a feature flag from the backend:

- **Legacy Mode** (400x600): Compact recording window for teams without meeting bot. Already built.
- **Meeting Bot Hub Mode** (1200x800): Full sidebar navigation with dashboard, analytics, call history, coaching, etc. **Needs to be built.**

The backend (Convex) is shared — both apps hit `https://ideal-ram-982.convex.site`. No backend changes needed.

---

## Phase 1: Meeting Bot Hub Shell

**Goal:** Transform the Electron app from a single-screen recording tool into a full hub with sidebar navigation when meeting bot is enabled.

### 1.1 Feature Flag Check
- [x] Add `isMeetingBotEnabled(teamId)` call to `convex.ts` → `POST /isMeetingBotEnabled`
- [x] On login, check flag and store in state
- [x] If enabled: resize window to 1200x800, show hub layout
- [x] If disabled: keep current 400x600 recording layout (no changes)

### 1.2 Hub Layout with Sidebar
- [x] Create `MeetingBotHub.tsx` — main layout component
- [x] Left sidebar (200px, light background):
  - Logo at top
  - Nav items with icons: Dashboard, Stats, Calls, Schedule, Role Play, Messages, Resources, Coaching, Settings
  - Active item highlighted (black bg, white text — matches Swift)
  - User name + team at top
  - Logout button at bottom
- [x] Right content area fills remaining space
- [x] Route between views based on selected sidebar item (placeholder views for now)

### 1.3 Window Management Updates
- [x] `index.ts`: IPC handler `app:set-window-size` resizes main window
- [x] Update `minWidth`/`minHeight` for hub mode (900x600)
- [x] Keep legacy 400x600 mode unchanged for non-bot teams
- [x] Restore 400x600 on logout from hub mode

### 1.4 Convex Service Updates
Add these methods to `src/renderer/convex.ts`:
- [x] `isMeetingBotEnabled(teamId)` → POST
- [x] `needsCalendarOnboarding(closerId)` → POST
- [x] `getActiveCallForCloserBot(closerId)` → POST
- [ ] `getPendingQuestionnaireInfo(closerId)` → POST (no HTTP endpoint yet)

**Testable outcome:** Login with a bot-enabled team → see 1200x800 window with sidebar nav. Clicking nav items switches the content area (can be placeholder views initially).

---

## Phase 2: Dashboard + Stats

**Goal:** Build the home screen and analytics views.

### 2.1 Dashboard View
- [x] Create `DashboardView.tsx`
- [x] Welcome header: "Good {morning/afternoon/evening}, {firstName}" + date
- [x] Quick Stats Row (4 cards): Calls This Week, Close Rate, Cash Collected, Avg Duration
- [x] Today's Schedule section: next 5 meetings with time, title, join button
- [x] Recent Calls section: last 5 calls with prospect, duration, outcome badge
- [ ] Pending Questionnaires banner (if count > 0): orange alert with count + action button (deferred — no HTTP endpoint for `getPendingQuestionnaireInfo`)

### 2.2 Stats/Analytics View
- [x] Create `StatsView.tsx`
- [x] Period selector: Today, This Week, This Month, Last 30 Days
- [x] 6 stat cards (2 rows of 3)
- [x] Team Comparison section with bar visualization
- [x] Money Overview (3 cards with trend arrows)
- [x] "Where You're Losing Money" — objection breakdown with horizontal bars
- [x] Objection Handling — overcome rates with color-coded bars
- [x] Insights section with lightbulb icons

### 2.3 Convex Service Updates
- [x] `getCloserStats(closerId, period)` → POST `/getCloserStats`
- [x] `getAnalyticsSummary(closerId, teamId, period)` → POST `/getCloserAnalyticsSummary`
- [x] `getLostDealsByObjection(closerId, teamId, period)` → POST `/getCloserLostDeals`
- [x] `getObjectionAnalysis(closerId, teamId, period)` → POST `/getCloserObjectionAnalysis`
- [x] `getCalendarEvents(email, teamId, startDate, endDate)` → GET `/getCloserEventsByEmail`
- [x] `getCallHistory(closerId, limit)` → POST `/getCallHistory`

**Testable outcome:** Dashboard shows real data (stats, today's schedule, recent calls). Stats view shows analytics with working period selector.

---

## Phase 3: Bot Integration

**Goal:** Add meeting bot polling, active call detection, and bot-specific post-call flow.

### 3.1 Bot Status Polling
- [x] Integrated bot polling into MeetingBotHub state (no separate hook needed)
- [x] Poll `getActiveCallForCloserBot(closerId)` every 3 seconds
- [x] Track states: idle → active (via polling) → questionnaire (on call end)
- [x] When bot becomes active: auto-switch to full-screen active call view
- [x] When bot call ends: 30s minimum duration guard, then show post-call questionnaire
- [ ] Poll `getPendingQuestionnaireInfo(closerId)` for pending count (no HTTP endpoint)

### 3.2 Active Call View
- [x] Create `ActiveCallView.tsx`
- [x] Meeting title + "with [Prospect]" + duration timer
- [x] "Recording" badge (green dot with pulse animation)
- [x] Tabbed interface: Ammo | Transcript | Notes | Resources
- [x] Ammo tab: V2 analysis (engagement, beliefs, objections, pain points)
- [x] Transcript tab: live segments with speaker labels, auto-scroll
- [x] Notes tab: auto-save with 2s debounce
- [x] Resources tab: team resources with copy/open links
- [x] Action buttons: "Request Reinforcement" (orange, 30s cooldown) + "Call Going Long" (15/30/45/60m options)
- [x] Talk ratio indicator in bottom bar

### 3.3 Bot Post-Call Questionnaire
- [x] Create `PostCallQuestionnaire.tsx`
- [x] Triggered by bot call end (30s minimum duration)
- [x] Prospect name (pre-filled from bot data)
- [x] 4 outcome buttons: Closed (green), Follow Up (amber), Lost (red), No Show (gray)
- [x] Conditional fields per outcome (objections, values, decision maker)
- [x] "Objections Overcome" dropdown for closed deals
- [x] Lead quality 1-10 color-coded scale
- [x] Dollar value presets ($1k-$25k) + custom input
- [x] On submit: calls `completeCallWithOutcome`

### 3.4 Calendar Onboarding
- [x] Create `BotOnboardingView.tsx`
- [x] Step 1: Welcome screen
- [x] Step 2: Connect ICS calendar URL (with help instructions)
- [x] Step 3: Sync calendar + "All Set" confirmation
- [x] Blocks all other UI until completed (overlay)
- [x] Check `needsCalendarOnboarding(closerId)` on hub mount

### 3.5 Quick Bot
- [x] "Quick Bot" button in sidebar (above nav items)
- [x] Modal with meeting URL + optional prospect name
- [x] URL validation (zoom, google meet, teams, or https)
- [x] Calls `createQuickBot(meetingUrl, closerId, teamId, prospectName?)`
- [x] Loading state + error handling

### 3.6 Convex Service Updates
- [x] `createBotForMeeting(closerId, teamId, meetingUrl, meetingTitle?, prospectName?)` → POST
- [x] `createQuickBot(meetingUrl, closerId, teamId, prospectName?)` → POST
- [x] `cancelBot(botId)` → POST
- [x] `getUpcomingBotsForCloser(closerId)` → POST
- [x] `excludeCalendarEvent(closerId, calendarEventId, eventTitle?)` → POST
- [x] `requestReinforcement(teamId, closerId, closerName, callId?, message?)` → POST
- [x] `callGoingLong(teamId, closerId, callId?, estimatedMinutes)` → POST
- [ ] `getAmmoItems(callId)` → GET (no HTTP endpoint — using V2 analysis instead)
- [x] `getTranscriptSegments(callId)` → GET
- [x] `getAmmoAnalysis(callId)` → GET
- [x] `isAmmoV2Enabled(teamId)` → GET
- [x] `updateCallNotes(callId, notes)` → POST
- [x] `getActiveResources(teamId)` → GET
- [x] `saveMeetingPlatform(closerId, platform)` → POST
- [x] `markOnboardingCompleted(closerId)` → POST

**Testable outcome:** Bot polling detects active bot calls, shows active call view with live ammo/transcript, post-call questionnaire appears when call ends.

---

## Phase 4: Call History + Reviews

**Goal:** Build the call history list and call detail view with video player and comments.

### 4.1 Call History View
- [x] Create `CallHistoryView.tsx`
- [x] Search bar (filter by prospect name)
- [x] Outcome filter buttons: All, Closed, Not Closed, No Show, Follow Up
- [x] Table: Date/Time, Prospect, Duration, Outcome badge, Talk %, Video icon, Review status
- [x] Rows clickable → open call detail sheet
- [x] Outcome badges: green (closed), red (lost), gray (no-show), blue (follow-up)
- [x] Empty state with icon and message
- [x] Wired into MeetingBotHub sidebar navigation

### 4.2 Call Detail Sheet
- [x] Create `CallDetailSheet.tsx`
- [x] Header: Prospect name, date, duration, outcome badge
- [x] Buttons: Flag for Review (toggle), Share Link, Close
- [x] Recording: HTML5 `<video>` player with auto URL refresh
- [x] AI Summary section
- [x] Ammo Analysis: color-coded type badges (emotional, urgency, budget, etc.)
- [x] Full Transcript: speaker labels (You/Prospect), collapse/expand toggle
- [x] Post-Call Data: outcome, talk ratio, cash, recording type

### 4.3 Share Link
- [x] "Share Link" button in call detail header (video calls only)
- [x] Calls `createSharedLink(callId, closerId, teamId)` → POST
- [x] Copies URL to clipboard
- [x] Shows "Copied!" confirmation for 2 seconds (green checkmark)
- [x] Shows "Failed" for 3 seconds on error (red warning)

### 4.4 Convex Service Updates
- [x] `getCallHistory(closerId, limit)` → POST (already added in Phase 2)
- [x] `flagCallForReview(callId, closerId)` → POST
- [x] `unflagCall(callId, closerId)` → POST
- [x] `refreshRecordingUrl(callId)` → POST
- [x] `createSharedLink(callId, closerId, teamId)` → POST
- [x] `getAmmoByCall(callId)` → GET (legacy ammo items)

**Testable outcome:** Call history shows real calls with filtering. Click a call to see detail sheet with video/transcript. Share Link creates and copies URL.

---

## Phase 5: Coaching + Feedback

**Goal:** Build the coaching tab with manager feedback and shared moments.

### 5.1 Coaching View
- [x] Create `CoachingView.tsx`
- [x] Segmented tabs: "Your Feedback" (with badge) | "Shared with You" (with badge)
- [x] **Feedback tab:** List of calls with feedback
  - Unread indicator (red dot), prospect name, relative date, comment count, preview
  - Click → open CallReviewPanel with video + threaded comments
  - Comments with threading (replies nested under parents, indented)
  - Comment input with reply-to indicator, Enter to send
  - Color-coded bubbles: orange for manager, blue for closer
- [x] **Shared Moments tab:** List of shared moments
  - Title, closer name, time range (MM:SS - MM:SS), creation date, notes
- [x] Wired into MeetingBotHub sidebar navigation

### 5.2 Notification Badges
- [x] Poll `getUnreadFeedbackCount(closerId)` every 30 seconds
- [x] Poll `getUnreadSharedMomentsCount(closerId)` every 30 seconds
- [x] Show badges on tab buttons (red count badge)
- [x] Mark feedback as read when opening call review
- [x] Mark shared moments seen when switching to that tab

### 5.3 Convex Service Updates
- [x] `getFeedbackForCloser(closerId)` → POST
- [x] `getCommentsForCall(callId)` → POST
- [x] `addCallComment(...)` → POST
- [x] `getSharedMoments(closerId)` → POST
- [x] `getUnreadFeedbackCount(closerId)` → POST
- [x] `getUnreadSharedMomentsCount(closerId)` → POST
- [x] `markFeedbackRead(callId, closerId)` → POST
- [x] `markSharedMomentsSeen(closerId)` → POST

**Testable outcome:** Coaching tab shows real feedback and shared moments with unread badges. Can click into calls and see threaded comments. Badges update when marking as read.

---

## Phase 6: Schedule Enhancements + Remaining Features

**Goal:** Bring the schedule view to parity and add remaining missing features.

### 6.1 Schedule View Updates
- [x] Create `ScheduleView.tsx` with calendar connection + event list
- [x] Add "Exclude" button on events (prevent bot from auto-joining)
- [x] Add "Join & Record" button that creates bot + opens meeting
- [x] Show platform badges on calendar events (Zoom, Google Meet, Teams)
- [x] Auto-sync every 5 minutes with last synced timestamp
- [x] Wired into MeetingBotHub sidebar navigation

### 6.2 Resources View
- [x] Create `ResourcesView.tsx` with type-specific icons (script, payment_link, document, link)
- [x] Resource cards: icon, title, type badge, description, content preview
- [x] Copy button with "Copied!" confirmation
- [x] Open button for URL resources
- [x] Wired into MeetingBotHub sidebar navigation

### 6.3 Settings View
- [x] Create `SettingsView.tsx` with account, calendar, diagnostics, sign out
- [x] Account section: avatar, name, email, team, change password form
- [x] Calendar Connection section: status, connect/disconnect
- [x] Support & Diagnostics: description textarea, Send Diagnostics, report ID with copy
- [x] Generate memorable 6-char report ID
- [x] Sign Out section
- [x] Wired into MeetingBotHub sidebar navigation

### 6.4 Menu Bar Updates
- [ ] Add meeting bot mode items:
  - Bot status indicator (Recording / Ready)
  - Quick Bot option
  - Upcoming Calls submenu (next 5 meetings)
- [ ] "Send Diagnostics" with spinner + confirmation
- [ ] "Check for Updates" option

### 6.5 Error Logging
- [ ] `logClientError(...)` → POST `/logClientError` (fire & forget)
- [ ] Track: closerId, teamId, errorType, errorMessage, stackTrace, context, platform, version
- [ ] Rolling `apiErrorCountLastHour` counter

### 6.6 Convex Service Updates
- [x] `submitDiagnosticReport(...)` → POST
- [x] `getCalendarStatus(email, teamId)` → GET
- [x] `disconnectCalendar(email, teamId)` → POST
- [ ] `logClientError(...)` → POST (if not already present)

**Testable outcome:** Schedule shows bot status on events, can exclude events. Diagnostics can be sent from menu bar. Error logging works silently in background.

---

## Phase 7: Polish + Release

**Goal:** Final testing, bug fixes, and release preparation.

### 7.1 Fix Known Issues
- [x] Fix messaging — created `MessagesView.tsx` using direct Convex HTTP endpoints (bypasses broken IPC relay)
- [x] Created `RolePlayView.tsx` with lobby + Daily.co iframe (previously only existed as separate window)
- [x] All 9 sidebar items now have real views — zero placeholders remain
- [ ] Verify all existing features still work after hub integration
- [ ] Test legacy mode (non-bot teams) still works

### 7.2 Update Versioning
- [x] Bump to v2.0.0 (major version for meeting bot hub)
- [ ] Update auto-updater configuration

### 7.3 Cross-Platform Testing
- [ ] Test on Windows (primary new user base)
- [ ] Test on macOS (verify no regressions)
- [ ] Verify auto-update works on both platforms

### 7.4 CI/CD Updates
- [ ] Verify GitHub Actions workflow still builds for Windows
- [ ] Update release notes template
- [ ] Test full release cycle: tag → build → publish → auto-update

### 7.5 Release
- [ ] Create `desktop-v2.0.0` tag
- [ ] GitHub Release with Windows + macOS builds
- [ ] Verify auto-update from v1.2.45 → v2.0.0

---

## Existing Features (Working — Verify Only)

These exist in the current Electron app and should still work. Verify during each phase:

| Feature | Status | Notes |
|---------|--------|-------|
| Login/Logout | Working | Email + password auth |
| Session persistence | Working | localStorage |
| System audio recording | Working | Legacy mode only |
| WebSocket streaming | Working | Legacy mode only |
| Post-call questionnaire | Working | Add "objections overcome" field |
| Ammo tracker (floating) | Working | Keep for legacy mode |
| Ammo filtering | Working | |
| Transcript view | Working | |
| Notes (auto-save) | Working | |
| Resources | Working | |
| Training playlists | Working | Verify endpoints still work |
| Role Play Room | Working | WebRTC via Jitsi |
| Schedule/Calendar | Working | ICS integration |
| Chat/Messaging | BROKEN | Fix in Phase 7 |
| System tray | Working | Update menu items for bot mode |
| Auto-update | Working | electron-updater |
| Audio level meter | Working | Legacy mode only |
| Keyboard shortcuts | Working | Cmd+Shift+A for ammo |
| Password change | Working | Settings modal |

---

## ConvexService Methods — Full Inventory

Complete list of all HTTP endpoints the Electron app needs to call. Methods already in `convex.ts` are marked existing.

### Authentication
| Method | Endpoint | Exists |
|--------|----------|--------|
| `loginCloser(email, password)` | POST `/loginCloser` | Yes |
| `changePassword(...)` | POST `/changePassword` | Check |

### Call Management
| Method | Endpoint | Exists |
|--------|----------|--------|
| `completeCallWithOutcome(...)` | POST `/completeCallWithOutcome` | Yes |
| `updateProspectName(callId, name)` | POST `/updateProspectName` | Yes |
| `updateCallNotes(callId, notes)` | POST `/updateCallNotes` | Yes |

### Ammo & Transcript
| Method | Endpoint | Exists |
|--------|----------|--------|
| `getAmmoItems(callId)` | GET `/getAmmoByCall` | Check |
| `getTranscriptSegments(callId)` | GET `/getTranscriptSegments` | Check |
| `isAmmoV2Enabled(teamId)` | GET `/isAmmoV2Enabled` | Check |
| `getAmmoAnalysis(callId)` | GET `/getAmmoAnalysis` | No |

### Resources
| Method | Endpoint | Exists |
|--------|----------|--------|
| `getActiveResources(teamId)` | GET `/getActiveResources` | Check |

### Meeting Bot
| Method | Endpoint | Exists |
|--------|----------|--------|
| `isMeetingBotEnabled(teamId)` | POST | No |
| `needsCalendarOnboarding(closerId)` | POST | No |
| `getActiveCallForCloserBot(closerId)` | POST | No |
| `getPendingQuestionnaireInfo(closerId)` | POST | No |
| `createBotForMeeting(...)` | POST | No |
| `createQuickBot(...)` | POST | No |
| `cancelBot(botId)` | POST | No |
| `getUpcomingBotsForCloser(closerId)` | POST | No |
| `excludeCalendarEvent(...)` | POST | No |
| `saveMeetingPlatform(closerId, platform)` | POST | No |
| `markOnboardingCompleted(closerId)` | POST | No |

### Dashboard & Analytics
| Method | Endpoint | Exists |
|--------|----------|--------|
| `getCloserStats(closerId, period)` | POST | No |
| `getAnalyticsSummary(closerId, teamId, period)` | POST | No |
| `getLostDealsByObjection(closerId, teamId, period)` | POST | No |
| `getObjectionAnalysis(closerId, teamId, period)` | POST | No |

### Call History & Reviews
| Method | Endpoint | Exists |
|--------|----------|--------|
| `getCallHistory(closerId, limit)` | POST | No |
| `flagCallForReview(callId, closerId)` | POST | No |
| `unflagCall(callId, closerId)` | POST | No |
| `refreshRecordingUrl(callId)` | POST | No |
| `createSharedLink(callId, closerId, teamId)` | POST | No |

### Coaching & Feedback
| Method | Endpoint | Exists |
|--------|----------|--------|
| `getFeedbackForCloser(closerId)` | POST | No |
| `getCommentsForCall(callId)` | POST | No |
| `addCallComment(...)` | POST | No |
| `getSharedMoments(closerId)` | POST | No |
| `getUnreadFeedbackCount(closerId)` | POST | No |
| `getUnreadSharedMomentsCount(closerId)` | POST | No |
| `markFeedbackRead(callId, closerId)` | POST | No |
| `markSharedMomentsSeen(closerId)` | POST | No |

### Chat (Already exists)
| Method | Endpoint | Exists |
|--------|----------|--------|
| `getMessagesForCloser(closerId)` | GET | Yes |
| `sendMessageFromCloser(...)` | POST | Yes |
| `getUnreadCountForCloser(closerId)` | GET | Yes |
| `markAllAsReadForCloser(closerId)` | POST | Yes |

### Calendar (Already exists)
| Method | Endpoint | Exists |
|--------|----------|--------|
| `getCalendarStatus(email, teamId)` | GET | Yes |
| `connectCalendar(email, teamId, icsUrl)` | POST | Yes |
| `disconnectCalendar(email, teamId)` | POST | Yes |
| `syncCalendar(email, teamId)` | POST | Yes |
| `getCalendarEvents(email, teamId, start, end)` | GET | Yes |

### Training (Already exists)
| Method | Endpoint | Exists |
|--------|----------|--------|
| `getAssignedPlaylists(closerId)` | GET | Yes |
| `getPlaylistDetails(playlistId, closerId)` | GET | Yes |

### Diagnostics
| Method | Endpoint | Exists |
|--------|----------|--------|
| `submitDiagnosticReport(...)` | POST | No |
| `logClientError(...)` | POST | Partial |

---

## UI Design Reference

The Electron app uses **TailwindCSS** and should match the Swift app's visual style:

**Colors:**
- Primary: Black (buttons, text, sidebar)
- Status: Green (closed/good), Red (lost/error), Orange (warning/follow-up), Blue (info)
- Neutral: zinc-50 through zinc-900
- Backgrounds: White content area, dark sidebar

**Typography:**
- Headers: text-2xl font-bold
- Section headers: text-xs font-medium uppercase tracking-wider text-zinc-500
- Body: text-sm
- Monospaced: font-mono for durations, timestamps, IDs

**Components:**
- Buttons: rounded-md with hover states
- Cards: bg-zinc-50 rounded-lg with subtle border
- Badges: small colored pill shapes (rounded-full)
- Tables: alternating row backgrounds, hover highlight
- Tabs: dark bg when active, lighter when inactive

**Polling Intervals (match Swift):**
- Bot status: 3 seconds
- Feedback badges: 30 seconds
- Messages: 2.5 seconds
- Ammo/transcript (during call): 1 second
- Calendar (menu bar): 5 minutes

---

## Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `src/renderer/views/MeetingBotHub.tsx` | 1 | Hub layout with sidebar |
| `src/renderer/views/DashboardView.tsx` | 2 | Home dashboard |
| `src/renderer/views/StatsView.tsx` | 2 | Analytics/stats |
| `src/renderer/views/ActiveCallView.tsx` | 3 | Live bot call view |
| `src/renderer/views/BotPostCallQuestionnaire.tsx` | 3 | Bot-specific questionnaire |
| `src/renderer/views/BotOnboardingView.tsx` | 3 | Calendar setup wizard |
| `src/renderer/views/CallHistoryView.tsx` | 4 | Call list + filters |
| `src/renderer/views/CallDetailSheet.tsx` | 4 | Call detail with video/transcript |
| `src/renderer/views/CoachingView.tsx` | 5 | Feedback + shared moments |
| `src/renderer/hooks/useBotPolling.ts` | 3 | Bot status polling |
| `src/renderer/hooks/useFeedbackPolling.ts` | 5 | Unread badge polling |
| `src/renderer/services/diagnostics.ts` | 6 | Diagnostic report collection |

## Files to Modify

| File | Phase | Change |
|------|-------|--------|
| `src/renderer/App.tsx` | 1 | Add bot mode detection, render hub or legacy |
| `src/renderer/convex.ts` | 1-6 | Add all new API methods |
| `src/index.ts` | 1, 6 | Window resize for hub mode, menu bar updates |
| `src/renderer/AmmoTrackerApp.tsx` | 3 | Integrate with bot call tracking |
| `src/renderer/components/PostCallQuestionnaire.tsx` | 3 | Add "objections overcome" field |

---

## Progress Tracker

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Meeting Bot Hub Shell | Not Started |
| Phase 2 | Dashboard + Stats | Not Started |
| Phase 3 | Bot Integration | Not Started |
| Phase 4 | Call History + Reviews | Not Started |
| Phase 5 | Coaching + Feedback | Not Started |
| Phase 6 | Schedule + Remaining | Not Started |
| Phase 7 | Polish + Release | Not Started |
