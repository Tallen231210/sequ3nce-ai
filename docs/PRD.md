# Product Requirements Document (PRD)
# Seq3nce.ai — Sales Call Intelligence Platform

**Version:** 1.0
**Last Updated:** December 2024
**Author:** Tyler

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Target Market](#3-target-market)
4. [Product Overview](#4-product-overview)
5. [User Types & Personas](#5-user-types--personas)
6. [User Flows](#6-user-flows)
7. [Feature Specifications](#7-feature-specifications)
8. [Technical Architecture](#8-technical-architecture)
9. [Tech Stack](#9-tech-stack)
10. [Data Models](#10-data-models)
11. [External Integrations](#11-external-integrations)
12. [Business Model & Pricing](#12-business-model--pricing)
13. [MVP Scope](#13-mvp-scope)
14. [Post-MVP Roadmap](#14-post-mvp-roadmap)
15. [Success Metrics](#15-success-metrics)
16. [Legal & Compliance](#16-legal--compliance)
17. [Open Questions & Risks](#17-open-questions--risks)

---

## 1. Executive Summary

### What We're Building

An AI-powered sales call intelligence platform designed specifically for high-ticket sales teams (coaching companies, agencies, info product businesses). The platform consists of two core components:

1. **Desktop App for Closers** — Captures call audio, provides real-time "ammo tracking" (key moments from the conversation the closer can reference), and tags call outcomes.

2. **Web Dashboard for Managers** — Live view of all team calls, structured post-call data, recordings, transcripts, objection tracking, and no-show monitoring.

### Core Value Propositions

**For Sales Managers:**
- See what's happening on every call in real-time without asking
- Get structured data on why deals close or don't close
- Coach reps based on data, not guesswork
- Track no-shows and lead quality
- Never watch a full recording again — get the key moments extracted automatically

**For Closers:**
- Never forget important things the prospect said
- Have "ammo" ready when handling objections
- Simple tool that helps without getting in the way

### Key Differentiators from Gong/Chorus

| Gong/Chorus | Our Platform |
|-------------|--------------|
| Enterprise-focused ($250+/seat) | Built for high-ticket online sales ($99/seat) |
| Post-call analysis only | Real-time ammo tracker during calls |
| 20-30 minute processing delay | Live dashboard updates |
| Complex, feature-bloated | Simple, focused on what matters |
| 6-month enterprise sales cycle | Self-serve with $1K setup |

---

## 2. Problem Statement

### Current State (High-Ticket Sales Teams)

Sales managers at high-ticket businesses (coaching, agencies, info products) currently have no visibility into what happens on their closers' calls. The typical workflow:

1. Closer finishes a call
2. Manager pings on Slack: "How'd it go?"
3. Closer gives a biased, incomplete summary: "Didn't close, bad lead"
4. Manager has no idea what actually happened
5. To actually coach, manager must watch 45-minute recordings (they rarely do)
6. Patterns across the team go unnoticed
7. No-shows aren't tracked systematically
8. Marketing gets no feedback on lead quality

### Pain Points

**For Managers:**
- Spending all day asking "how'd that call go?" in Slack
- Getting incomplete, biased recaps from reps
- No visibility into calls until they end
- Having to watch full recordings to actually coach
- Can't spot patterns across the team
- Don't know which objections are killing deals
- No-shows aren't tracked

**For Closers:**
- Forgetting key things the prospect said during the call
- Can't remember "ammo" when handling objections at the end
- Trying to listen, think about script, and take notes simultaneously
- No tool that actually helps during the call

### Why Existing Solutions Don't Work

**Fireflies/Fathom:** Just recording and transcription. No real-time features. No sales-specific insights.

**Gong/Chorus:** Built for enterprise B2B SaaS. Pricing ($150-250/seat + platform fees) doesn't work for smaller teams. Overly complex. No real-time coaching. Not designed for high-ticket closer culture.

---

## 3. Target Market

### Primary Market: High-Ticket Online Sales Teams

**Company Profile:**
- Revenue: $500K - $10M+ per year
- Team size: 3-15 closers
- Deal size: $3,000 - $50,000+
- Sales model: Zoom calls booked from ads/content → setter qualifies → closer closes

**Industries:**
- Coaching/consulting businesses
- Marketing agencies
- Info product companies
- Course creators with sales teams
- Masterminds and high-ticket communities
- Done-for-you service providers

**Characteristics:**
- Sales team is critical to revenue
- Close rate improvements have massive impact
- Currently using basic tools (Fireflies, Fathom) or nothing
- Not enterprise — faster decision making, owner often involved
- Price sensitive but willing to pay for ROI
- Familiar with Zoom, GoHighLevel, Close CRM

### Buyer Persona

**Primary Buyer:** Business owner or Sales Manager

- Makes purchasing decisions quickly
- Cares deeply about close rates and rep performance
- Currently frustrated by lack of visibility
- Comfortable with $1K setup + $500-1500/month for the right solution
- Finds tools through Twitter/X, YouTube, communities, word of mouth

### Why This Market

1. **Underserved** — Enterprise tools ignore them, basic tools don't solve the real problem
2. **Real pain** — Close rate directly impacts revenue
3. **Can pay** — High-ticket businesses have margins to invest in tools
4. **Fast sales cycle** — Owner decides, no procurement process
5. **Network effects** — Tight-knit communities, word spreads fast

---

## 4. Product Overview

### Two-Product System

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                    WEB DASHBOARD                                │
│                    (For Managers)                               │
│                                                                 │
│    • Live calls view (who's on, key moments happening)          │
│    • Scheduled calls view (from calendar)                       │
│    • Completed calls (outcomes, recordings, transcripts)        │
│    • Team management (add/remove closers)                       │
│    • Billing management                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                         CONVEX (real-time sync)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                    DESKTOP APP                                  │
│                    (For Closers)                                │
│                                                                 │
│    • Runs on Mac and Windows                                    │
│    • Captures system audio (hears both sides of Zoom call)      │
│    • Shows floating "Ammo Tracker" window during calls          │
│    • Post-call outcome tagging                                  │
│    • Calendar integration for scheduled calls                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Core Concepts

**Call Statuses:**
- `SCHEDULED` — On calendar, hasn't started
- `WAITING` — Closer started recording, only one voice detected (prospect hasn't joined)
- `ON_CALL` — Two voices detected, call is happening
- `COMPLETED` — Call ended normally
- `NO_SHOW` — Prospect never joined
- `CANCELLED` — Removed from calendar

**Ammo:**
Key moments from the conversation that the closer can use later. Extracted in real-time by AI. Types include:
- Emotional statements ("I'll be disappointed in myself if I don't act")
- Urgency signals ("I need this done before January")
- Budget signals ("Money isn't the issue")
- Commitment signals ("This is exactly what I need")
- Objection previews ("My wife handles the finances")

**Outcomes:**
- `CLOSED` — Deal closed (includes deal value)
- `NOT_CLOSED` — Call happened, didn't close
- `NO_SHOW` — Prospect didn't show up
- `RESCHEDULED` — Moved to another time

---

## 5. User Types & Personas

### User Type 1: Admin (Manager/Owner)

**Who they are:**
- Business owner or sales manager
- Responsible for team performance
- Makes purchasing decisions
- May manage 3-15 closers

**What they need:**
- See all calls happening in real-time
- Understand why deals close or don't
- Coach reps without watching full recordings
- Track no-shows and lead quality
- Manage team (add/remove closers)
- Manage billing

**Access:**
- Web dashboard (full access)
- Can see all closers' data
- Can manage team and billing

### User Type 2: Closer (Sales Rep)

**Who they are:**
- Takes 5-10 sales calls per day
- Commission-based, motivated to close
- Busy, doesn't want extra admin work
- Uses Zoom desktop app

**What they need:**
- Help remembering key things prospect said
- Ammo ready when objections come up
- Simple tool that doesn't distract during calls
- Quick outcome tagging after calls

**Access:**
- Desktop app only (MVP)
- Sees only their own ammo tracker
- Cannot see other closers' data
- Cannot access billing or team management

---

## 6. User Flows

### Flow 1: Admin Signup & Onboarding

```
1. DISCOVER
   └── Finds product via Twitter, YouTube, referral, or community

2. LAND ON MARKETING SITE
   └── Sees value proposition, pricing, social proof

3. CLICK "GET STARTED"
   └── No free trial — goes straight to signup

4. CREATE ACCOUNT
   ├── Email
   ├── Password
   ├── Company name
   └── (Validated, account created)

5. PAYMENT
   ├── Sees pricing: $1,000 setup + $199/month + $99/seat
   ├── Enters payment info (Stripe)
   ├── Selects number of initial seats
   └── Payment processed

6. BOOK ONBOARDING CALL
   ├── Sees Calendly embed or link
   ├── Books setup call with your team
   └── Confirmation email sent

7. ONBOARDING CALL (with you)
   ├── You collect their sales script
   ├── You learn their common objections
   ├── You understand what "ammo" matters to them
   ├── You configure their custom AI prompts
   └── You walk them through adding closers

8. ADD CLOSERS
   ├── Admin enters closer name + email
   ├── System sends invite email to closer
   ├── Repeat for each closer
   └── Dashboard shows pending invites

9. READY
   └── Dashboard is live, waiting for closers to connect
```

### Flow 2: Closer Onboarding

```
1. RECEIVE INVITE EMAIL
   ├── Subject: "You've been invited to [App Name] by [Company]"
   ├── Body explains what the tool does
   └── CTA: "Download the App"

2. CLICK DOWNLOAD LINK
   └── Lands on download page with Mac/Windows options

3. DOWNLOAD APP
   ├── Clicks "Download for Mac" or "Download for Windows"
   └── Downloads .dmg or .exe file

4. INSTALL APP
   ├── Opens installer
   ├── Follows standard installation process
   └── App installed

5. OPEN APP & LOGIN
   ├── Opens app for first time
   ├── Enters email (from invite)
   ├── Receives magic link or enters password
   └── Authenticated

6. GRANT PERMISSIONS
   ├── Mac: Prompted to allow Screen Recording permission (for audio capture)
   ├── Windows: May need to allow through firewall
   └── Permissions granted

7. CONNECT CALENDAR
   ├── Prompted to connect Google Calendar
   ├── OAuth flow (Google login, grant permissions)
   └── Calendar connected

8. READY
   ├── App shows "Ready" state
   ├── Upcoming calls from calendar displayed
   └── Closer is set up
```

### Flow 3: Closer Daily Use (Normal Call)

```
1. BEFORE CALL
   ├── App shows upcoming calls from calendar
   └── Closer sees: "Call with Sarah M. in 15 minutes"

2. CALL STARTS
   ├── Closer joins Zoom call
   ├── App detects audio activity OR closer clicks "Start Recording"
   └── Recording begins, status = SCHEDULED

3. WAITING FOR PROSPECT
   ├── App captures audio, runs through transcription
   ├── Only closer's voice detected
   ├── Status changes to WAITING
   └── Dashboard shows: "Marcus — Waiting (prospect hasn't joined)"

4. PROSPECT JOINS
   ├── Second voice detected in transcription
   ├── Status changes to ON_CALL
   └── Dashboard shows: "Marcus — On Call with Sarah M."

5. DURING CALL
   ├── Audio streams to server
   ├── Deepgram transcribes in real-time
   ├── Claude extracts ammo from transcript
   ├── Ammo appears in floating tracker window:
   │     • "I'll be disappointed if I don't take action"
   │     • "Budget isn't the issue"
   │     • "Need to start before January"
   └── Dashboard shows live key moments

6. CALL ENDS
   ├── Closer ends Zoom call
   ├── App detects audio stopped OR closer clicks "End Recording"
   └── Recording stops

7. OUTCOME TAGGING
   ├── App prompts: "How did this call end?"
   ├── Options: Closed / Not Closed / Rescheduled
   ├── If Closed: "Deal value?" (enters amount)
   └── Outcome saved

8. POST-CALL
   ├── Recording uploaded to S3
   ├── Full transcript saved
   ├── Call appears in dashboard as COMPLETED
   └── Manager can review anytime
```

### Flow 4: Closer Daily Use (No-Show)

```
1. CALL SCHEDULED
   └── "Call with Tom R. at 2:00 PM"

2. CLOSER JOINS, WAITS
   ├── Closer starts recording at 2:00 PM
   ├── Only one voice detected (closer saying "hello?")
   ├── Status = WAITING
   └── Dashboard shows: "Jessica — Waiting (6 min)"

3. PROSPECT DOESN'T JOIN
   ├── After 10-15 minutes, closer gives up
   └── Closer clicks "End Recording"

4. NO-SHOW PROMPT
   ├── App detects only one speaker throughout
   ├── Prompts: "Looks like the prospect didn't join. What happened?"
   ├── Options: No-Show / Actually We Talked / Rescheduled
   └── Closer selects "No-Show"

5. LOGGED AS NO-SHOW
   ├── Call status = NO_SHOW
   ├── Dashboard shows: "Jessica — No-show (Tom R.)"
   └── No recording saved (or minimal recording)
```

### Flow 5: Manager Daily Use

```
1. OPEN DASHBOARD
   └── Manager logs in or is already authenticated

2. VIEW LIVE CALLS
   ├── Sees all closers currently on calls
   ├── For each live call:
   │     • Closer name
   │     • Prospect name (from calendar)
   │     • Duration
   │     • Status (Waiting / On Call)
   │     • Key moments as they happen
   └── Real-time updates via Convex subscriptions

3. VIEW SCHEDULED CALLS
   ├── Sees upcoming calls for today
   └── "David — 3:00 PM with Linda K."

4. VIEW COMPLETED CALLS
   ├── List of today's completed calls (or filtered by date)
   ├── For each call:
   │     • Closer name
   │     • Prospect name
   │     • Duration
   │     • Outcome (Closed $X / Not Closed / No-Show)
   │     • Quick summary of objections
   └── Click to expand details

5. REVIEW SPECIFIC CALL
   ├── Manager clicks on a call
   ├── Detail view shows:
   │     • Audio recording with playback
   │     • Full transcript (searchable)
   │     • Extracted ammo / key moments
   │     • Objections raised and how handled
   │     • Outcome and deal value
   └── Manager can coach based on this data

6. FILTER & SEARCH
   ├── Filter by closer
   ├── Filter by date range
   ├── Filter by outcome (Closed / Not Closed / No-Show)
   └── (Future: search transcripts)
```

### Flow 6: Admin Adds New Closer

```
1. GO TO TEAM SETTINGS
   └── Admin clicks "Team" or "Manage Closers"

2. CLICK "ADD CLOSER"
   └── Form appears

3. ENTER CLOSER DETAILS
   ├── Name
   └── Email

4. SUBMIT
   ├── Closer record created with status "Pending"
   ├── Invite email sent to closer
   ├── Billing updated (new seat added, prorated)
   └── Admin sees closer in list with "Pending" badge

5. CLOSER ACCEPTS
   ├── (Closer completes their onboarding flow)
   └── Status changes to "Active"
```

### Flow 7: Admin Removes Closer

```
1. GO TO TEAM SETTINGS
   └── Admin clicks "Team" or "Manage Closers"

2. FIND CLOSER
   └── Admin locates the closer to remove

3. CLICK "REMOVE"
   └── Confirmation prompt: "Remove Marcus from team?"

4. CONFIRM
   ├── Closer deactivated (can no longer log in)
   ├── Historical data retained (calls, recordings)
   ├── Seat removed from billing at end of cycle
   └── Closer removed from active list
```

---

## 7. Feature Specifications

### 7.1 Web Dashboard Features

#### 7.1.1 Live Calls View

**Purpose:** Real-time visibility into all calls happening right now.

**Displays:**
- List of all closers currently on calls or waiting
- For each:
  - Closer name
  - Prospect name (from calendar)
  - Status: WAITING or ON_CALL
  - Duration (time since recording started)
  - Key moments as they're detected (updates in real-time)

**Behavior:**
- Updates in real-time via Convex subscriptions
- No manual refresh needed
- Calls move to "Completed" when they end
- WAITING status shows when only one speaker detected
- ON_CALL status shows when two speakers detected

#### 7.1.2 Scheduled Calls View

**Purpose:** See what calls are coming up today.

**Displays:**
- List of scheduled calls from connected calendars
- For each:
  - Closer name
  - Prospect name (from calendar event)
  - Scheduled time
  - Time until call starts

**Behavior:**
- Pulls from closers' connected Google Calendars
- Shows only calls with external attendees (not internal meetings)
- Moves to "Live" when recording starts

#### 7.1.3 Completed Calls View

**Purpose:** Review calls that have ended.

**Displays:**
- List of completed calls (default: today, filterable)
- For each:
  - Closer name
  - Prospect name
  - Duration
  - Outcome: Closed ($X) / Not Closed / No-Show / Rescheduled
  - Brief summary or primary objection

**Filtering:**
- By closer (dropdown)
- By date range (date picker)
- By outcome (Closed / Not Closed / No-Show / All)

**Sorting:**
- Most recent first (default)

#### 7.1.4 Call Detail View

**Purpose:** Deep dive into a specific call.

**Displays:**
- Audio player with recording
- Full transcript with timestamps
- Extracted ammo / key moments (highlighted)
- Objections raised during the call
- How objections were handled (if AI can detect)
- Outcome and deal value
- Prospect info (from calendar)

**Behavior:**
- Audio playback with play/pause, seek, speed control
- Click on transcript timestamp to jump to that point in audio
- Download recording option
- (Future: video playback when available)

#### 7.1.5 Team Management

**Purpose:** Add and remove closers, manage seats.

**Displays:**
- List of all closers
- For each:
  - Name
  - Email
  - Status: Active / Pending
  - Date added
  - Calls this month (count)
- "Add Closer" button

**Actions:**
- Add closer (name, email → sends invite)
- Remove closer (with confirmation)

#### 7.1.6 Billing Management

**Purpose:** Manage subscription and payment.

**Displays:**
- Current plan details
- Number of seats
- Next billing date
- Payment method on file
- Invoice history

**Actions:**
- Update payment method (Stripe portal)
- View/download invoices
- (Seats auto-update when closers added/removed)

#### 7.1.7 Account Settings

**Purpose:** Manage admin account details.

**Displays:**
- Company name
- Admin email
- Password change option

**Actions:**
- Update company name
- Change email
- Change password
- Logout

### 7.2 Desktop App Features

#### 7.2.1 Ammo Tracker Window

**Purpose:** Show key moments from the conversation in real-time so closer can reference them.

**Displays:**
- Clean, simple list of ammo quotes
- Just the prospect's words that matter:
  - "I'll be disappointed in myself if I don't take action"
  - "Budget isn't the issue"
  - "I need this done before January"
  - "I've tried two other coaches already"

**Behavior:**
- Floating window that stays on top of other apps
- Updates in real-time as new ammo is detected
- Minimal — no clutter, just the quotes
- Closer can glance at it without losing focus on call

**What Ammo Includes:**
- Emotional statements
- Urgency signals
- Budget indicators
- Commitment signals
- Objection previews (spouse, timing, etc.)
- Pain points

**What Ammo Excludes:**
- Small talk
- Filler words
- Generic statements
- The closer's own speech

#### 7.2.2 Call Status Indicator

**Purpose:** Show the closer what's happening with the recording.

**Displays:**
- Current status: Ready / Recording / Processing
- Duration when recording
- Simple, unobtrusive

#### 7.2.3 Upcoming Calls

**Purpose:** Show the closer their scheduled calls.

**Displays:**
- Next few calls from calendar
- Prospect name
- Time

**Behavior:**
- Pulls from connected Google Calendar
- Helps closer know what's coming

#### 7.2.4 Start/Stop Recording

**Purpose:** Control when audio capture begins and ends.

**Options:**

Option A: Manual Control
- Closer clicks "Start Recording" when call begins
- Closer clicks "Stop Recording" when call ends

Option B: Auto-Detect
- App detects when Zoom audio starts and begins recording
- App detects when audio stops and ends recording

Option C: Hybrid (Recommended)
- App suggests "Start recording?" when scheduled call time arrives
- Closer confirms with one click
- Auto-detects when call ends (or closer can manually stop)

#### 7.2.5 Post-Call Outcome Prompt

**Purpose:** Tag call outcome immediately after call ends.

**If Normal Call (two speakers detected):**
```
"How did this call end?"

[ Closed ]        → prompts for deal value
[ Not Closed ]    → done
[ Rescheduled ]   → done
```

**If Likely No-Show (one speaker detected):**
```
"Looks like the prospect didn't join. What happened?"

[ No-Show ]           → logs as no-show
[ Actually We Talked ]→ shows normal outcome options
[ Rescheduled ]       → done
```

#### 7.2.6 Calendar Connection

**Purpose:** Link closer's calendar to see scheduled calls.

**Flow:**
- On first setup, prompt to connect Google Calendar
- OAuth flow with Google
- Pull events that have Zoom/Meet links and external attendees

#### 7.2.7 Login/Authentication

**Purpose:** Authenticate the closer.

**Flow:**
- Enter email (must match invite)
- Magic link sent to email, or password entry
- Authenticated via Clerk

#### 7.2.8 Permissions Setup

**Purpose:** Ensure app can capture audio.

**Mac:**
- Request Screen Recording permission (required for system audio)
- Guide user through granting permission in System Preferences

**Windows:**
- May need to allow through Windows Defender/firewall
- Generally more permissive than Mac

#### 7.2.9 Auto-Updates

**Purpose:** Keep the app up to date without manual downloads.

**Behavior:**
- App checks for updates on launch
- If update available, downloads in background
- Prompts user to restart to apply update
- Handled by electron-builder/electron-updater

### 7.3 Audio Processing Pipeline

#### 7.3.1 Audio Capture

**Source:** System audio loopback via electron-audio-loopback

**What's Captured:**
- Both sides of the conversation (closer and prospect)
- Everything the closer hears through their computer

**Format:**
- Capture as PCM or similar raw format
- Encode to appropriate format for streaming (e.g., WebM, Opus)

#### 7.3.2 Audio Streaming

**Method:** WebSocket connection from desktop app to processing server

**Behavior:**
- Establish connection when recording starts
- Stream audio chunks continuously (~100-250ms chunks)
- Handle reconnection if connection drops
- Close connection when recording ends

#### 7.3.3 Real-Time Transcription

**Service:** Deepgram Streaming API

**Configuration:**
- Model: nova-2 (or latest)
- Language: English
- Punctuation: enabled
- Diarization: enabled (speaker labels)
- Interim results: enabled (for real-time feel)

**Output:**
- Text chunks with speaker labels (Speaker 0, Speaker 1)
- Timestamps for each word/segment
- Confidence scores

#### 7.3.4 Ammo Extraction

**Service:** Claude API (claude-3-5-sonnet or similar)

**Trigger:** Process transcript chunks every 30-60 seconds, or on significant new content

**Prompt Structure:**
```
You are analyzing a sales call transcript to extract "ammo" — key moments
the sales rep can use later when handling objections.

Extract ONLY the prospect's exact words that fall into these categories:
- Emotional statements ("I'll be disappointed...", "I'm frustrated...")
- Urgency signals ("before January", "as soon as possible")
- Budget indicators ("money isn't the issue", "I just got a bonus")
- Commitment signals ("this is exactly what I need", "I'm ready")
- Objection previews ("my wife handles finances", "I've been burned before")
- Pain points (specific problems they're experiencing)

Rules:
- Only extract the PROSPECT's words, not the sales rep's
- Use their exact words when possible
- Keep each ammo item to 1-2 sentences max
- Ignore small talk, filler, and generic statements
- If nothing qualifies, return empty

[CUSTOM INSTRUCTIONS FOR THIS COMPANY]
{company_specific_instructions}

Transcript:
{transcript_chunk}

Return as JSON array:
[
  {"text": "exact quote", "type": "emotional|urgency|budget|commitment|objection_preview|pain_point"}
]
```

**Company-Specific Instructions:**
- Added during onboarding based on their sales script
- Example: "This company sells business coaching. Pay attention to mentions of revenue goals, team size, and previous coaching experiences."

#### 7.3.5 Speaker Detection (No-Show Logic)

**Method:** Track unique speaker IDs from Deepgram diarization

**Logic:**
```
speakers_detected = set()

for each transcript segment:
    speakers_detected.add(segment.speaker_id)

if len(speakers_detected) == 1 and duration > 5 minutes:
    status = WAITING

if len(speakers_detected) >= 2:
    status = ON_CALL
```

#### 7.3.6 Recording Storage

**Service:** AWS S3

**Process:**
1. Audio buffer collected during call
2. When call ends, encode to MP3 or M4A
3. Upload to S3 with structured key: `{team_id}/{call_id}/recording.mp3`
4. Save S3 URL to Convex

**Retention:**
- Keep recordings for 6 months (default)
- Admin can delete manually
- (Future: configurable retention)

### 7.4 Calendar Integration

#### 7.4.1 Google Calendar OAuth

**Scopes Needed:**
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/calendar.events.readonly`

**Flow:**
1. Closer clicks "Connect Google Calendar"
2. Redirect to Google OAuth consent screen
3. User grants permission
4. Receive access token and refresh token
5. Store tokens securely (encrypted)

#### 7.4.2 Calendar Sync

**Frequency:** Every 5-15 minutes, or on-demand

**What to Fetch:**
- Events from today and tomorrow
- Filter to events that:
  - Have a Zoom or Google Meet link
  - Have at least one external attendee (not from same domain)
  - Are not cancelled

**Data Extracted:**
- Event title
- Start time
- Attendee names/emails (for prospect name)
- Video call link

#### 7.4.3 Matching Calls to Events

When a recording starts:
1. Look for calendar events within ±15 minutes of current time
2. Match based on timing
3. Pull prospect name from matched event
4. If no match, prompt closer to enter prospect name (or leave blank)

---

## 8. Technical Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                            USERS                                        │
│                                                                         │
│          ┌─────────────────┐          ┌─────────────────┐               │
│          │     ADMIN       │          │     CLOSER      │               │
│          │  (Web Browser)  │          │  (Desktop App)  │               │
│          └────────┬────────┘          └────────┬────────┘               │
│                   │                            │                        │
└───────────────────┼────────────────────────────┼────────────────────────┘
                    │                            │
                    │ HTTPS                      │ HTTPS + WebSocket
                    │                            │
                    ▼                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                         FRONTEND LAYER                                  │
│                                                                         │
│   ┌─────────────────────────┐      ┌─────────────────────────────┐      │
│   │                         │      │                             │      │
│   │    WEB DASHBOARD        │      │      DESKTOP APP            │      │
│   │    (Next.js/Vercel)     │      │      (Electron/React)       │      │
│   │                         │      │                             │      │
│   └────────────┬────────────┘      └──────────────┬──────────────┘      │
│                │                                  │                     │
└────────────────┼──────────────────────────────────┼─────────────────────┘
                 │                                  │
                 │                                  │
                 ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                         BACKEND LAYER                                   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                         CONVEX                                  │   │
│   │                                                                 │   │
│   │  • Users, Teams, Closers                                        │   │
│   │  • Calls (scheduled, live, completed)                           │   │
│   │  • Ammo records                                                 │   │
│   │  • Transcripts                                                  │   │
│   │  • Real-time subscriptions                                      │   │
│   │  • Auth integration (Clerk)                                     │   │
│   │                                                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                  AUDIO PROCESSING SERVICE                       │   │
│   │                  (Node.js on Railway/Render)                    │   │
│   │                                                                 │   │
│   │  • Receives audio stream via WebSocket                          │   │
│   │  • Pipes to Deepgram for transcription                          │   │
│   │  • Runs Claude for ammo extraction                              │   │
│   │  • Uploads recordings to S3                                     │   │
│   │  • Writes results to Convex                                     │   │
│   │                                                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                 │                    │                    │
                 │                    │                    │
                 ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                      EXTERNAL SERVICES                                  │
│                                                                         │
│   ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐  │
│   │ Deepgram  │ │  Claude   │ │   AWS S3  │ │   Clerk   │ │  Stripe  │  │
│   │           │ │   API     │ │           │ │           │ │          │  │
│   │Transcribe │ │  Ammo     │ │  Storage  │ │   Auth    │ │ Payments │  │
│   └───────────┘ └───────────┘ └───────────┘ └───────────┘ └──────────┘  │
│                                                                         │
│   ┌───────────┐ ┌───────────┐                                           │
│   │  Google   │ │  Resend   │                                           │
│   │ Calendar  │ │           │                                           │
│   │   API     │ │  Emails   │                                           │
│   └───────────┘ └───────────┘                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Recording a Call

```
1. CLOSER STARTS RECORDING
   │
   ▼
2. DESKTOP APP captures system audio
   │
   ▼
3. Audio chunks streamed via WebSocket to AUDIO PROCESSING SERVICE
   │
   ├──► Service creates call record in CONVEX (status: WAITING)
   │
   ▼
4. Service pipes audio to DEEPGRAM streaming API
   │
   ▼
5. DEEPGRAM returns transcript chunks with speaker labels
   │
   ├──► Service updates speaker count in CONVEX
   │    (triggers status change: WAITING → ON_CALL when 2+ speakers)
   │
   ├──► Service sends transcript to CLAUDE for ammo extraction
   │
   ▼
6. CLAUDE returns ammo items
   │
   ├──► Service writes ammo to CONVEX
   │
   ▼
7. CONVEX pushes real-time updates:
   │
   ├──► DESKTOP APP receives new ammo, displays in tracker
   │
   ├──► WEB DASHBOARD receives updates, shows live call status
   │
   ▼
8. CALL ENDS - Closer stops recording
   │
   ▼
9. AUDIO PROCESSING SERVICE:
   ├──► Finalizes transcript
   ├──► Encodes recording to MP3
   ├──► Uploads to S3
   ├──► Saves recording URL to CONVEX
   │
   ▼
10. DESKTOP APP prompts for outcome
    │
    ▼
11. Closer tags outcome → saved to CONVEX
    │
    ▼
12. Call marked COMPLETED, visible in dashboard
```

---

## 9. Tech Stack

### Web Dashboard

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 14+ (App Router) | React framework with SSR |
| Hosting | Vercel | Deployment, edge functions |
| Database | Convex | Real-time database, backend functions |
| Auth | Clerk | User authentication, session management |
| Payments | Stripe | Subscriptions, seat-based billing |
| Email | Resend | Transactional emails (invites, notifications) |
| Styling | Tailwind CSS | Utility-first CSS |

### Desktop App

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Electron | Cross-platform desktop apps |
| UI | React | Component-based UI |
| Audio Capture | electron-audio-loopback | System audio capture |
| Database | Convex Client | Real-time sync with backend |
| Auth | Clerk (Electron flow) | Authentication |
| Packaging | electron-builder | Build, sign, distribute |
| Auto-Update | electron-updater | In-app updates |
| Styling | Tailwind CSS | Consistent with web |

### Audio Processing Service

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Node.js 20+ | JavaScript server runtime |
| Hosting | Railway or Render | Easy deployment, WebSocket support |
| WebSocket | ws (npm package) | Receive audio streams |
| Transcription | Deepgram SDK | Real-time speech-to-text |
| AI | Anthropic SDK (Claude) | Ammo extraction |
| File Storage | AWS SDK (S3) | Recording storage |
| Database | Convex Client | Write results |

### External Services

| Service | Purpose | Pricing Model |
|---------|---------|---------------|
| Convex | Database + real-time | Free tier → $25+/month |
| Deepgram | Transcription | ~$0.0043/minute |
| Claude API | Ammo extraction | Per token (~$0.01-0.05/call) |
| AWS S3 | File storage | ~$0.023/GB/month |
| Clerk | Authentication | Free tier → $0.02/MAU |
| Stripe | Payments | 2.9% + $0.30/transaction |
| Resend | Email | Free tier (3K/month) |
| Google Calendar API | Calendar sync | Free |

### Development Tools

| Tool | Purpose |
|------|---------|
| Git/GitHub | Version control |
| VS Code or Cursor | Code editor |
| Claude Code | AI-assisted development |
| Postman or Insomnia | API testing |

---

## 10. Data Models

### Convex Schema

```typescript
// teams
teams: defineTable({
  name: v.string(),
  stripeCustomerId: v.optional(v.string()),
  stripeSubscriptionId: v.optional(v.string()),
  plan: v.string(), // "active", "cancelled", etc.
  customAiPrompt: v.optional(v.string()), // Company-specific ammo extraction instructions
  createdAt: v.number(),
})

// users (admins)
users: defineTable({
  clerkId: v.string(),
  email: v.string(),
  name: v.optional(v.string()),
  teamId: v.id("teams"),
  role: v.string(), // "admin"
  createdAt: v.number(),
})
.index("by_clerk_id", ["clerkId"])
.index("by_team", ["teamId"])

// closers
closers: defineTable({
  email: v.string(),
  name: v.string(),
  teamId: v.id("teams"),
  status: v.string(), // "pending", "active", "deactivated"
  clerkId: v.optional(v.string()), // Set when they complete signup
  calendarConnected: v.boolean(),
  calendarRefreshToken: v.optional(v.string()), // Encrypted
  invitedAt: v.number(),
  activatedAt: v.optional(v.number()),
})
.index("by_team", ["teamId"])
.index("by_email", ["email"])
.index("by_clerk_id", ["clerkId"])

// scheduled_calls (from calendar sync)
scheduledCalls: defineTable({
  closerId: v.id("closers"),
  teamId: v.id("teams"),
  calendarEventId: v.string(),
  prospectName: v.optional(v.string()),
  prospectEmail: v.optional(v.string()),
  scheduledAt: v.number(), // Unix timestamp
  meetingLink: v.optional(v.string()),
  syncedAt: v.number(),
})
.index("by_closer", ["closerId"])
.index("by_team_and_date", ["teamId", "scheduledAt"])

// calls (actual calls, live or completed)
calls: defineTable({
  closerId: v.id("closers"),
  teamId: v.id("teams"),
  scheduledCallId: v.optional(v.id("scheduledCalls")), // Link to calendar event
  prospectName: v.optional(v.string()),
  status: v.string(), // "scheduled", "waiting", "on_call", "completed", "no_show", "cancelled"
  outcome: v.optional(v.string()), // "closed", "not_closed", "no_show", "rescheduled"
  dealValue: v.optional(v.number()),
  startedAt: v.optional(v.number()),
  endedAt: v.optional(v.number()),
  duration: v.optional(v.number()), // In seconds
  speakerCount: v.number(), // 1 = waiting, 2+ = on call
  recordingUrl: v.optional(v.string()), // S3 URL
  transcriptText: v.optional(v.string()), // Full transcript
  createdAt: v.number(),
})
.index("by_team", ["teamId"])
.index("by_closer", ["closerId"])
.index("by_team_and_status", ["teamId", "status"])
.index("by_team_and_date", ["teamId", "createdAt"])

// ammo (key moments extracted from calls)
ammo: defineTable({
  callId: v.id("calls"),
  teamId: v.id("teams"),
  text: v.string(), // The actual quote
  type: v.string(), // "emotional", "urgency", "budget", "commitment", "objection_preview", "pain_point"
  timestamp: v.optional(v.number()), // When in the call this was said
  createdAt: v.number(),
})
.index("by_call", ["callId"])
.index("by_team", ["teamId"])

// objections (specific objections raised)
objections: defineTable({
  callId: v.id("calls"),
  teamId: v.id("teams"),
  objectionText: v.string(), // "I need to think about it"
  category: v.optional(v.string()), // "spouse", "timing", "price", "trust", etc.
  handled: v.optional(v.boolean()),
  handlingResponse: v.optional(v.string()), // How closer responded
  timestamp: v.optional(v.number()),
  createdAt: v.number(),
})
.index("by_call", ["callId"])
.index("by_team", ["teamId"])
```

---

## 11. External Integrations

### 11.1 Stripe Integration

**Purpose:** Handle payments, subscriptions, seat-based billing

**Setup:**
- Create Stripe account
- Set up products:
  - Setup fee: $1,000 one-time
  - Platform fee: $199/month subscription
  - Seat fee: $99/month per seat (metered or quantity-based)
- Implement webhook handlers for:
  - `checkout.session.completed` — new customer signed up
  - `invoice.paid` — payment successful
  - `invoice.payment_failed` — payment failed
  - `customer.subscription.updated` — plan changed
  - `customer.subscription.deleted` — cancelled

**Seat Management:**
- Use Stripe subscription "quantities" for seats
- When admin adds closer: increment quantity, Stripe prorates
- When admin removes closer: decrement quantity at end of period

### 11.2 Clerk Integration

**Purpose:** Authentication for both web dashboard and desktop app

**Web Dashboard:**
- Standard Clerk + Next.js integration
- Use Clerk's `<SignIn>`, `<SignUp>` components
- Sync Clerk user to Convex user record

**Desktop App:**
- Use Clerk's OAuth/PKCE flow for Electron
- Open browser for auth, return to app
- Store session securely in Electron

**User Types:**
- Admins: Sign up via web, full dashboard access
- Closers: Invited by admin, authenticate in desktop app only

### 11.3 Deepgram Integration

**Purpose:** Real-time speech-to-text transcription

**API:** Streaming WebSocket API

**Configuration:**
```javascript
const deepgram = createClient(DEEPGRAM_API_KEY);

const connection = deepgram.listen.live({
  model: "nova-2",
  language: "en",
  smart_format: true,
  punctuate: true,
  diarize: true, // Speaker labels
  interim_results: true,
});
```

**Handling Results:**
```javascript
connection.on("transcriptReceived", (data) => {
  const transcript = data.channel.alternatives[0];
  const words = transcript.words;

  // Track speakers
  words.forEach(word => {
    speakersDetected.add(word.speaker);
  });

  // Send to Claude for ammo extraction periodically
  if (shouldProcessForAmmo()) {
    extractAmmo(transcript.text);
  }
});
```

### 11.4 Claude API Integration

**Purpose:** Extract ammo from transcripts

**Model:** claude-3-5-sonnet-20241022 (or latest)

**Implementation:**
```javascript
const anthropic = new Anthropic();

async function extractAmmo(transcript, companyPrompt) {
  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: buildAmmoPrompt(transcript, companyPrompt)
    }]
  });

  return JSON.parse(response.content[0].text);
}
```

### 11.5 AWS S3 Integration

**Purpose:** Store call recordings

**Setup:**
- Create S3 bucket
- Configure CORS for web playback
- Set up IAM credentials with minimal permissions

**Upload Flow:**
```javascript
const s3 = new S3Client({ region: "us-east-1" });

async function uploadRecording(teamId, callId, audioBuffer) {
  const key = `recordings/${teamId}/${callId}/recording.mp3`;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: audioBuffer,
    ContentType: "audio/mpeg",
  }));

  return `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;
}
```

### 11.6 Google Calendar Integration

**Purpose:** Sync closer calendars to show scheduled calls

**Setup:**
- Create Google Cloud project
- Enable Calendar API
- Configure OAuth consent screen
- Create OAuth 2.0 credentials

**OAuth Flow:**
1. Generate auth URL with scopes
2. User grants permission
3. Exchange code for tokens
4. Store refresh token (encrypted)
5. Use access token for API calls

**Syncing Events:**
```javascript
const calendar = google.calendar({ version: "v3", auth: oauthClient });

async function getUpcomingCalls(closerId) {
  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date().toISOString(),
    timeMax: endOfTomorrow().toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return response.data.items.filter(event =>
    hasExternalAttendee(event) && hasVideoLink(event)
  );
}
```

### 11.7 Resend Integration

**Purpose:** Send transactional emails

**Emails to Send:**
- Closer invite email
- (Future) Daily/weekly summaries
- (Future) Payment receipts

**Implementation:**
```javascript
import { Resend } from "resend";

const resend = new Resend(RESEND_API_KEY);

async function sendCloserInvite(email, name, companyName, downloadLink) {
  await resend.emails.send({
    from: "noreply@yourapp.com",
    to: email,
    subject: `You've been invited to join ${companyName} on [App Name]`,
    html: buildInviteEmailHtml(name, companyName, downloadLink),
  });
}
```

---

## 12. Business Model & Pricing

### Pricing Structure

| Component | Price | Description |
|-----------|-------|-------------|
| Setup Fee | $1,000 | One-time, covers custom AI training and onboarding |
| Platform Fee | $199/month | Base subscription, includes admin access |
| Seat Fee | $99/month/closer | Per closer using the desktop app |

### Example Pricing

| Team Size | Monthly Cost | Annual Cost (+ Setup) |
|-----------|--------------|----------------------|
| 3 closers | $199 + $297 = $496 | $1,000 + $5,952 = $6,952 |
| 5 closers | $199 + $495 = $694 | $1,000 + $8,328 = $9,328 |
| 10 closers | $199 + $990 = $1,189 | $1,000 + $14,268 = $15,268 |

### Unit Economics

**Costs per closer per month:**
- Transcription (Deepgram): ~$5-10 (assuming 5-7 calls/day, 45 min each)
- AI (Claude): ~$2-5
- Storage (S3): ~$1-2
- Infrastructure (Convex, hosting): ~$2-5

**Total cost per closer: ~$10-22/month**
**Revenue per closer: $99/month**
**Gross margin per closer: ~$77-89 (~80%)**

### Billing Implementation

**Stripe Setup:**
1. Product: "Platform" — $199/month subscription
2. Product: "Closer Seat" — $99/month, quantity-based
3. Product: "Setup Fee" — $1,000 one-time

**Flow:**
1. New customer → Checkout session for setup + platform + initial seats
2. Add closer → Update subscription quantity (+1)
3. Remove closer → Update subscription quantity (-1) at period end

---

## 13. MVP Scope

### Must Have (MVP)

**Web Dashboard:**
- [ ] Marketing/landing page
- [ ] Admin signup with Stripe payment
- [ ] Onboarding call booking (Calendly embed)
- [ ] Dashboard: Live calls view
- [ ] Dashboard: Scheduled calls view
- [ ] Dashboard: Completed calls view
- [ ] Call detail view (recording playback, transcript, ammo)
- [ ] Team management (add/remove closers)
- [ ] Invite email to closers
- [ ] Basic filters (by closer, date, outcome)
- [ ] Account settings
- [ ] Billing management (link to Stripe portal)

**Desktop App:**
- [ ] Mac and Windows builds
- [ ] Closer login (Clerk)
- [ ] Calendar connection (Google)
- [ ] Audio capture (system audio)
- [ ] Start/stop recording
- [ ] Ammo tracker floating window
- [ ] Post-call outcome tagging
- [ ] No-show detection and prompts
- [ ] Auto-updates

**Backend:**
- [ ] Audio processing service (WebSocket, Deepgram, Claude)
- [ ] Real-time transcription pipeline
- [ ] Ammo extraction with custom prompts per team
- [ ] Speaker detection (1 vs 2+ speakers)
- [ ] Recording storage (S3)
- [ ] Google Calendar sync
- [ ] Convex database and real-time subscriptions

**Infrastructure:**
- [ ] Vercel deployment (web)
- [ ] Railway/Render deployment (audio service)
- [ ] S3 bucket configuration
- [ ] Clerk setup
- [ ] Stripe setup
- [ ] Resend setup
- [ ] Domain and SSL

**Legal:**
- [ ] Privacy policy
- [ ] Terms of service

### Nice to Have (Defer to Post-MVP)

- [ ] Video recording and playback
- [ ] Outlook/Microsoft 365 calendar
- [ ] Transcript search
- [ ] Team analytics (close rates, patterns)
- [ ] Slack integration
- [ ] Daily/weekly email digests
- [ ] Objection categorization and analytics
- [ ] Closer dashboard (self-review)

---

## 14. Post-MVP Roadmap

### v1.1 (4-6 weeks after launch)
- Video recording + playback
- Improved audio quality options
- Bug fixes from user feedback

### v1.2 (2-3 months after launch)
- Team analytics dashboard
- Close rate tracking by closer
- Objection frequency analysis
- Outlook calendar support

### v1.3 (3-4 months after launch)
- Transcript search ("find all calls mentioning competitor X")
- Slack integration (notifications, summaries)
- Daily/weekly email digests

### Future Considerations
- Closer self-review dashboard
- CRM integrations (GoHighLevel, Close, HubSpot)
- AI coaching suggestions
- Call scoring
- Mobile app for managers
- White-label / agency version

---

## 15. Success Metrics

### Business Metrics

| Metric | Target (Month 3) | Target (Month 6) |
|--------|------------------|------------------|
| Paying Teams | 10 | 30 |
| Total Closers (seats) | 50 | 150 |
| MRR | $5,000 | $15,000 |
| Churn Rate | <5% | <5% |

### Product Metrics

| Metric | Target |
|--------|--------|
| Calls recorded per closer per day | 5+ |
| Ammo items extracted per call | 3-5 |
| Outcome tagging rate | >90% of calls |
| Daily active admins | >80% of paying teams |
| Daily active closers | >70% of seats |

### Quality Metrics

| Metric | Target |
|--------|--------|
| Transcription accuracy | >95% |
| Ammo relevance (user feedback) | >80% useful |
| Audio quality | Clear, no major issues |
| App crash rate | <1% |
| Dashboard load time | <2 seconds |

---

## 16. Legal & Compliance

### Recording Consent

**Considerations:**
- US federal law: One-party consent (closer knows = OK)
- Some states (California, etc.): Two-party consent required
- International: Varies by country

**Our Approach:**
- Terms of service state customer is responsible for local compliance
- Recommend customers inform prospects calls are recorded
- (Optional feature): Add automated "this call may be recorded" message

### Data Privacy

**Data We Store:**
- User account info (email, name)
- Call recordings (audio)
- Transcripts
- Calendar data (events, attendees)

**Privacy Measures:**
- Data encrypted in transit (HTTPS, WSS)
- Data encrypted at rest (S3 encryption, Convex encryption)
- Calendar tokens encrypted before storage
- No selling of customer data
- Clear data retention policies

### Required Documents

- [ ] Privacy Policy — What data we collect, how we use it, how to delete
- [ ] Terms of Service — Usage rules, liability limitations, payment terms
- [ ] Data Processing Agreement (DPA) — For enterprise customers (future)

---

## 17. Open Questions & Risks

### Open Questions

1. **Auto-detect vs manual start?**
   - Should app auto-start recording when Zoom audio detected?
   - Or require closer to click "Start"?
   - Recommendation: Hybrid — prompt when scheduled call time arrives

2. **What if calendar isn't connected?**
   - Can closer still use the app?
   - Do they enter prospect name manually?
   - Recommendation: Allow usage without calendar, prompt to enter prospect name

3. **What if call isn't on Zoom?**
   - System audio capture works for any app (Meet, Teams, phone through computer)
   - Just need to clarify this in onboarding

4. **How to handle internal calls?**
   - Closer might have internal team meetings
   - Don't want these recorded
   - Could filter by calendar attendee domain, or let closer skip

### Technical Risks

| Risk | Mitigation |
|------|------------|
| Audio capture doesn't work on some systems | Thorough testing on Mac/Windows versions, clear system requirements |
| Deepgram latency spikes | Have fallback, cache transcript chunks, graceful degradation |
| Claude rate limits | Implement queuing, batch processing, monitor usage |
| WebSocket disconnections | Auto-reconnect logic, buffer audio locally, resume upload |
| Electron app feels slow | Optimize, minimize bundle size, lazy load where possible |

### Business Risks

| Risk | Mitigation |
|------|------------|
| Gong adds similar real-time features | Move fast, own the high-ticket niche, build community |
| Customers churn after setup | Deliver value quickly, check in during first month |
| Hard to get first customers | Tyler's network, Twitter/X presence, offer case study deals |
| Support burden | Good documentation, self-serve where possible, charge for premium support |

---

## Appendix A: Environment Variables

### Web Dashboard (.env.local)
```
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
```

### Desktop App (.env)
```
CONVEX_URL=
CLERK_PUBLISHABLE_KEY=
AUDIO_PROCESSING_SERVICE_URL=
GOOGLE_CLIENT_ID=
```

### Audio Processing Service (.env)
```
CONVEX_URL=
CONVEX_DEPLOY_KEY=
DEEPGRAM_API_KEY=
ANTHROPIC_API_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
AWS_REGION=
```

---

## Appendix B: Third-Party Account Setup Checklist

- [ ] **Convex** — Create project, get deployment URL
- [ ] **Clerk** — Create application, configure for web + Electron
- [ ] **Stripe** — Create account, set up products, configure webhooks
- [ ] **Deepgram** — Create account, get API key
- [ ] **Anthropic** — Create account, get API key
- [ ] **AWS** — Create account, set up S3 bucket, create IAM user
- [ ] **Google Cloud** — Create project, enable Calendar API, configure OAuth
- [ ] **Resend** — Create account, verify domain, get API key
- [ ] **Railway/Render** — Create account for audio service hosting
- [ ] **Vercel** — Create account for web dashboard hosting
- [ ] **GitHub** — Create repo(s) for code
- [ ] **Domain** — Purchase domain, configure DNS

---

## Appendix C: File/Folder Structure

### Web Dashboard (Next.js)
```
/web-dashboard
├── app/
│   ├── (auth)/
│   │   ├── sign-in/
│   │   └── sign-up/
│   ├── (dashboard)/
│   │   ├── calls/
│   │   │   ├── [id]/
│   │   │   └── page.tsx
│   │   ├── team/
│   │   ├── billing/
│   │   ├── settings/
│   │   └── page.tsx (main dashboard)
│   ├── api/
│   │   └── webhooks/
│   │       └── stripe/
│   └── layout.tsx
├── components/
├── convex/
│   ├── schema.ts
│   ├── teams.ts
│   ├── users.ts
│   ├── closers.ts
│   ├── calls.ts
│   └── ammo.ts
├── lib/
└── ...
```

### Desktop App (Electron)
```
/desktop-app
├── src/
│   ├── main/           # Electron main process
│   │   ├── index.ts
│   │   ├── audio.ts    # Audio capture
│   │   └── ipc.ts      # IPC handlers
│   ├── renderer/       # React app
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── AmmoTracker.tsx
│   │   │   ├── CallStatus.tsx
│   │   │   └── OutcomePrompt.tsx
│   │   └── ...
│   └── preload/
├── electron-builder.yml
└── ...
```

### Audio Processing Service (Node.js)
```
/audio-service
├── src/
│   ├── index.ts        # Entry point, WebSocket server
│   ├── deepgram.ts     # Deepgram integration
│   ├── claude.ts       # Claude integration
│   ├── s3.ts           # S3 upload
│   ├── convex.ts       # Convex client
│   └── utils/
├── package.json
└── ...
```

---

*End of PRD*
