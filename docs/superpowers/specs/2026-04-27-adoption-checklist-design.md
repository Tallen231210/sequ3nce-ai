# Adoption Checklist — Setup + Earn Widgets

## Context

Sequ3nce Personal is launching to its first paying B2C cohort. The product surface is broad — Profile, Calls, Highlights, Schedule, Resources, Job Board, Community (with Coaching Calls + Money Bells + Content Submissions), Stream — and there's no current mechanism that nudges new users toward the high-value behaviors that correlate with $99/mo retention. The risk: a closer signs up, pokes around the Dashboard, doesn't discover the Profile or Stream, never records a call with the bot, and churns at month two.

This spec defines a two-widget adoption system that lives in the persistent top-bar of the app:

- A **Setup** track that drives the five behaviors most diagnostic of long-term retention, decays from prominent → small → hidden across the first 30 days, and auto-checks tasks the user has already completed.
- An **Earn** track that perpetually surfaces monetary opportunities (Money Bells, Creator Cash, Testimonials) with **live state** — current rank, lifetime earnings, submission status. The Earn widget never retires because the opportunities recur.

Both tracks share a single titlebar button. The button's label phase-shifts from *"Get started"* (with a `3/5` progress count) to *"Earn"* (with red-dot for new opportunities) once setup is complete or day 30 elapses. Clicking opens a popover anchored to the button.

The widget does not include videos. The premium SaaS playbook in 2026 has shifted to action-first onboarding (Linear, Superhuman, Stripe) — videos read as 2018-era homework. Each task instead deep-links to its destination feature, where a single floating banner at the top provides one line of action-oriented guidance ("Drag a moment from the timeline → 'Save clip'"). Banners auto-dismiss when task detection fires or the user clicks Skip. This pattern ships fast (no video production), ages well (no UI-coupled tooltip anchors), and prioritizes user behavior over passive content consumption.

The Affiliate program (Refgrow integration) is **deliberately excluded from v1**. The conversion-tracking loop is broken end-to-end (the web→app boundary loses the referral cookie), so users can copy + share their link but won't actually earn commission. Including a "share your affiliate link" task would create a trust-destroying experience. Affiliate becomes the fourth Earn task once tracking is fixed.

The intended outcome: new users discover the five high-leverage behaviors within 14 days, see a measurable adoption lift, and feel constant gentle pressure (red-dot on the Earn button) to convert their app usage into actual income — which is the stickiest possible long-term retention driver.

---

## Architecture

### Single titlebar button, two-section popover

The button lives in the existing `MeetingBotHub.tsx` titlebar (`apps/personal/src/renderer/views/MeetingBotHub.tsx` line ~658), to the left of Messages / Stream / Quick Bot. Click opens a popover anchored below it. The popover renders both sections:

```
┌─ Setup (3/5)                                          ┐
│  ✓  Complete your public profile         (auto)       │
│  ✓  Record your first call                (auto)       │
│  ☐  Create a highlight clip       Try it now →        │
│  ☐  Join a coaching call          Try it now →        │
│  ☐  Try Sequ3nce Stream           Try it now →        │
└────────────────────────────────────────────────────────┘
┌─ Earn through Sequ3nce                                ┐
│  Money Bells · April · #3 of 14 · 12d left  Broadcast→│
│  Creator Cash · $60 from 2 approved clips   Submit→   │
│  Testimonial · Pending review (2d ago)                │
└────────────────────────────────────────────────────────┘
```

### Lifecycle (Setup track only — Earn never retires)

| Days since user first encountered the widget | Setup track state | Button label |
|---|---|---|
| 0–14 | Full-prominence in the popover. Auto-opens once on day 0. Pulse on button for 7 days. | "Get started" with `N/5` count |
| 15–30 | Setup section collapsed in popover (single line: *"Setup 4/5 — expand"*). Pulse stops. | "Get started" with `N/5` count |
| 31+ OR Setup hits 5/5 | Setup section hidden from popover entirely. | "Earn" with red-dot when new monetary opportunity |

The user can also dismiss Setup early (via a × Skip on the section header). Dismissed = same state as day 31+.

### Auto-check completed tasks for existing users

On first widget render for any user (existing or new), task completion is computed by querying the relevant existing tables — no new "task complete" events recorded. So a user who already has a profile, calls, highlights, etc., sees those tasks pre-checked. The Setup section may render at 5/5 from day 0 for power users, in which case it instantly transitions to the "hidden" state and the button shows "Earn" from first launch.

### State storage

A single Convex table tracks per-user widget metadata that isn't derivable from existing tables:

```ts
// apps/web/convex/schema.ts addition
b2cAdoptionChecklist: defineTable({
  userId: v.id("b2cUsers"),
  firstSeenAt: v.number(),         // ms epoch — first time the user opened the app post-ship
  setupDismissedAt: v.optional(v.number()),  // user clicked × Skip on Setup section
  setupCompletedAt: v.optional(v.number()),  // server-detected: all 5 tasks complete
  setupAutoOpenedAt: v.optional(v.number()), // first time the panel auto-opened (so it only happens once)
  earnRedDotLastSeenAt: v.optional(v.number()), // for "new opportunity" detection
})
.index("by_user", ["userId"])
```

Task **completion** is not stored — it's queried live from the source-of-truth tables (`b2cProfiles`, `calls`, `b2cHighlightClips`, `b2cCoachingCallAttendance`, stream entries, `b2cMoneyBellBroadcasts`, `b2cContentSubmissions`). This means tasks auto-uncheck if the underlying data is deleted (e.g., user deletes their highlight clip) — desired behavior.

---

## Setup task list

| # | Task | Banner copy on destination | Detection query |
|---|------|-----------------------------|-----------------|
| 1 | Complete your public profile | *Fill in your slug, photo, headline, and at least one industry — then Save.* | `b2cProfiles` row exists for user with `slug && photoUrl && headline && industries.length >= 1` |
| 2 | Record your first call with the bot | *Paste any meeting URL → the bot auto-records + analyzes when the call starts.* | Any `calls` row exists where `closerId === user.closerId` |
| 3 | Create a highlight clip | *Open any call → drag to select a moment on the timeline → "Save as highlight."* | Any `b2cHighlightClips` row exists for user |
| 4 | Join a coaching call (or watch a replay) | *Join any upcoming coaching call, or watch a replay of a past one.* | Any `b2cCoachingCallAttendance` row exists for user OR replay-watched event recorded |
| 5 | Try Sequ3nce Stream | *Hold your hotkey to dictate. Your first transcription marks this complete.* | Any stream/dictation entry exists for user |

Each task in the popover is a row with:
- A circle/checkmark for status (`☐` / `✓`)
- Title (bold) + 1-line description (muted)
- Right-aligned `Try it now →` CTA (deep-link with `?setup=<taskId>` query param) — hidden when task is complete

Deep-link destinations (renderer routes):
- Task 1 → `?tab=profile&setup=profile`
- Task 2 → opens Quick Bot modal (`setup=firstCall`)
- Task 3 → `?tab=calls&setup=highlightClip`
- Task 4 → `?tab=community&subview=coaching&setup=coachingCall`
- Task 5 → opens Stream modal (`setup=stream`)

---

## Earn task list (perpetual, dynamic state)

| # | Task | Dynamic display | When | Detection / row source |
|---|------|---|---|---|
| 1 | Money Bells | Pre-opt-in: *"Opt in to Money Bells — broadcast closed deals to climb the leaderboard"* → CTA *Opt in →*. Post-opt-in: *"Money Bells · {month} · You're #{rank} of {total} · {N}d left · Broadcast another deal →"* | Always | `b2cMoneyBellOptIns` + live leaderboard query for current month |
| 2 | Creator Cash | No submissions: *"Submit a highlight clip — earn $20–30 per approved clip"* → CTA. Has submissions: *"Creator Cash · You've earned ${total} from {N} approved clips · Submit another →"* | Always | `b2cContentSubmissions` (type=clip) — sum `paidAmount` where status=paid |
| 3 | Testimonial | Pending: *"Testimonial · Pending review (submitted {N}d ago)"*. Approved+paid: *"Testimonial · Earned $X for your testimonial · Submit another →"*. Otherwise: *"Submit a testimonial video →"* | Always | `b2cContentSubmissions` (type=testimonial) — most recent row |

The Earn section never has a "complete" state — every row has either an active CTA or a status indicator with a path to do more.

### Red-dot logic

The titlebar button shows a red dot when ANY of these is true and the user hasn't opened the panel since:

- A new Money Bells contest started (1st of the month)
- A Creator Cash submission was just approved (`reviewedAt > earnRedDotLastSeenAt`)
- A Creator Cash submission was just paid (`paidAt > earnRedDotLastSeenAt`)
- A testimonial was approved or paid

The red dot clears when the user opens the panel (set `earnRedDotLastSeenAt = now`).

---

## UI components

### `<AdoptionChecklistButton>` (titlebar)

`apps/personal/src/renderer/views/adoption-checklist/AdoptionChecklistButton.tsx`

- Reads checklist state via Convex live query
- Renders the button with phase-driven label + count + red-dot badge
- Pulse animation (`animate-pulse` Tailwind, 7 days from `firstSeenAt`)
- Click handler toggles popover open/closed
- Auto-opens popover ONCE on first encounter (when `setupAutoOpenedAt` is null, set it + open)

### `<AdoptionChecklistPopover>`

`apps/personal/src/renderer/views/adoption-checklist/AdoptionChecklistPopover.tsx`

- Anchored to the button via fixed positioning (top-right of titlebar, ~360px wide)
- Renders `<SetupSection>` (conditionally visible based on lifecycle phase) and `<EarnSection>`
- Click-outside dismisses; Esc dismisses

### `<SetupSection>`

- Header: progress bar + "Setup N/5" + × Skip
- 5 task rows
- Collapsed/hidden based on lifecycle phase

### `<EarnSection>`

- Header: "Earn through Sequ3nce"
- 3 dynamic task rows; each pulls live data from existing Money Bells / Content Submission queries

### `<TaskRow>`

- Reused by both sections
- Props: `id`, `title`, `description` (or dynamic JSX for Earn rows), `complete: boolean`, `ctaHref: string | null`, `ctaLabel: string`

### `<TaskHintBanner>`

`apps/personal/src/renderer/views/adoption-checklist/TaskHintBanner.tsx`

- Renders pinned at the top of every destination tab (Profile, Calls, Coaching, etc.)
- Reads the `?setup=<taskId>` query param (or equivalent in-app routing state)
- Displays the banner copy from the per-task config map
- Right-aligned × Skip button — sets `dismissed[taskId]` in local state for the session
- Auto-dismisses when the corresponding completion query flips to true

### Per-task config map

`apps/personal/src/renderer/views/adoption-checklist/tasks.ts`

```ts
export interface AdoptionTask {
  id: string;
  section: 'setup' | 'earn';
  title: string;
  description: string;
  ctaLabel: string;
  ctaTarget: string;          // 'tab:profile' | 'modal:quickBot' | etc.
  bannerCopy: string;
  detectComplete: (data: ChecklistData) => boolean;  // pure function over the live query result
}
```

A single source of truth for everything per-task. New tasks add a row here; the popover and banner pick it up automatically.

---

## Backend

### `b2cAdoptionChecklist` table (schema addition)

See "State storage" above.

### Convex query: `getAdoptionChecklistData`

`apps/web/convex/b2cAdoptionChecklist.ts`

Single query that returns everything the renderer needs:

```ts
{
  state: {
    firstSeenAt, setupDismissedAt, setupCompletedAt,
    setupAutoOpenedAt, earnRedDotLastSeenAt,
  },
  setup: {
    profile: boolean,
    firstCall: boolean,
    highlightClip: boolean,
    coachingCall: boolean,
    stream: boolean,
  },
  earn: {
    moneyBells: {
      optedIn: boolean,
      currentRank: number | null,
      totalParticipants: number,
      daysRemaining: number,
      monthLabel: string,  // "April"
    },
    creatorCash: {
      totalEarned: number,
      approvedCount: number,
    },
    testimonial: {
      latestSubmission: { status, submittedAt, paidAmount } | null,
    },
  },
}
```

Single round-trip; renderer derives display state.

### Convex mutations

- `markSetupAutoOpened(userId)` — sets `setupAutoOpenedAt = now` if null
- `dismissSetup(userId)` — sets `setupDismissedAt = now`
- `markEarnSeen(userId)` — sets `earnRedDotLastSeenAt = now` (clears red dot)
- Internal: `_ensureChecklistRow(userId)` — upserts the row on first interaction; sets `firstSeenAt = now`

### HTTP routes

`apps/web/convex/http.ts` — three new routes mirroring the mutations + the query.

---

## Detection details (per task)

**Profile (task 1):**
```ts
profile: !!profile?.slug && !!profile?.photoUrl && !!profile?.headline && (profile?.industries?.length ?? 0) >= 1
```

**First call (task 2):**
```ts
firstCall: anyCallsExist  // SELECT 1 FROM calls WHERE closerId = ? LIMIT 1
```

**Highlight clip (task 3):**
```ts
highlightClip: anyHighlightClipExists  // b2cHighlightClips by user
```

**Coaching call (task 4):**
```ts
coachingCall: hasAttendance || hasReplayWatched
// b2cCoachingCallAttendance OR b2cCoachingReplayWatched (new lightweight tracking — see "Implementation notes")
```

**Stream (task 5):**
```ts
stream: anyStreamEntryExists  // b2cStreamTranscriptions or whatever the existing stream history table is
```

---

## Implementation notes

### Replay-watched tracking (small new bit)

For task 4 ("watch a replay"), we don't currently track whether a user actually watched a replay versus just clicked the play button. Add the lightest possible event:

```ts
// apps/web/convex/schema.ts
b2cCoachingReplayWatched: defineTable({
  userId: v.id("b2cUsers"),
  callId: v.id("b2cCoachingCalls"),
  watchedSeconds: v.number(),  // updated as user watches
  firstWatchedAt: v.number(),
})
.index("by_user", ["userId"])
.index("by_user_call", ["userId", "callId"])
```

The `ReplayPlayerModal` fires a throttled mutation every 10s while playing to upsert this row. Task 4 is detected as complete when ANY row exists with `watchedSeconds >= 30`.

### Tab routing for deep-links

The Personal app already uses `MeetingBotHub.tsx` as the tab router (sidebar → activeTab state). Extend it to accept a query-string-style route:

```ts
// On click of "Try it now →"
window.location.hash = '#tab=calls&setup=highlightClip';
// MeetingBotHub reads hash, sets activeTab + setupParam
```

Or use a small in-memory router store (Zustand/React Context). Either works. Hash is simplest.

### Deep-link to modals

Tasks 2 (Quick Bot) and 5 (Stream) open modals rather than tabs. The `TaskRow` CTA dispatches a global event (`window.dispatchEvent(new CustomEvent('open-quickbot'))`) and the modal owner subscribes. Modal opens with `setup=firstCall` flag → renders the banner inside the modal.

### First-launch auto-open

On every app launch:
1. Query `getAdoptionChecklistData`
2. If `state.setupAutoOpenedAt` is null AND `state.setupCompletedAt` is null AND user is past their initial onboarding (post-paywall), call `markSetupAutoOpened` and open the popover
3. If `setupCompletedAt` is set, skip auto-open — they've already done everything; no need to interrupt

For brand-new users, the auto-open happens on their first session post-paywall. For existing users, it happens on their next launch after the feature ships. In both cases, it happens exactly once.

### Pulse animation

7 days from `firstSeenAt`, the button has a subtle pulse (Tailwind `animate-pulse` on a 1.5s loop, or a custom keyframe with a soft glow). After 7 days the pulse stops; the button is just always there.

---

## Out of scope

- **Tutorial videos.** Cut entirely. Each task uses a single-line banner on the destination feature; no embedded video, no "coming soon" placeholders, no YouTube infra. If a specific task shows high friction in real telemetry post-launch, we revisit for that task.
- **Affiliate task.** Cut until the Refgrow conversion-tracking loop is fixed end-to-end. Including it now would result in users sharing links, friends signing up, no commission credited — trust-destroying. Adding it later means a fourth Earn row.
- **Call of the Week task.** The feature is built but flag-disabled (`SHOW_CALL_OF_THE_WEEK = false`) pending a larger user base. Adding a checklist task that's hidden behind a flag is incoherent.
- **Multi-step interactive tours / spotlight overlays / pulse arrows on specific buttons.** The single banner pattern handles 100% of expected complexity. If a task ever needs more, that's the signal to fix the feature's UX, not bolt on a tour.
- **Per-task analytics on banner skip rates.** Worth adding eventually for product instinct (which tasks people skip vs complete) but not v1.
- **Re-engagement emails.** Out of scope — separate channel, separate spec.
- **Mobile responsiveness for the popover.** The Personal app is desktop-only Electron; not relevant.

---

## Verification

### Manual smoke test
1. Fresh user, post-paywall first launch → popover auto-opens. Setup section visible at 0/5. Earn section visible with empty state.
2. Existing user (e.g., Tyler) first launch after ship → popover auto-opens. Setup section auto-checks already-done tasks (likely 4/5 or 5/5). Earn section shows real Money Bells rank, real Creator Cash earnings.
3. Click each Setup CTA → correct tab/modal opens with the banner pinned at top.
4. Complete the task in-app → banner auto-disappears, popover task row checks off live.
5. Click × Skip on the banner → banner disappears for that task in this session, no completion recorded.
6. Click × Skip on Setup section header → section collapses; titlebar label changes to "Earn" if 100% or to default count display if not.
7. Day 31 simulation: open the app with `firstSeenAt` set 31 days ago → Setup section hidden from popover, button shows "Earn".
8. New Money Bells contest → red dot appears on button. Open popover → red dot clears.
9. Creator Cash submission marked paid → red dot appears.
10. Verify dynamic Earn rows show actual current rank, leaderboard size, days remaining, total earned, count of approved clips.

### Typecheck
- `cd apps/personal && npx tsc --noEmit` clean
- `cd apps/web && npx tsc --noEmit` clean

### Convex deploy
- New table migration applies cleanly
- New query/mutations/HTTP routes deploy

---

## File inventory (for the implementation plan)

**New (Personal app):**
- `apps/personal/src/renderer/views/adoption-checklist/AdoptionChecklistButton.tsx`
- `apps/personal/src/renderer/views/adoption-checklist/AdoptionChecklistPopover.tsx`
- `apps/personal/src/renderer/views/adoption-checklist/SetupSection.tsx`
- `apps/personal/src/renderer/views/adoption-checklist/EarnSection.tsx`
- `apps/personal/src/renderer/views/adoption-checklist/TaskRow.tsx`
- `apps/personal/src/renderer/views/adoption-checklist/TaskHintBanner.tsx`
- `apps/personal/src/renderer/views/adoption-checklist/tasks.ts` (config map)
- `apps/personal/src/renderer/views/adoption-checklist/useAdoptionChecklist.ts` (hook for queries + mutations)

**Modified (Personal app):**
- `apps/personal/src/renderer/views/MeetingBotHub.tsx` — add button to titlebar; add hash/query routing for `?setup=` deep links; mount `<AdoptionChecklistButton>` next to Messages/Stream/Quick Bot
- `apps/personal/src/renderer/views/ProfileView.tsx` — render `<TaskHintBanner taskId="profile" />` at top when relevant flag set
- `apps/personal/src/renderer/views/CallHistoryView.tsx` — banner for `highlightClip`
- `apps/personal/src/renderer/views/community/coaching/CoachingView.tsx` — banner for `coachingCall`
- `apps/personal/src/renderer/views/QuickBotModal.tsx` — banner for `firstCall`
- `apps/personal/src/renderer/views/stream/StreamModal.tsx` — banner for `stream`
- `apps/personal/src/renderer/views/community/coaching/ReplayPlayerModal.tsx` — fire 10s-throttled `recordReplayProgress` mutation

**New (Convex):**
- `apps/web/convex/b2cAdoptionChecklist.ts` — table schema + queries + mutations + HTTP routes
- `apps/web/convex/schema.ts` — additions for `b2cAdoptionChecklist` and `b2cCoachingReplayWatched`
- `apps/web/convex/http.ts` — three new routes
