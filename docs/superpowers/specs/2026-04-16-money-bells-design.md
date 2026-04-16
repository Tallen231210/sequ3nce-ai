# Money Bells — Design Spec

**Status:** Approved — ready for implementation planning
**Author:** Tyler Allen (via collaborative brainstorming)
**Date:** 2026-04-16
**Target app:** `/apps/personal` (Sequ3nce Personal, B2C Electron)

---

## Problem

Sales floors traditionally celebrate closed deals in a shared Slack channel — names announced, cash called out, teammates hype each other up. The Sequ3nce Personal community currently has no equivalent: users close deals in isolation with no social celebration moment.

**Money Bells** is a new community channel that recreates that sales-floor energy for solo closers using Sequ3nce Personal. It pairs a **live monthly leaderboard** (ranked by cash collected) with a **broadcast feed** where closers share their closes and get reacted to, commented on, and hyped up by the community.

## Goals

- Create a consistent moment of celebration + competition that pulls users back to the app
- Drive engagement through monthly prizes (optionally activated by founders)
- Build on existing community infrastructure (`PostCard`, `ReactionPills`, `CommentThread`) — do not rebuild
- Keep leaderboard aggregation fast for 500–2000 users at scale

## Non-Goals (explicit)

- **Not building** contest types beyond cash collected (funniest call, most affiliates, objection handling) — those evolve `Call of the Week` into a future "Contests" tab in a separate spec
- **Not building** in-app pay stub upload / verification — prize payouts handled externally via founder DM
- **Not building** Stripe/payment automation for prize payouts
- **Not building** a full admin UI for prize configuration in v1 — founders activate prizes by calling `setMonthlyPrize` directly via the Convex dashboard or CLI. Proper admin UI is future work.
- **Not deleting** `Call of the Week` — it coexists with Money Bells in the community sidebar
- **Not building** notifications/DMs when winners are determined — this is a follow-up project the user is planning separately

---

## Architectural Approach

**Approach C — Hybrid: broadcasts as dedicated rows + linked community posts.**

Each broadcast creates two atomic rows:

1. A `b2cMoneyBellBroadcasts` row — broadcast-specific data (cashCollected, month, callId) with purpose-built indexes for leaderboard queries
2. A `b2cCommunityPosts` row with a `broadcastId` reference — the "linked post" is where reactions, comments, likes, pins, and edits hang off (reusing all existing community infrastructure)

**Rejected alternatives:**
- *Approach A (broadcasts as enhanced posts):* would pollute the shared posts table with broadcast-only optional fields over time as new rich-content post types get added. Creates a "god table" anti-pattern.
- *Approach B (dedicated table, no linked post):* would require rebuilding or adapting `ReactionPills`, `CommentThread`, edit/delete menus — significant duplication.

---

## Data Model

### New table: `b2cMoneyBellBroadcasts`

```ts
b2cMoneyBellBroadcasts: defineTable({
  userId: v.id("b2cUsers"),
  callId: v.id("calls"),
  cashCollected: v.number(),            // snapshot at broadcast time
  note: v.optional(v.string()),         // optional 1-line user note, max 140 chars
  postId: v.id("b2cCommunityPosts"),    // linked post for reactions/comments
  isDeleted: v.boolean(),
  deletedAt: v.optional(v.number()),
  deletedBy: v.optional(v.id("b2cUsers")),
  broadcastedAt: v.number(),
  month: v.string(),                    // "2026-04" — denormalized for leaderboard queries
})
  .index("by_month_cash", ["month", "isDeleted", "cashCollected"])
  .index("by_user_month", ["userId", "month", "isDeleted"])
  .index("by_call", ["callId"])         // enforces one broadcast per call
  .index("by_post", ["postId"])
```

### New table: `b2cMoneyBellPrizes`

```ts
b2cMoneyBellPrizes: defineTable({
  month: v.string(),                    // "2026-04" — one row per month
  prizeAmount: v.optional(v.number()),  // null = no prize
  prizeLabel: v.optional(v.string()),   // default "Top Cash Collected"
  winnerUserId: v.optional(v.id("b2cUsers")),
  winnerCashCollected: v.optional(v.number()),
  paid: v.boolean(),
  paidAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_month", ["month"])
  .index("by_paid_status", ["paid"])
```

### New table: `b2cMoneyBellOptIns`

```ts
b2cMoneyBellOptIns: defineTable({
  userId: v.id("b2cUsers"),
  joinedAt: v.number(),
  acknowledgedWarning: v.boolean(),
})
  .index("by_user", ["userId"])
```

### Extended existing table: `b2cCommunityPosts`

One new optional field:
```ts
broadcastId: v.optional(v.id("b2cMoneyBellBroadcasts"))
```

Standard posts leave it `null`. Broadcast posts have it set. `PostCard` checks this field to render the broadcast variant.

---

## Component Architecture

### Backend

**New file:** `apps/web/convex/b2cMoneyBells.ts`

- **Mutations:** `joinMoneyBells`, `createBroadcast`, `deleteBroadcast`, `setMonthlyPrize`, `markPrizePaid`
- **Queries:** `getLeaderboard(month, page)`, `getUserRank(userId, month)`, `getHallOfFame()`, `getOptInStatus(userId)`, `getMonthlyPrize(month)`, `hasBroadcastForCall(callId)`
- **Internal action:** `determineMonthWinner` — runs via cron
- **Cron job:** registered in `apps/web/convex/crons.ts`, runs at midnight UTC on the 1st of each month

**Extended files:**
- `apps/web/convex/schema.ts` — 3 new tables + `broadcastId` field on `b2cCommunityPosts`
- `apps/web/convex/http.ts` — ~6 new HTTP routes
- `apps/personal/src/renderer/convex.ts` — client wrappers for new mutations/queries

### Frontend

**New folder:** `apps/personal/src/renderer/views/community/moneyBells/`

```
MoneyBellsView.tsx          # top-level view, hooks into SPECIAL_VIEWS
MoneyBellsJoinPrompt.tsx    # first-run welcome + honor-system acknowledgment
MoneyBellsLeaderboard.tsx   # race track + pagination
MoneyBellsRaceLane.tsx      # single lane (avatar + label, positioned)
MoneyBellsYourRank.tsx      # pinned amber "Your rank" strip
MoneyBellsHallOfFame.tsx    # past winners strip (only rendered if prizes exist)
BroadcastCard.tsx           # renders when PostCard detects broadcastId
BroadcastCelebrationModal.tsx  # post-call form "🎉 Share this?" modal
```

**Modified files:**
- `CommunityView.tsx` — add `'money-bells'` to `SPECIAL_VIEWS`
- `ChannelSidebar.tsx` — add Money Bells button at the top (above Feature Requests)
- `PostCard.tsx` — when `post.broadcastId` is set, render `BroadcastCard` instead of default body/actions
- `PostCallQuestionnaire.tsx` — after successful close submission, if opted in, open `BroadcastCelebrationModal`

### Component Hierarchy (runtime)

```
MoneyBellsView
├── (if not opted in) MoneyBellsJoinPrompt
└── (if opted in)
    ├── MoneyBellsLeaderboard (fixed top, ~180px)
    │   ├── [Header: title + prize pill + days-left + pager]
    │   ├── MoneyBellsRaceLane × 5 (current page)
    │   ├── MoneyBellsYourRank (pinned)
    │   └── MoneyBellsHallOfFame (if any past winners)
    └── ChannelPostList (scrollable feed)
        └── PostCard (detects broadcastId → BroadcastCard variant)
            ├── ReactionPills (existing)
            └── CommentThread (existing)

Separately mounted:
BroadcastCelebrationModal  # triggered from PostCallQuestionnaire
```

### Reused existing components

| Existing component | Used for |
|---|---|
| `PostCard` | Wrapper; delegates to `BroadcastCard` for broadcast posts |
| `ReactionPills` | Reactions on broadcasts (same as regular posts) |
| `CommentThread` | Comments on broadcasts |
| `ChannelPostList` | Feed below leaderboard |
| `ChannelSidebar` pattern | New nav button matching Feature Requests style |
| Avatar gradient helpers (`getAvatarGradient`) | Race track avatars |
| Prize pill / countdown style (from `CallOfTheWeekView`) | Header pill + days-left |

---

## UX Design Decisions

### 1. Opt-in lives inside the Money Bells channel

First-time visitors see `MoneyBellsJoinPrompt` instead of the leaderboard — a welcome screen with the honor-system copy:

```
Welcome to Money Bells 💰

Your closes will appear on the monthly leaderboard. Compete hard — but play fair.

  • We verify monthly prize winners with pay stubs before paying out
  • Inflated numbers → warning
  • Repeat offenders → removed from Money Bells

Keep it honest.

[Join Money Bells →]
```

After clicking Join, the `b2cMoneyBellOptIns` row is created and the full channel is unlocked.

The same copy is surfaced in Settings → Community for re-reference.

### 2. Leaderboard — Race Track layout

5 horizontal lanes stacked vertically (max ~180px total). Each lane represents one of the current page's top-5 users. Avatar is positioned along the lane based on `(userCashCollected / monthlyGoal) × 100%`. Monthly goal = next $50k increment above current leader, so the finish line (🏁) always feels reachable.

When a broadcast lands, the associated user's avatar animates to its new horizontal position (slides right).

**Header:** title + prize pill (if activated) + days-left countdown (if prize activated) + pager `‹ 1 / N ›`
**Per page:** 5 lanes
**Below lanes:** amber "Your rank: #N · $X" pinned strip (always visible regardless of page)
**Below that:** Hall of Fame strip (only if at least one prize has been awarded)

### 3. Broadcast trigger — Celebration modal

After the post-call form is submitted with `outcome = "closed"`, if the user has opted into Money Bells, a celebration modal opens:

```
🎉 Just closed a deal!

+$14,500  (animated counter from 0)

[Optional note — "hardest prospect of the quarter"]

[Broadcast to Money Bells]   [Skip this one]
```

Clicking Broadcast fires `createBroadcast`. The modal then shows:

```
Broadcasted! [View Money Bells →]    [Undo (30s)]
```

The 30-second inline Undo is separate from the 1-hour self-delete policy. The Undo button is UX sugar for the immediate "oh wait" moment; after it expires, deletion still happens via the broadcast card's "..." menu (which honors the 1-hour self-delete window).

### 4. Trust model — trust + founder override

- Broadcasts go live instantly, no approval
- Founders (users with `founder` badge) see a "..." menu on every broadcast card with a Delete option
- Community reactions and comments naturally surface suspicious numbers

### 5. Edit/delete rules

- **Self-delete:** within 1 hour of broadcast only
- **Founder-delete:** anytime
- **Edits to underlying call's cash-collected:** broadcast updates with a subtle `(edited)` tag. Prevents bait-and-switch.
- **Deletion:** soft-delete both the broadcast row AND the linked post row atomically

### 6. Prizes — optional per month

- Leaderboard always runs regardless of prize status
- `b2cMoneyBellPrizes.prizeAmount` is nullable — when `null`, no prize pill / countdown shown in header
- Founder activates a prize via `setMonthlyPrize` mutation. **v1:** founder calls this directly via the Convex dashboard function runner or a CLI (`npx convex run b2cMoneyBells:setMonthlyPrize ...`). Dedicated admin UI is future work.
- Cron determines winner at month-end; if no prize was set, winner is still tracked in the prizes table (`winnerUserId`) but no payout process triggers
- `Hall of Fame` strip only renders once at least one month has a paid prize

### 7. Empty state

When a user first enters Money Bells and there are no broadcasts for the current month:
- Leaderboard renders with empty lanes and copy: *"No broadcasts yet · Close a deal to claim #1"*
- "Your rank" strip shows: *"You haven't broadcasted yet this month — [Close a deal →]"*

---

## Data Flows (Step-by-Step)

### Flow 1: Joining Money Bells (first-time opt-in)

1. User clicks "Money Bells" in `ChannelSidebar`
2. `MoneyBellsView` queries `getOptInStatus(userId)` — returns `null` (never joined)
3. Renders `MoneyBellsJoinPrompt` instead of leaderboard
4. User reads honor-system copy, clicks **[Join Money Bells →]**
5. Calls `joinMoneyBells({ userId, acknowledgedWarning: true })` mutation
6. Backend creates row in `b2cMoneyBellOptIns`
7. View re-queries, sees opt-in exists, renders leaderboard

### Flow 2: Broadcasting a closed deal

1. User takes a call (existing Sequ3nce flow, unchanged)
2. Post-call form (`PostCallQuestionnaire`) appears
3. User fills in `outcome = "closed"`, `cashCollected = 14500`
4. User clicks Submit — call saved to `calls` table (existing behavior)
5. `PostCallQuestionnaire` checks if user is opted in + outcome is closed
6. If both yes → opens `BroadcastCelebrationModal`
7. Modal shows photo, "Just closed a deal!", animated `+$14,500`, optional note input, `[Broadcast]` / `[Skip]`
8. User clicks Broadcast → calls `createBroadcast({ userId, callId, cashCollected, note? })` mutation
9. Backend, within a single atomic mutation:
   - Validates inputs (cashCollected cap, note length, opt-in exists, call outcome closed, call not already broadcast)
   - Creates `b2cCommunityPosts` row first (channel = money-bells, body = "", `broadcastId` undefined since the field is optional)
   - Creates `b2cMoneyBellBroadcasts` row with `postId = post._id` (satisfies the required `postId` field)
   - Patches the post row with `broadcastId = broadcast._id` to complete the mutual reference
   - Returns the new broadcast
10. Modal updates to *"Broadcasted! [View Money Bells →]"*. A 30-second inline **Undo** button appears alongside the confirmation — clicking it calls `deleteBroadcast` immediately (the 1-hour self-delete policy still applies via the broadcast card's "..." menu later)
11. Feed subscribers see the new broadcast appear (Convex reactivity)

### Flow 3: Rendering the leaderboard

1. `MoneyBellsLeaderboard` calls `getLeaderboard(month, page)`
2. Backend: queries `b2cMoneyBellBroadcasts.by_month_cash` for `month = "2026-04"` + `isDeleted = false`
3. Aggregates: groups by `userId`, sums `cashCollected`, counts broadcasts
4. Sorts by total cash descending, paginates 5/page
5. Joins with `b2cUsers` for names/photos
6. Separately: `getUserRank(userId, month)` for pinned row
7. Separately: `getMonthlyPrize(month)` for prize pill + days-left
8. Frontend computes lane positions as `(userCash / monthlyGoal) × 100%`
9. `monthlyGoal` = next `$50k` increment above current leader

### Flow 4: Deleting a broadcast

**Self-delete (within 1 hour):**
1. User hovers on their own broadcast → "..." menu
2. Clicks Delete → confirmation
3. Calls `deleteBroadcast({ userId, broadcastId })`
4. Backend checks `broadcastedAt > Date.now() - 3_600_000` AND `broadcast.userId === userId`
5. If fails → error "Can't delete after 1 hour — ask a founder"
6. Otherwise: atomic soft-delete of broadcast + linked post
7. Leaderboard auto-updates via Convex reactivity

**Founder-delete (any time):**
1. Founder hovers on any broadcast → "..." menu with Delete
2. Same mutation; backend allows if `founder` badge OR within self-delete window

### Flow 5: Month-end winner determination (cron)

1. Cron runs at 00:00 UTC on the 1st of each month
2. For previous month (e.g., `"2026-04"`):
   - Query top broadcaster by total cash (excluding `isDeleted`)
   - Tiebreaker: earliest `broadcastedAt` of the top user's broadcasts
   - If no broadcasts → skip
3. Update `b2cMoneyBellPrizes` row for `"2026-04"`:
   - If row exists with `prizeAmount` set → patch with `winnerUserId`, `winnerCashCollected`
   - If row doesn't exist → create with `winnerUserId` set but no `prizeAmount`
4. Create new row for current month (e.g., `"2026-05"`) with `prizeAmount = null` (founder must activate)

### Flow 6: Founder activates a prize

1. Founder calls `setMonthlyPrize({ month, prizeAmount, prizeLabel? })` — admin UI or direct mutation
2. Backend upserts `b2cMoneyBellPrizes` row for that month, verifies caller has `founder` badge
3. Leaderboard header starts showing prize pill + days-left countdown

### Flow 7: Marking a prize as paid (external verification)

1. Founder verifies pay stub out-of-band (DM/email)
2. Calls `markPrizePaid({ month, paidBy })` mutation
3. Backend sets `paid = true`, `paidAt = Date.now()`
4. Winner's entry appears in `HallOfFame` strip below the leaderboard
5. *(Future work: notification system will DM winner when prize is activated / paid — out of scope for this spec)*

---

## Edge Cases

| Case | Handling |
|---|---|
| Duplicate broadcast for same call | Rejected by `by_call` index; UI disables button if broadcast exists |
| $0 cash (financing, split pay) | Allowed; shows "$0 today" with note if user added one |
| Call deleted after broadcast | Broadcast retains snapshot of `cashCollected`; call ref becomes dangling but broadcast unaffected |
| Edit to call's cash-collected | Broadcast displays new amount with `(edited)` tag |
| Non-opted-in user triggers broadcast | Backend re-checks opt-in in `createBroadcast`; returns error if not opted in |
| Broadcast at month boundary | Uses UTC timestamp's month — April 30 23:59 UTC → April; May 1 00:00 UTC → May |
| Concurrent broadcasts | Atomic mutation; both rows create or neither |
| Pagination beyond last page | Returns empty; UI disables "›" when `page × 5 ≥ totalBroadcasters` |
| Month with 0 broadcasts | Cron skips winner determination; Hall of Fame skips that month |
| Prize active but no broadcasts | Admin sees "April prize activated but 0 broadcasts — no winner"; founder decides to carry forward or leave |
| User opts out later | v1: "Leave Money Bells" button in Settings → removes opt-in row. Past broadcasts stay. Future post-call modal won't show. |
| Network failure during broadcast | Atomic mutation — retries safely |
| Reactions/comments on deleted broadcast | Inherits existing deleted-post handling in `PostCard` |
| User with no broadcasts this month | "Your rank" strip shows empty-state CTA |

---

## Validation Rules (Backend)

### `createBroadcast`
- `cashCollected >= 0` and `<= 10_000_000` (sanity cap)
- `note?.length <= 140`
- User must have opt-in row in `b2cMoneyBellOptIns`
- `callId` must exist and belong to `userId`
- `callId` must not already have a broadcast (unique via `by_call`)
- Call's `outcome` must be `"closed"`

### `deleteBroadcast`
- Broadcast must exist and `isDeleted = false`
- Deleter must be broadcast's owner (within 1h window) OR have `founder` badge

### `setMonthlyPrize`
- Caller must have `founder` badge
- `month` must match `YYYY-MM` format
- `prizeAmount` (if present) must be `> 0`

### `markPrizePaid`
- Caller must have `founder` badge
- Prize row for `month` must exist with `winnerUserId` set

---

## Testing Strategy

### Unit tests (Convex)
- `determineMonthWinner` — top 1 by cash, tiebreak by earliest broadcast, handles empty month
- `getLeaderboard` — pagination correctness, sort order, `isDeleted` filter
- `createBroadcast` — rejects duplicates, non-opted-in, unclosed deals, over-cap amounts
- `deleteBroadcast` — 1h window enforcement, founder override, atomic soft-delete of both rows
- `setMonthlyPrize` — founder-only enforcement, month format validation

### Integration tests
- Full broadcast flow: opt-in → close deal → broadcast → leaderboard updates + feed updates
- Delete flow: broadcast → delete within 1h → removed from leaderboard + feed
- Month boundary: broadcast on April 30 23:59 UTC counts for April; May 1 00:01 UTC counts for May
- Founder delete of another user's broadcast works; regular user delete after 1h blocked

### E2E (Playwright, when app is running)
- User joins Money Bells (sees honor-system copy, acknowledges)
- User broadcasts from post-call modal, sees card appear in feed
- User reacts to someone else's broadcast, reaction count updates
- User comments on a broadcast, comment thread expands
- Pagination "‹ / ›" buttons work; "Your rank" stays pinned

### Manual QA
- Celebration modal animation feels celebratory (not jarring)
- Race track avatars animate smoothly on position change
- Empty state is clean (no jarring blank states)
- Founder-only controls hidden from regular users
- Dark mode renders correctly (app already supports light/dark)

---

## Implementation Order (suggested)

1. **Schema + backend foundations** — add 3 tables + `broadcastId` field, deploy to dev
2. **Core mutations/queries** — `joinMoneyBells`, `createBroadcast`, `deleteBroadcast`, `getLeaderboard`, `getUserRank`, `getOptInStatus`
3. **Frontend shell** — `MoneyBellsView`, `MoneyBellsJoinPrompt`, `ChannelSidebar` button, `CommunityView` SPECIAL_VIEWS entry
4. **Leaderboard** — `MoneyBellsLeaderboard`, `MoneyBellsRaceLane`, `MoneyBellsYourRank` (no prize/Hall of Fame yet)
5. **Broadcast card** — `BroadcastCard` component + `PostCard` variant dispatch
6. **Celebration modal** — `BroadcastCelebrationModal` + `PostCallQuestionnaire` trigger
7. **Reactions + comments** — verify existing infra works (no new code needed if done right)
8. **Prize system** — `setMonthlyPrize`, `markPrizePaid`, prize pill + days-left in header, `MoneyBellsHallOfFame` strip
9. **Cron** — month-end winner determination
10. **Delete flow** — 1h window enforcement, founder override, atomic soft-delete
11. **Edge cases + polish** — empty states, animation, dark mode check
12. **Testing** — unit → integration → E2E → manual QA

---

## Future Work (explicit out-of-scope)

- Notification system / DM winners (user planning this as a separate feature)
- Admin UI for prize configuration (v1: direct mutation call; proper UI later)
- In-app pay stub upload and verification
- Stripe payment automation for prize payouts
- Sound effects / audio cues on broadcast arrival (may be added later)
- Weekly leaderboards (monthly-only for v1)
- Streak multipliers, deal categories, advanced gamification
- "Contests" tab evolution from `Call of the Week` — separate spec
- Auto-detection of potentially fake broadcasts via ML/heuristics
