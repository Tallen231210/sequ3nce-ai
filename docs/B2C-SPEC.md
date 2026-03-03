# Sequ3nce Personal — B2C App Specification

> **Status:** Pre-development — Architecture & decisions finalized
> **Last updated:** 2026-02-28
> **Purpose:** Single source of truth for the B2C app build. Reference this document before making any architectural decision.

---

## Table of Contents

1. [Vision & Business Model](#1-vision--business-model)
2. [Architecture Overview](#2-architecture-overview)
3. [Identity & Accounts](#3-identity--accounts)
4. [Data Model](#4-data-model)
5. [Feature Specification](#5-feature-specification)
6. [Meeting Bots & Recording](#6-meeting-bots--recording)
7. [B2B vs B2C Feature Matrix](#7-b2b-vs-b2c-feature-matrix)
8. [App Sidebar & Navigation](#8-app-sidebar--navigation)
9. [Auth & Subscription Flow](#9-auth--subscription-flow)
10. [Release & Infrastructure](#10-release--infrastructure)
11. [Build Strategy](#11-build-strategy)
12. [Use Cases](#12-use-cases)
13. [Phased Roadmap](#13-phased-roadmap)
14. [Hard Rules](#14-hard-rules)
15. [Open Questions (Deferred)](#15-open-questions-deferred)
16. [Changelog](#16-changelog)

---

## 1. Vision & Business Model

### What Is Sequ3nce Personal?

A B2C desktop app for individual high-ticket closers. Think "LinkedIn for closers" — verified stats, portfolio recordings, public profiles, and a hiring marketplace. Completely separate product from the B2B team platform.

### Business Model

| Aspect | B2C (Personal) | B2B (Teams) |
|--------|----------------|-------------|
| Who pays | Closer ($99/mo) | Company (per seat) |
| Revenue strategy | Volume play — build user base for marketplace | Direct SaaS revenue |
| Future revenue | $500/mo hiring manager access to verified profiles | Per-seat scaling |
| Free trial | None — $99/mo from day one | Existing trial flow |

### Why $99/mo Is Worth It

- World-class sales training via community modules
- Verified stats that companies trust (better than LinkedIn claims)
- Access to companies hiring via job board
- Portfolio recordings that prove skills
- Public profile that follows the closer across jobs

### Why Both Products Coexist

- High-ticket sales has extremely high churn — closers always look for next opportunity
- Even employed closers stay open to better offers
- Many closers work two jobs simultaneously
- Closers invest heavily in career development ($10k+ on training is normal)
- B2C subscription does NOT pause when closer gets hired by a B2B company

---

## 2. Architecture Overview

### Repository Structure

```
sequ3nce-ai/                    (same monorepo)
├── apps/
│   ├── desktop/                ← B2B Electron app (UNTOUCHED)
│   ├── personal/               ← B2C Electron app (NEW — forked from desktop)
│   ├── web/                    ← B2B web dashboard (UNTOUCHED)
│   └── macos/                  ← Legacy Swift app (UNTOUCHED)
├── packages/
│   └── shared/                 ← Shared TypeScript types
├── services/
│   └── audio-processor/        ← Audio processing service
└── docs/
    └── B2C-SPEC.md             ← This file
```

### Database

- **Same Convex deployment** (`ideal-ram-982` production, `fastidious-dragon-782` dev)
- **Same database** — required for phone-based identity linking and stats syncing
- **New tables** for B2C (additive only — never modify existing B2B tables)
- **New HTTP endpoints** for B2C-specific operations (additive only)

### Key Principle: Additive Only

The B2C build MUST NOT modify any existing:
- Convex tables or their schemas
- Convex functions used by B2B
- Files in `apps/desktop/`
- Files in `apps/web/`
- HTTP endpoints used by B2B

New tables, new functions, new endpoints. The B2B app never knows B2C exists.

---

## 3. Identity & Accounts

### Separate User Tables

B2C users live in a **new `b2cUsers` table**, completely separate from the B2B `closers` table.

```
closers (B2B — existing, untouched)
├── email, name, teamId, passwordHash, status, etc.

b2cUsers (B2C — new)
├── email (personal email)
├── phone (SMS-verified — primary identity key)
├── passwordHash
├── name
├── personalWorkspaceId (→ teams table, type: "personal")
├── stripeCustomerId
├── subscriptionStatus ("active" | "cancelled" | "past_due")
├── profileSlug (unique URL slug, e.g., "jake-smith")
├── linkedCloserIds (array — B2B closer records matched by phone)
├── createdAt, lastLoginAt, etc.
```

### Personal Workspace

Each B2C user gets a "team of one" — a record in the existing `teams` table with `type: "personal"`. This avoids refactoring every query that requires `teamId`.

```
teams table (existing — add one new field)
├── type: "company" | "personal"    ← NEW field (defaults to "company")
├── (all existing fields unchanged)
```

### Phone-Based Identity Linking

- Phone number is the universal identifier connecting B2B and B2C accounts
- SMS verification required at B2C signup
- When a B2C user's phone matches a B2B closer's phone → automatic linking
- Stats sync: B2B → B2C (one-way only)
- B2B managers never see B2C data

### What Shows on Public Profiles

- **No company names** — show industry/role instead (e.g., "High-Ticket Coaching Closer" not "Acme Coaching")
- **No company opt-in required** — stats belong to the closer
- Verified badge (✓) on stats that came from B2B tracking (vs self-reported B2C stats)

---

## 4. Data Model

### New Tables (B2C-Specific)

```typescript
// B2C user accounts
b2cUsers: defineTable({
  email: v.string(),
  phone: v.string(),                    // SMS-verified, primary identity key
  phoneVerified: v.boolean(),
  name: v.string(),
  passwordHash: v.string(),
  personalWorkspaceId: v.id("teams"),   // Their "team of one"
  stripeCustomerId: v.optional(v.string()),
  subscriptionStatus: v.string(),       // "active" | "cancelled" | "past_due" | "none"
  subscriptionId: v.optional(v.string()),
  profileSlug: v.optional(v.string()),  // URL-safe unique slug
  linkedCloserIds: v.optional(v.array(v.string())), // B2B closer IDs matched by phone
  createdAt: v.number(),
  lastLoginAt: v.optional(v.number()),
  cancelledAt: v.optional(v.number()),
})
// Indexes: by_email, by_phone, by_profile_slug, by_subscription_status

// Public profile data
b2cProfiles: defineTable({
  userId: v.id("b2cUsers"),
  headline: v.optional(v.string()),     // "High-Ticket Coaching Closer"
  bio: v.optional(v.string()),
  location: v.optional(v.string()),
  photoUrl: v.optional(v.string()),
  industries: v.optional(v.array(v.string())),   // ["Coaching", "SaaS", "Real Estate"]
  ticketRange: v.optional(v.string()),            // "$3k-$10k", "$10k-$25k", etc.
  skills: v.optional(v.array(v.string())),        // ["Objection handling", "One-call closing"]
  isPublic: v.boolean(),               // false when subscription cancelled
  createdAt: v.number(),
  updatedAt: v.number(),
})
// Indexes: by_user, by_public

// Work history entries (verified from B2B syncing)
b2cWorkHistory: defineTable({
  userId: v.id("b2cUsers"),
  industry: v.string(),                // "High-Ticket Coaching" (NOT company name)
  role: v.string(),                    // "Senior Closer"
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  isVerified: v.boolean(),             // true = came from B2B stats sync
  totalCalls: v.optional(v.number()),
  closeRate: v.optional(v.number()),
  revenueClosed: v.optional(v.number()),
  avgDealSize: v.optional(v.number()),
  sourceCloserId: v.optional(v.string()), // Which B2B closer record this came from
  createdAt: v.number(),
})
// Indexes: by_user

// Portfolio recordings (redacted versions of calls)
b2cPortfolioRecordings: defineTable({
  userId: v.id("b2cUsers"),
  title: v.string(),
  description: v.optional(v.string()),
  originalCallId: v.optional(v.id("calls")),  // Source call (if from Sequ3nce)
  recordingUrl: v.string(),                     // Redacted version URL
  duration: v.optional(v.number()),
  verificationHash: v.optional(v.string()),     // Cryptographic proof of Sequ3nce origin
  isPublic: v.boolean(),
  createdAt: v.number(),
})
// Indexes: by_user, by_public

// Job board listings (posted by companies — future)
b2cJobListings: defineTable({
  companyName: v.string(),
  industry: v.string(),
  role: v.string(),
  description: v.string(),
  ticketRange: v.optional(v.string()),
  compensation: v.optional(v.string()),
  requirements: v.optional(v.array(v.string())),
  contactEmail: v.optional(v.string()),
  contactUrl: v.optional(v.string()),
  isActive: v.boolean(),
  postedAt: v.number(),
  expiresAt: v.optional(v.number()),
})
// Indexes: by_active, by_industry
```

### Existing Tables — Changes

```typescript
// teams table — ONE new optional field
type: v.optional(v.string()),  // "company" | "personal" (defaults to "company" if absent)

// closers table — ONE new optional field (for phone linking)
phone: v.optional(v.string()), // Added for B2B ↔ B2C identity matching
```

These are the ONLY changes to existing tables. Both fields are optional, so existing B2B functionality is completely unaffected.

---

## 5. Feature Specification

### Features KEPT from B2B (identical behavior)

- **Call recording via meeting bot** — same Recall.ai integration, manual "Join & Record"
- **Real-time ammo panel** — same floating window, same AI extraction, one-size-fits-all config
- **Post-call questionnaire** — same form (outcome, cash collected, contract value, notes)
- **Call history** — same list view with filters
- **Call detail sheet** — same tabs (Overview, Transcript, Analysis, Chapters)
- **AI call analysis** — same 5-dimension scoring, chapter generation
- **Calendar integration** — same Google/Microsoft calendar sync
- **Schedule view** — same week/list views
- **Quick bot** — same "paste a meeting URL" flow
- **Auto-update** — same electron-updater pattern, different channel
- **Dark mode** — same theme support

### Features REMOVED from B2B

| Feature | Reason |
|---------|--------|
| Messages tab | No manager to message (returns later as community DMs) |
| Role Play rooms | Not needed for solo closers (may return later) |
| Reinforcement request button | No manager to alert |
| "Call Going Long" button | No manager to notify |
| Team stats comparison | No team to compare against |
| Manager-assigned training | Replaced by community modules |
| Team resources (admin-managed) | Replaced by self-managed resources |

### Features MODIFIED for B2C

| Feature | B2B Behavior | B2C Behavior |
|---------|-------------|-------------|
| Flag for Review | Sends to manager's web dashboard | Generates shareable link with comments + AI coaching |
| Stats view | Shows team comparison | Shows absolute numbers only, no comparison |
| Dashboard | Shows team activity | Shows personal activity only |
| Settings | Password change only | Password, subscription management, profile settings |
| Resources | Read-only (admin manages) | Self-managed (closer adds their own) |

### Features NEW to B2C

| Feature | Description | Phase |
|---------|------------|-------|
| Profile tab | Manage public profile, headline, bio, skills, work history | Phase 2 |
| Job Board tab | Browse companies hiring closers | Phase 5 |
| Community tab | Training modules, channels, chat (Discord+Skool hybrid) | Phase 6 |
| Subscription management | Stripe billing portal in Settings | Phase 1 |
| Phone verification | SMS OTP during signup | Phase 1 |
| Portfolio recordings | Download redacted call versions, attach to profile | Phase 4 |
| Shareable call links | Share call recordings with AI analysis for feedback | Phase 1 |
| Account linking | Auto-link B2B stats to B2C profile via phone | Phase 3 |

---

## 6. Meeting Bots & Recording

### How It Works (Same as B2B)

1. Closer connects Google/Microsoft calendar in Schedule tab
2. Calendar events appear in schedule view
3. Closer clicks "Join & Record" → bot is created and sent to meeting
4. Bot joins Zoom/Google Meet/Teams → records video
5. After call ends → AI analysis runs (chapters, scoring, ammo extraction)
6. Recording stored on Recall.ai servers (URLs expire, refreshed on demand)

### Two Apps, Same Calendar — No Conflict

- Both apps can see the same calendar events
- Bots are ALWAYS manual-start (auto-schedule cron is disabled)
- Whichever app the closer clicks "Join & Record" in → that app's bot is sent
- Both apps' bots use separate closer/team records, so recordings stay separate
- If a closer accidentally sends both → two bots join (user error, not engineered around)

### B2C Bot Identity

B2C bots are created under the closer's personal workspace (`teamId` = personal workspace ID). This keeps B2C calls completely separate from any B2B workspace calls.

### Recall.ai Costs

- ~$0.45-0.65/hour per call (enterprise pricing pending)
- Typical closer: ~50-99 hours/month realistically
- Storage included in Recall pricing (no additional S3 costs for video)
- No hard recording limit initially — monitor and adjust

---

## 7. B2B vs B2C Feature Matrix

| Capability | B2B App | B2C App |
|-----------|---------|---------|
| Login | Email + password (invited by admin) | Email + phone + password (self-signup) |
| Payment | Company pays per seat | Closer pays $99/mo via Stripe |
| Meeting bot | ✅ Manual start | ✅ Manual start |
| Ammo panel | ✅ Same | ✅ Same |
| Post-call form | ✅ Same | ✅ Same |
| Call history | ✅ Same | ✅ Same |
| AI analysis | ✅ Same | ✅ Same |
| Calendar | ✅ Same | ✅ Same |
| Stats | ✅ With team comparison | ✅ Absolute only |
| Messages | ✅ Manager ↔ Closer | ❌ (Coming: community DMs) |
| Resources | ✅ Admin-managed | ✅ Self-managed |
| Training | ✅ Manager-assigned playlists | ❌ (Coming: community modules) |
| Role Play | ✅ Video rooms | ❌ Removed for now |
| Reinforcement | ✅ Alert manager | ❌ Removed |
| Flag for Review | ✅ Sends to manager | ✅ Shareable link + AI coaching |
| Public Profile | ❌ | ✅ |
| Job Board | ❌ | ✅ |
| Community | ❌ | ✅ (Coming Soon) |
| Subscription mgmt | ❌ | ✅ |
| Portfolio recordings | ✅ Download for social media | ✅ Download + attach to profile |

---

## 8. App Sidebar & Navigation

### B2C Sidebar (9 tabs)

```
┌─────────────────────────┐
│  [S] Sequ3nce Personal  │
├─────────────────────────┤
│  📊 Dashboard           │
│  📈 Stats               │
│  📞 Calls               │
│  📅 Schedule            │
│  📁 Resources           │
│  💼 Job Board           │
│  👤 Profile             │
│  💬 Community           │
│  ⚙️ Settings            │
├─────────────────────────┤
│  [User name]            │
│  [Subscription badge]   │
└─────────────────────────┘
```

### Tab Details

| Tab | Content | Phase |
|-----|---------|-------|
| Dashboard | Personal stats cards, today's schedule, recent calls | Phase 1 |
| Stats | Call count, close rate, revenue, averages (no comparison) | Phase 1 |
| Calls | Call list + detail sheet (Overview, Transcript, Analysis, Chapters) | Phase 1 |
| Schedule | Calendar week/list view, "Join & Record" button | Phase 1 |
| Resources | Self-managed scripts, payment links, documents | Phase 1 |
| Job Board | Browse job listings from companies | Phase 5 |
| Profile | Edit public profile, manage portfolio, view work history | Phase 2 |
| Community | "Coming Soon" placeholder → modules, channels, chat | Phase 6 |
| Settings | Account, password, subscription (Stripe portal), preferences | Phase 1 |

---

## 9. Auth & Subscription Flow

### Signup Flow

```
1. Closer downloads Sequ3nce Personal from website
2. Opens app → Sign Up screen
3. Enters: email + phone number + password
4. SMS verification code sent → closer enters code
5. Account created → personal workspace created
6. App UI loads (locked/limited state)
7. Closer tries to use a paid feature (record, view stats, etc.)
8. Paywall appears → "Subscribe to Sequ3nce Personal — $99/mo"
9. Opens Stripe Checkout in browser
10. After payment → browser redirects to sequ3nce-personal://payment-success
11. App detects payment → full access unlocked
```

### Login Flow

```
1. Opens app → Log In screen
2. Enters email + password
3. Backend verifies credentials against b2cUsers table
4. If subscription active → full access
5. If subscription cancelled → locked state, "Resubscribe" prompt
```

### Subscription Cancellation

- Profile goes offline (not deleted)
- Account locked — closer can log in but can't use features
- Data retained indefinitely
- Re-subscribing restores everything immediately

---

## 10. Release & Infrastructure

### App Identity

| Property | B2B | B2C |
|----------|-----|-----|
| App name | Sequ3nce | Sequ3nce Personal |
| Bundle ID | com.sequ3nce.desktop | com.sequ3nce.personal |
| Icon | Black S on white background | White S on black background |
| Deep link | sequ3nce:// | sequ3nce-personal:// |

### Release Configuration

| Property | B2B | B2C |
|----------|-----|-----|
| Git tags | `desktop-v1.0.0` | `personal-v1.0.0` |
| Slash command | `/release-desktop` | `/release-personal` |
| CI workflow | `desktop-release.yml` | `personal-release.yml` |
| Auto-update manifest (Win) | `latest.yml` | `latest-personal.yml` |
| Auto-update manifest (Mac) | `latest-mac.yml` | `latest-personal-mac.yml` |
| GitHub release prefix | `desktop-v` | `personal-v` |

### Code Signing

- Same Apple Developer account and signing certificate
- Different bundle ID and entitlements file
- Same notarization profile (`sequ3nce-notarize`)

---

## 11. Build Strategy

### Approach: Fork Then Diverge

The B2C app is built by copying the B2B Electron app and modifying it. NOT built from scratch.

**Step 1: Fork**
- Copy `apps/desktop/` → `apps/personal/`
- Rename everything (package.json, forge config, window titles, etc.)
- Verify it builds and runs independently

**Step 2: Subtract**
- Remove: Messages tab, Role Play, Reinforcement, Call Going Long
- Remove: Team stats comparison
- Simplify: Stats view (absolute numbers only)
- Simplify: Dashboard (personal activity only)

**Step 3: Add Stubs**
- Add empty tabs: Job Board, Profile, Community ("Coming Soon")
- Add: Settings > Subscription management placeholder
- Add: Inverted app icon

**Step 4: B2C Auth**
- Replace B2B login (team-based) with B2C login (individual)
- Add: phone verification, Stripe subscription check
- Connect to `b2cUsers` table instead of `closers` table

### What We Do NOT Do

- ❌ Do not extract shared components into `packages/desktop-ui` upfront
- ❌ Do not refactor `apps/desktop/` in any way
- ❌ Do not modify existing Convex functions
- ❌ Do not modify existing database tables (only add optional fields)
- Shared component extraction happens gradually AFTER both apps are working

---

## 12. Use Cases

### UC1: Pure B2C Closer (Freelance)

Jake is a freelance closer, no company uses Sequ3nce.

1. Signs up for B2C ($99/mo)
2. Records calls using Sequ3nce Personal app
3. Builds profile with verified stats
4. Downloads portfolio recordings, adds to profile
5. Gets discovered by companies in job board
6. Accesses training via community

### UC2: B2B Closer Gets B2C Too

Sarah works at Acme Coaching (B2B). Wants a personal profile.

1. Already has B2B account (invited by manager)
2. Signs up for B2C separately with personal email + same phone
3. System detects phone match → links accounts
4. Sarah's B2B stats at Acme sync to her B2C profile (as industry/role, NOT company name)
5. Sarah has two separate apps on her machine
6. B2C subscription does NOT pause

### UC3: B2C Closer Gets Hired by Sequ3nce Company

Jake has B2C. Acme Coaching (Sequ3nce customer) hires him.

1. Acme manager invites Jake via his phone number
2. System detects Jake has B2C account (same phone)
3. Jake downloads B2B app, accepts invite
4. Jake now has TWO apps — B2C (personal, $99/mo) and B2B (company-paid)
5. Jake's B2B stats at Acme sync to his B2C profile
6. Each app sends its own bot — Jake chooses which one per meeting

### UC4: B2B Closer Leaves Company

Sarah gets fired from Acme (B2B only).

1. Sarah loses B2B app access immediately
2. Her work stats remain in system (associated with her phone)
3. Sarah signs up for B2C ($99/mo)
4. System finds her B2B history via phone match
5. Verified stats imported to B2C profile
6. If she downloaded portfolio recordings while employed → can upload to profile

### UC5: Closer Works at Multiple Companies

Jake closes for both Acme and TechStart (both use Sequ3nce).

1. Jake has B2C + two B2B workspaces
2. Each B2B workspace is isolated (Acme only sees Acme calls)
3. Jake's B2C profile aggregates stats from all sources:
   - Personal: 45 calls
   - High-Ticket Coaching ✅: 142 calls (from Acme, no company name)
   - SaaS Sales ✅: 87 calls (from TechStart, no company name)
   - Total: 274 calls

---

## 13. Phased Roadmap

### Phase 0 — Foundation (No new features)

**Goal:** Working B2C app that builds, runs, and is architecturally separate from B2B.

- [ ] Copy `apps/desktop` → `apps/personal`
- [ ] Rename: package.json, forge config, window titles, bundle ID
- [ ] Inverted app icon (white S, black background)
- [ ] Verify independent build (`npm run make`)
- [ ] Set up release infrastructure: `/release-personal` command, `personal-release.yml` CI
- [ ] Configure separate auto-update channel
- [ ] Remove B2B-only features (Messages, Role Play, Reinforcement, Call Going Long)
- [ ] Remove team stats comparison from Stats view
- [ ] Add stub tabs: Job Board (empty), Profile (empty), Community ("Coming Soon")
- [ ] Simplify Dashboard to personal-only view

### Phase 1 — B2C Core (App is usable)

**Goal:** A closer can sign up, pay, record calls, and view their stats.

- [ ] Add `b2cUsers` table to Convex schema
- [ ] Add `type` field to `teams` table (optional, defaults "company")
- [ ] Add `phone` field to `closers` table (optional, for future linking)
- [ ] Create B2C HTTP endpoints: signup, login, verify phone
- [ ] SMS verification integration (Twilio or similar)
- [ ] Personal workspace creation on signup
- [ ] Stripe integration: $99/mo product, checkout flow, webhook handling
- [ ] Subscription status checking on app launch
- [ ] Locked/paywall state for cancelled subscriptions
- [ ] Self-managed Resources tab
- [ ] Settings: subscription management (Stripe billing portal)
- [ ] Shareable call links (flag for review replacement)

### Phase 2 — Profile System

**Goal:** Closers can create and manage a public profile.

- [ ] Add `b2cProfiles` table
- [ ] Profile tab UI: edit headline, bio, location, industries, skills, ticket range
- [ ] Profile photo upload
- [ ] Profile slug/URL generation
- [ ] Public profile web page: `sequ3nce.ai/profile/[slug]`
- [ ] Stats display on profile (from personal recordings)
- [ ] Profile visibility toggle
- [ ] Profile goes offline when subscription cancelled

### Phase 3 — Account Linking & Stats Sync

**Goal:** B2B work history appears on B2C profiles as verified stats.

- [ ] Add `b2cWorkHistory` table
- [ ] Phone-based identity matching: detect B2B closers with same phone
- [ ] One-way stats sync: B2B calls → B2C work history entries
- [ ] Verified badge on synced stats
- [ ] Industry/role display (NOT company name)
- [ ] Work history section on profile
- [ ] Career trajectory visualization (stats over time)

### Phase 4 — Portfolio Recordings

**Goal:** Closers can download redacted recordings and showcase them.

- [ ] Recording redaction service (face blur, sensitive info removal)
- [ ] Add `b2cPortfolioRecordings` table
- [ ] "Download Portfolio Version" button in call detail sheet
- [ ] Cryptographic verification hash embedded in portfolio files
- [ ] Upload portfolio recording to profile
- [ ] Portfolio recording playback on public profile
- [ ] Same feature added to B2B app (for social media use)
- [ ] 10 portfolio downloads/month limit

### Phase 5 — Marketplace & Job Board

**Goal:** Companies can discover closers, closers can browse jobs.

- [ ] Add `b2cJobListings` table
- [ ] Job Board tab: browse listings, filter by industry/ticket range
- [ ] Job listing detail view
- [ ] "Apply" flow (send profile link to company)
- [ ] Future: Hiring manager dashboard ($500/mo add-on for companies)

### Phase 6 — Community & Training

**Goal:** In-app community with training modules and networking.

- [ ] Community architecture (channels, messages, modules)
- [ ] Community tab UI (Discord+Skool hybrid)
- [ ] Training modules: video content, lesson progress
- [ ] Community channels: topic-based discussion
- [ ] Community chat: real-time messaging
- [ ] DMs between closers (Messages tab returns)
- [ ] Moderation tools

---

## 14. Hard Rules

These rules are INVIOLABLE throughout the entire B2C build:

1. **Never modify `apps/desktop/`** — The B2B app is untouchable
2. **Never modify existing Convex functions** — Only add new ones
3. **Never modify existing table schemas destructively** — Only add optional fields
4. **Never modify `apps/web/`** — The B2B web dashboard is untouchable
5. **Always verify B2B app still builds** after any Convex schema changes
6. **B2C data is additive** — New tables, new endpoints, new functions
7. **Phone is the identity link** — Never store B2C user data in B2B tables or vice versa
8. **No company names on profiles** — Industry/role only
9. **Meeting bots are always manual-start** — No auto-send from either app
10. **Test both apps** after any shared backend change (Convex schema, HTTP endpoints)

---

## 15. Open Questions (Deferred)

These don't need answers until their respective phases:

| Question | Phase | Notes |
|----------|-------|-------|
| Public profile URL structure | 2 | Likely `sequ3nce.ai/profile/[slug]` |
| Profile photo storage (S3? Convex file storage?) | 2 | Convex has built-in file storage |
| SMS provider (Twilio? Other?) | 1 | Need to evaluate options |
| Community architecture (real-time? polling?) | 6 | Depends on scale expectations |
| Hiring manager dashboard scope | 5+ | $500/mo add-on, future feature |
| Portfolio redaction tech (AI-based? Manual rules?) | 4 | Need to research video processing options |
| Recording storage long-term (download/delete system) | 2+ | Monitor Recall.ai costs first |
| B2B web dashboard "Hiring" tab | 5+ | For companies to browse B2C profiles |
| DM architecture between closers | 6 | Can extend existing liveMessages pattern |

---

## 16. Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-02-28 | Initial spec created from consultation session | Claude + Tyler |
