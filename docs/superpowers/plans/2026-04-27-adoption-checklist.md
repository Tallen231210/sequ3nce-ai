# Adoption Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single titlebar button that opens a popover with two sections — a 5-task Setup track that decays across 30 days, and a perpetual Earn track with live state for Money Bells / Creator Cash / Testimonials.

**Architecture:** New Convex tables for per-user widget metadata + replay-watched tracking. Single-query backend that returns everything the renderer needs (state + per-task completion booleans + dynamic Earn data). Renderer mounts a button in the existing `MeetingBotHub` titlebar; clicking opens an anchored popover. Each task's "Try it now →" CTA deep-links via URL hash routing. Destination views render a `<TaskHintBanner>` that reads the hash param. No tutorial videos.

**Tech Stack:** Convex (backend tables, queries, mutations, HTTP routes), React + TypeScript + Tailwind (renderer), Electron (Personal app shell). No new external dependencies.

**Verification model:** This codebase does not run automated tests in this area. Each task ends with `npx tsc --noEmit` (zero project errors) + a brief manual smoke check (load the app, verify the change works). Frequent commits between tasks.

**Spec reference:** `docs/superpowers/specs/2026-04-27-adoption-checklist-design.md`

---

## File structure

**New (Convex backend):**
- `apps/web/convex/b2cAdoptionChecklist.ts` — table-defining file is `schema.ts`; this hosts the live query, mutations, helpers
- `apps/web/convex/b2cCoachingReplayWatched.ts` — replay-progress upsert mutation

**Modified (Convex backend):**
- `apps/web/convex/schema.ts` — add two tables (`b2cAdoptionChecklist`, `b2cCoachingReplayWatched`)
- `apps/web/convex/http.ts` — add four HTTP routes (one query + three mutations)

**New (renderer):**
- `apps/personal/src/renderer/views/adoption-checklist/types.ts` — shared types (the `ChecklistData` shape returned by the backend)
- `apps/personal/src/renderer/views/adoption-checklist/tasks.ts` — per-task config map (titles, banner copy, deep-link targets)
- `apps/personal/src/renderer/views/adoption-checklist/useAdoptionChecklist.ts` — hook that polls the backend and exposes mutations
- `apps/personal/src/renderer/views/adoption-checklist/TaskRow.tsx` — single row UI (used by both sections)
- `apps/personal/src/renderer/views/adoption-checklist/SetupSection.tsx` — Setup section (header + 5 rows + dismiss/decay)
- `apps/personal/src/renderer/views/adoption-checklist/EarnSection.tsx` — Earn section (header + 3 dynamic rows)
- `apps/personal/src/renderer/views/adoption-checklist/AdoptionChecklistPopover.tsx` — popover wrapper
- `apps/personal/src/renderer/views/adoption-checklist/AdoptionChecklistButton.tsx` — titlebar button + phase-driven label + pulse + red-dot
- `apps/personal/src/renderer/views/adoption-checklist/TaskHintBanner.tsx` — banner rendered on destination views

**Modified (renderer):**
- `apps/personal/src/renderer/convex.ts` — client-side fetch wrappers for the new endpoints
- `apps/personal/src/renderer/views/MeetingBotHub.tsx` — mount the button in the titlebar; expose a deep-link routing helper that other tabs can react to
- `apps/personal/src/renderer/views/ProfileView.tsx` — render `<TaskHintBanner taskId="profile" />`
- `apps/personal/src/renderer/views/CallHistoryView.tsx` — render `<TaskHintBanner taskId="highlightClip" />`
- `apps/personal/src/renderer/views/community/coaching/CoachingView.tsx` — render `<TaskHintBanner taskId="coachingCall" />`
- `apps/personal/src/renderer/views/QuickBotModal.tsx` — render `<TaskHintBanner taskId="firstCall" />`
- `apps/personal/src/renderer/views/stream/StreamModal.tsx` — render `<TaskHintBanner taskId="stream" />`
- `apps/personal/src/renderer/views/community/coaching/ReplayPlayerModal.tsx` — fire 10s-throttled replay-progress mutation while playing

---

## Task 1: Add Convex schema rows

**Files:**
- Modify: `apps/web/convex/schema.ts`

- [ ] **Step 1: Locate the schema additions point**

Open `apps/web/convex/schema.ts`. Find the location near other `b2c*` tables (search for `b2cMoneyBellOptIns` or `b2cContentSubmissions` to anchor your insertion).

- [ ] **Step 2: Add `b2cAdoptionChecklist` table definition**

Insert this table definition next to other `b2c*` tables:

```ts
  // Per-user metadata for the adoption-checklist widget. Task COMPLETION is
  // not stored here — it's derived live from source-of-truth tables (profile,
  // calls, highlights, coaching attendance, stream entries). This row only
  // tracks UI lifecycle: when the user first encountered the widget, whether
  // they dismissed Setup, whether the popover has auto-opened yet, and the
  // last time the user "saw" Earn (used to decide red-dot visibility).
  b2cAdoptionChecklist: defineTable({
    userId: v.id("b2cUsers"),
    firstSeenAt: v.number(),
    setupDismissedAt: v.optional(v.number()),
    setupCompletedAt: v.optional(v.number()),
    setupAutoOpenedAt: v.optional(v.number()),
    earnRedDotLastSeenAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"]),
```

- [ ] **Step 3: Add `b2cCoachingReplayWatched` table definition**

Insert just below the previous addition:

```ts
  // Tracks replay-watch progress per (user, coaching call). Used by the
  // adoption-checklist "join coaching call OR watch a replay" task. The
  // ReplayPlayerModal fires a throttled upsert every 10s while playing.
  // A row with watchedSeconds >= 30 satisfies the task.
  b2cCoachingReplayWatched: defineTable({
    userId: v.id("b2cUsers"),
    callId: v.id("b2cCoachingCalls"),
    watchedSeconds: v.number(),
    firstWatchedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_call", ["userId", "callId"]),
```

- [ ] **Step 4: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -10 ; echo "---DONE---"`
Expected: No project errors before `---DONE---`.

- [ ] **Step 5: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/convex/schema.ts
git commit -m "Adoption checklist: add b2cAdoptionChecklist + b2cCoachingReplayWatched tables"
```

---

## Task 2: Convex backend — adoption checklist queries + mutations

**Files:**
- Create: `apps/web/convex/b2cAdoptionChecklist.ts`

- [ ] **Step 1: Create the file with the live query**

Create `apps/web/convex/b2cAdoptionChecklist.ts` with this content:

```ts
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";

// ============================================================================
// Live query — single round-trip that returns everything the widget needs.
// ============================================================================

export const getChecklistData = query({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    // Lifecycle state row. Will be null on first call — that's fine; the
    // renderer creates it via ensureChecklistRow on first interaction.
    const stateRow = await ctx.db
      .query("b2cAdoptionChecklist")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    // ---- SETUP: per-task completion checks (live from source tables) ----

    // Profile: requires slug, photoUrl, headline, and at least one industry.
    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const profileComplete =
      !!profile?.slug &&
      !!profile?.photoUrl &&
      !!profile?.headline &&
      (profile?.industries?.length ?? 0) >= 1;

    // First call: any calls row exists for the user's closer.
    const userDoc = await ctx.db.get(args.userId);
    let firstCallComplete = false;
    if (userDoc) {
      const u = userDoc as Doc<"b2cUsers">;
      const closer = await ctx.db
        .query("closers")
        .withIndex("by_team", (q) => q.eq("teamId", u.personalWorkspaceId as Id<"teams">))
        .first();
      if (closer) {
        const anyCall = await ctx.db
          .query("calls")
          .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
          .first();
        firstCallComplete = !!anyCall;
      }
    }

    // Highlight clip: any highlight row exists.
    const anyHighlight = await ctx.db
      .query("b2cHighlightClips")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const highlightClipComplete = !!anyHighlight;

    // Coaching: attendance OR replay watched ≥30s.
    const anyAttendance = await ctx.db
      .query("b2cCoachingCallAttendance")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    let coachingCallComplete = !!anyAttendance;
    if (!coachingCallComplete) {
      const replayRows = await ctx.db
        .query("b2cCoachingReplayWatched")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();
      coachingCallComplete = replayRows.some((r) => r.watchedSeconds >= 30);
    }

    // Stream: any stream/dictation entry. The B2C app records these in
    // b2cStreamTranscriptions (per Stream feature).
    const anyStreamEntry = await ctx.db
      .query("b2cStreamTranscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const streamComplete = !!anyStreamEntry;

    // ---- EARN: live state for each row ----

    // Money Bells: opt-in + live leaderboard rank for current month.
    const optIn = await ctx.db
      .query("b2cMoneyBellOptIns")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const monthKey = monthKeyFor(Date.now());
    const monthBroadcasts = await ctx.db
      .query("b2cMoneyBellBroadcasts")
      .withIndex("by_month", (q) => q.eq("month", monthKey))
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .collect();
    const totalsByUser = new Map<string, { total: number; firstAt: number }>();
    for (const b of monthBroadcasts) {
      const existing = totalsByUser.get(b.userId) ?? { total: 0, firstAt: b.broadcastedAt };
      totalsByUser.set(b.userId, {
        total: existing.total + b.cashCollected,
        firstAt: Math.min(existing.firstAt, b.broadcastedAt),
      });
    }
    const sorted = [...totalsByUser.entries()].sort((a, b) => {
      if (b[1].total !== a[1].total) return b[1].total - a[1].total;
      return a[1].firstAt - b[1].firstAt;
    });
    const myRankIndex = sorted.findIndex(([uid]) => uid === args.userId);
    const moneyBells = {
      optedIn: !!optIn,
      currentRank: myRankIndex >= 0 ? myRankIndex + 1 : null,
      totalParticipants: sorted.length,
      daysRemaining: daysRemainingInMonth(Date.now()),
      monthLabel: monthLabelFor(Date.now()),
    };

    // Creator Cash: count + sum approved/paid clip submissions.
    const clipSubs = await ctx.db
      .query("b2cContentSubmissions")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("type", "clip"),
      )
      .collect();
    const paidClips = clipSubs.filter((s) => s.status === "paid");
    const creatorCash = {
      totalEarned: paidClips.reduce((sum, s) => sum + (s.paidAmount ?? 0), 0),
      approvedCount: clipSubs.filter((s) => s.status === "approved" || s.status === "paid").length,
    };

    // Testimonial: most recent submission of type=testimonial.
    const testimonialSubs = await ctx.db
      .query("b2cContentSubmissions")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("type", "testimonial"),
      )
      .order("desc")
      .take(1);
    const latest = testimonialSubs[0];
    const testimonial = latest
      ? {
          status: latest.status,
          submittedAt: latest._creationTime,
          paidAmount: latest.paidAmount ?? null,
        }
      : null;

    return {
      state: stateRow
        ? {
            firstSeenAt: stateRow.firstSeenAt,
            setupDismissedAt: stateRow.setupDismissedAt ?? null,
            setupCompletedAt: stateRow.setupCompletedAt ?? null,
            setupAutoOpenedAt: stateRow.setupAutoOpenedAt ?? null,
            earnRedDotLastSeenAt: stateRow.earnRedDotLastSeenAt ?? null,
          }
        : null,
      setup: {
        profile: profileComplete,
        firstCall: firstCallComplete,
        highlightClip: highlightClipComplete,
        coachingCall: coachingCallComplete,
        stream: streamComplete,
      },
      earn: { moneyBells, creatorCash, testimonial },
    };
  },
});

// ============================================================================
// Mutations — lifecycle state.
// ============================================================================

export const ensureChecklistRow = mutation({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("b2cAdoptionChecklist")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) return existing._id;
    const id = await ctx.db.insert("b2cAdoptionChecklist", {
      userId: args.userId,
      firstSeenAt: Date.now(),
    });
    return id;
  },
});

export const markSetupAutoOpened = mutation({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("b2cAdoptionChecklist")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!row) return;
    if (row.setupAutoOpenedAt) return; // already opened — idempotent
    await ctx.db.patch(row._id, { setupAutoOpenedAt: Date.now() });
  },
});

export const dismissSetup = mutation({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("b2cAdoptionChecklist")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, { setupDismissedAt: Date.now() });
  },
});

export const markEarnSeen = mutation({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("b2cAdoptionChecklist")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, { earnRedDotLastSeenAt: Date.now() });
  },
});

// Internal — called by completion-detection paths in other code IF needed.
// Currently completion is derived live, so this is just a future hook.
export const _patchSetupCompletedAt = internalMutation({
  args: { userId: v.id("b2cUsers"), at: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("b2cAdoptionChecklist")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!row) return;
    if (row.setupCompletedAt) return;
    await ctx.db.patch(row._id, { setupCompletedAt: args.at });
  },
});

// ============================================================================
// Helpers
// ============================================================================

function monthKeyFor(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function monthLabelFor(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString("en-US", { month: "long" });
}

function daysRemainingInMonth(ms: number): number {
  const d = new Date(ms);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return Math.max(0, lastDay - d.getUTCDate());
}
```

- [ ] **Step 2: Verify the indexes referenced exist**

Some indexes referenced (`by_team` on `closers`, `by_closer` on `calls`, `by_user` on `b2cProfiles`, `b2cHighlightClips`, `b2cCoachingCallAttendance`, `b2cStreamTranscriptions`, `b2cMoneyBellOptIns`, `by_month` on `b2cMoneyBellBroadcasts`, `by_user_type` on `b2cContentSubmissions`) need to exist. Check by grep:

Run: `grep -nE 'by_user|by_team|by_closer|by_month|by_user_type' /Users/tylerallen/Desktop/sequ3nce-ai/apps/web/convex/schema.ts`

Expected: each index name appears next to its table. If any are missing, the file won't typecheck — note the missing index name, find the table, add the index, and retry. The schema is the source of truth; do not invent indexes that don't exist.

- [ ] **Step 3: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -20 ; echo "---DONE---"`
Expected: No project errors. If you see "Property 'X' does not exist" errors against schema indexes, fix as per Step 2.

- [ ] **Step 4: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/convex/b2cAdoptionChecklist.ts
git commit -m "Adoption checklist: backend query + lifecycle mutations"
```

---

## Task 3: Convex backend — replay-watched mutation

**Files:**
- Create: `apps/web/convex/b2cCoachingReplayWatched.ts`

- [ ] **Step 1: Create the file**

Create `apps/web/convex/b2cCoachingReplayWatched.ts` with this content:

```ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Upsert replay-watch progress for a (user, call) pair. Called by
// ReplayPlayerModal every 10s while the user is actively watching. The
// adoption-checklist "join coaching call or watch a replay" task is
// satisfied when ANY row exists with watchedSeconds >= 30.
export const recordReplayProgress = mutation({
  args: {
    userId: v.id("b2cUsers"),
    callId: v.id("b2cCoachingCalls"),
    watchedSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("b2cCoachingReplayWatched")
      .withIndex("by_user_call", (q) =>
        q.eq("userId", args.userId).eq("callId", args.callId),
      )
      .first();
    if (existing) {
      // Take the max — user might rewind, but we never want progress to drop.
      const next = Math.max(existing.watchedSeconds, args.watchedSeconds);
      if (next === existing.watchedSeconds) {
        // No-op for jitter; still bump updatedAt.
        await ctx.db.patch(existing._id, { updatedAt: now });
        return;
      }
      await ctx.db.patch(existing._id, {
        watchedSeconds: next,
        updatedAt: now,
      });
      return;
    }
    await ctx.db.insert("b2cCoachingReplayWatched", {
      userId: args.userId,
      callId: args.callId,
      watchedSeconds: args.watchedSeconds,
      firstWatchedAt: now,
      updatedAt: now,
    });
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -10 ; echo "---DONE---"`
Expected: No project errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/convex/b2cCoachingReplayWatched.ts
git commit -m "Adoption checklist: replay-watch progress mutation"
```

---

## Task 4: HTTP routes — checklist endpoints

**Files:**
- Modify: `apps/web/convex/http.ts`

- [ ] **Step 1: Find a good insertion point**

Run: `grep -n "/b2c/coaching-calls/end\|/b2c/coaching-calls/join" /Users/tylerallen/Desktop/sequ3nce-ai/apps/web/convex/http.ts | head -3`

Insert the new routes immediately after the last `/b2c/coaching-calls/*` route group. The pattern in this file: `http.route({ path, method, handler })`.

- [ ] **Step 2: Add five HTTP routes (one query + four mutations)**

Read 30 lines near an existing `http.route({ path: "/b2c/coaching-calls/end" ...})` block to confirm the exact pattern (CORS headers, request parsing, response shape). Then add this block:

```ts
  // ==================== Adoption Checklist ====================

  http.route({
    path: "/b2c/adoption-checklist",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const body = await request.json();
      const { userId } = body as { userId: string };
      if (!userId) {
        return new Response(JSON.stringify({ error: "Missing userId" }), {
          status: 400,
          headers: corsHeaders(),
        });
      }
      const data = await ctx.runQuery(api.b2cAdoptionChecklist.getChecklistData, {
        userId: userId as Id<"b2cUsers">,
      });
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: corsHeaders(),
      });
    }),
  });

  http.route({
    path: "/b2c/adoption-checklist/ensure",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const body = await request.json();
      const { userId } = body as { userId: string };
      if (!userId) {
        return new Response(JSON.stringify({ error: "Missing userId" }), {
          status: 400,
          headers: corsHeaders(),
        });
      }
      await ctx.runMutation(api.b2cAdoptionChecklist.ensureChecklistRow, {
        userId: userId as Id<"b2cUsers">,
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders(),
      });
    }),
  });

  http.route({
    path: "/b2c/adoption-checklist/mark-auto-opened",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const body = await request.json();
      const { userId } = body as { userId: string };
      await ctx.runMutation(api.b2cAdoptionChecklist.markSetupAutoOpened, {
        userId: userId as Id<"b2cUsers">,
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders(),
      });
    }),
  });

  http.route({
    path: "/b2c/adoption-checklist/dismiss-setup",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const body = await request.json();
      const { userId } = body as { userId: string };
      await ctx.runMutation(api.b2cAdoptionChecklist.dismissSetup, {
        userId: userId as Id<"b2cUsers">,
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders(),
      });
    }),
  });

  http.route({
    path: "/b2c/adoption-checklist/mark-earn-seen",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const body = await request.json();
      const { userId } = body as { userId: string };
      await ctx.runMutation(api.b2cAdoptionChecklist.markEarnSeen, {
        userId: userId as Id<"b2cUsers">,
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders(),
      });
    }),
  });

  http.route({
    path: "/b2c/coaching-calls/replay-progress",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const body = await request.json();
      const { userId, callId, watchedSeconds } = body as {
        userId: string;
        callId: string;
        watchedSeconds: number;
      };
      if (!userId || !callId || typeof watchedSeconds !== "number") {
        return new Response(JSON.stringify({ error: "Missing args" }), {
          status: 400,
          headers: corsHeaders(),
        });
      }
      await ctx.runMutation(api.b2cCoachingReplayWatched.recordReplayProgress, {
        userId: userId as Id<"b2cUsers">,
        callId: callId as Id<"b2cCoachingCalls">,
        watchedSeconds,
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders(),
      });
    }),
  });
```

If `corsHeaders` is not the helper used in this file, replace with whatever pattern existing routes use (search for `Access-Control-Allow-Origin` to find the canonical helper).

- [ ] **Step 3: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -10 ; echo "---DONE---"`
Expected: No project errors.

- [ ] **Step 4: Deploy Convex backend**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx convex deploy --yes 2>&1 | tail -5`
Expected: `✔ Deployed Convex functions to https://ideal-ram-982.convex.cloud`

- [ ] **Step 5: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/convex/http.ts
git commit -m "Adoption checklist: HTTP routes for query + lifecycle mutations + replay progress"
```

---

## Task 5: Renderer convex.ts — client wrappers

**Files:**
- Modify: `apps/personal/src/renderer/convex.ts`

- [ ] **Step 1: Find the insertion point**

Run: `grep -n "endCoachingCall\|joinCoachingCall" /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal/src/renderer/convex.ts | head -5`

Insert the new wrappers near other `b2c/coaching-calls/*` wrappers, towards the bottom of the file.

- [ ] **Step 2: Add client wrappers + types**

Append this block at the bottom of `apps/personal/src/renderer/convex.ts`:

```ts
// ==================== Adoption Checklist ====================

export interface AdoptionChecklistData {
  state: {
    firstSeenAt: number;
    setupDismissedAt: number | null;
    setupCompletedAt: number | null;
    setupAutoOpenedAt: number | null;
    earnRedDotLastSeenAt: number | null;
  } | null;
  setup: {
    profile: boolean;
    firstCall: boolean;
    highlightClip: boolean;
    coachingCall: boolean;
    stream: boolean;
  };
  earn: {
    moneyBells: {
      optedIn: boolean;
      currentRank: number | null;
      totalParticipants: number;
      daysRemaining: number;
      monthLabel: string;
    };
    creatorCash: {
      totalEarned: number;
      approvedCount: number;
    };
    testimonial:
      | { status: 'pending' | 'approved' | 'rejected' | 'paid'; submittedAt: number; paidAmount: number | null }
      | null;
  };
}

export async function getAdoptionChecklistData(
  userId: string,
): Promise<AdoptionChecklistData | { error: string }> {
  try {
    const res = await fetch(`${CONVEX_SITE_URL}/b2c/adoption-checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return await res.json();
  } catch {
    return { error: 'Network error' };
  }
}

export async function ensureAdoptionChecklistRow(userId: string): Promise<void> {
  try {
    await fetch(`${CONVEX_SITE_URL}/b2c/adoption-checklist/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch {
    /* non-fatal — UI degrades gracefully */
  }
}

export async function markSetupAutoOpened(userId: string): Promise<void> {
  try {
    await fetch(`${CONVEX_SITE_URL}/b2c/adoption-checklist/mark-auto-opened`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch { /* non-fatal */ }
}

export async function dismissAdoptionSetup(userId: string): Promise<void> {
  try {
    await fetch(`${CONVEX_SITE_URL}/b2c/adoption-checklist/dismiss-setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch { /* non-fatal */ }
}

export async function markEarnSeen(userId: string): Promise<void> {
  try {
    await fetch(`${CONVEX_SITE_URL}/b2c/adoption-checklist/mark-earn-seen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch { /* non-fatal */ }
}

export async function recordReplayProgress(
  userId: string,
  callId: string,
  watchedSeconds: number,
): Promise<void> {
  try {
    await fetch(`${CONVEX_SITE_URL}/b2c/coaching-calls/replay-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, callId, watchedSeconds }),
    });
  } catch { /* non-fatal */ }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -10 ; echo "---DONE---"`
Expected: No project errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/personal/src/renderer/convex.ts
git commit -m "Adoption checklist: client-side fetch wrappers + types"
```

---

## Task 6: Renderer — types + tasks config map

**Files:**
- Create: `apps/personal/src/renderer/views/adoption-checklist/types.ts`
- Create: `apps/personal/src/renderer/views/adoption-checklist/tasks.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal/src/renderer/views/adoption-checklist
```

- [ ] **Step 2: Create `types.ts`**

Create `apps/personal/src/renderer/views/adoption-checklist/types.ts`:

```ts
export type SetupTaskId =
  | 'profile'
  | 'firstCall'
  | 'highlightClip'
  | 'coachingCall'
  | 'stream';

export type EarnTaskId = 'moneyBells' | 'creatorCash' | 'testimonial';

export type TaskId = SetupTaskId | EarnTaskId;

// Where the "Try it now →" CTA sends the user.
export type CtaTarget =
  | { kind: 'tab'; tabId: string }
  | { kind: 'modal'; modalId: 'quickBot' | 'stream' }
  | { kind: 'subview'; tabId: string; subview: string };

export interface SetupTaskConfig {
  id: SetupTaskId;
  title: string;
  description: string;
  ctaLabel: string;
  ctaTarget: CtaTarget;
  bannerCopy: string;
}
```

- [ ] **Step 3: Create `tasks.ts`**

Create `apps/personal/src/renderer/views/adoption-checklist/tasks.ts`:

```ts
import type { SetupTaskConfig, SetupTaskId } from './types';

// Single source of truth for setup task copy + deep-link targets. Earn rows
// are built dynamically from live state, so they don't have a static config
// equivalent here — see EarnSection.tsx for that logic.
export const SETUP_TASKS: SetupTaskConfig[] = [
  {
    id: 'profile',
    title: 'Complete your public profile',
    description: 'Slug, photo, headline, and at least one industry. ~90 seconds.',
    ctaLabel: 'Try it now →',
    ctaTarget: { kind: 'tab', tabId: 'profile' },
    bannerCopy: "Fill in your slug, photo, headline, and at least one industry — then Save.",
  },
  {
    id: 'firstCall',
    title: 'Record your first call with the bot',
    description: 'Quick Bot adds the recorder to any meeting URL — analysis runs automatically.',
    ctaLabel: 'Try it now →',
    ctaTarget: { kind: 'modal', modalId: 'quickBot' },
    bannerCopy: "Paste any meeting URL → the bot auto-records + analyzes when the call starts.",
  },
  {
    id: 'highlightClip',
    title: 'Create a highlight clip',
    description: 'Pull the best 30 seconds out of any call — ready to share or submit for cash.',
    ctaLabel: 'Try it now →',
    ctaTarget: { kind: 'tab', tabId: 'calls' },
    bannerCopy: "Open any call → drag to select a moment on the timeline → \"Save as highlight.\"",
  },
  {
    id: 'coachingCall',
    title: 'Join a coaching call (or watch a replay)',
    description: 'Drop in on a live coaching session, or pull up a past one.',
    ctaLabel: 'Try it now →',
    ctaTarget: { kind: 'subview', tabId: 'community', subview: 'coaching' },
    bannerCopy: "Join any upcoming coaching call, or watch a replay of a past one.",
  },
  {
    id: 'stream',
    title: 'Try Sequ3nce Stream',
    description: 'Hold-to-talk dictation. Use it once and the muscle memory builds.',
    ctaLabel: 'Try it now →',
    ctaTarget: { kind: 'modal', modalId: 'stream' },
    bannerCopy: "Hold your hotkey to dictate. Your first transcription marks this complete.",
  },
];

export function getSetupTask(id: SetupTaskId): SetupTaskConfig {
  const task = SETUP_TASKS.find((t) => t.id === id);
  if (!task) throw new Error(`Unknown setup task: ${id}`);
  return task;
}
```

- [ ] **Step 4: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -10 ; echo "---DONE---"`
Expected: No project errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/personal/src/renderer/views/adoption-checklist/types.ts apps/personal/src/renderer/views/adoption-checklist/tasks.ts
git commit -m "Adoption checklist: types + setup task config map"
```

---

## Task 7: useAdoptionChecklist hook

**Files:**
- Create: `apps/personal/src/renderer/views/adoption-checklist/useAdoptionChecklist.ts`

- [ ] **Step 1: Create the hook**

Create `apps/personal/src/renderer/views/adoption-checklist/useAdoptionChecklist.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAdoptionChecklistData,
  ensureAdoptionChecklistRow,
  markSetupAutoOpened,
  dismissAdoptionSetup,
  markEarnSeen,
  type AdoptionChecklistData,
} from '../../convex';

const POLL_INTERVAL_MS = 30_000; // 30s — checklist state changes slowly

interface UseAdoptionChecklistResult {
  data: AdoptionChecklistData | null;
  loading: boolean;
  refresh: () => Promise<void>;
  ensureRow: () => Promise<void>;
  markAutoOpened: () => Promise<void>;
  dismissSetup: () => Promise<void>;
  markEarnSeen: () => Promise<void>;
}

// Polls the adoption-checklist backend on a 30s interval (and on demand). Only
// active when a userId is provided — gracefully no-ops for unauthenticated
// renders.
export function useAdoptionChecklist(userId: string | undefined): UseAdoptionChecklistResult {
  const [data, setData] = useState<AdoptionChecklistData | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await getAdoptionChecklistData(userId);
      if (!mountedRef.current) return;
      if ('error' in res) {
        // Network-degraded; keep prior data, stop spinning.
        return;
      }
      setData(res);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!userId) return () => {
      mountedRef.current = false;
    };
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [userId, refresh]);

  const ensureRow = useCallback(async () => {
    if (!userId) return;
    await ensureAdoptionChecklistRow(userId);
    await refresh();
  }, [userId, refresh]);

  const markAutoOpenedCb = useCallback(async () => {
    if (!userId) return;
    await markSetupAutoOpened(userId);
    await refresh();
  }, [userId, refresh]);

  const dismissSetupCb = useCallback(async () => {
    if (!userId) return;
    await dismissAdoptionSetup(userId);
    await refresh();
  }, [userId, refresh]);

  const markEarnSeenCb = useCallback(async () => {
    if (!userId) return;
    await markEarnSeen(userId);
    await refresh();
  }, [userId, refresh]);

  return {
    data,
    loading,
    refresh,
    ensureRow,
    markAutoOpened: markAutoOpenedCb,
    dismissSetup: dismissSetupCb,
    markEarnSeen: markEarnSeenCb,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -10 ; echo "---DONE---"`
Expected: No project errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/personal/src/renderer/views/adoption-checklist/useAdoptionChecklist.ts
git commit -m "Adoption checklist: useAdoptionChecklist hook"
```

---

## Task 8: TaskRow component

**Files:**
- Create: `apps/personal/src/renderer/views/adoption-checklist/TaskRow.tsx`

- [ ] **Step 1: Create TaskRow**

Create `apps/personal/src/renderer/views/adoption-checklist/TaskRow.tsx`:

```tsx
import React from 'react';

interface TaskRowProps {
  /** Whether the task is complete — drives the checkmark icon + dimmed style. */
  complete: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** When provided, renders a CTA button on the right. Hidden when complete. */
  cta?: { label: string; onClick: () => void };
}

// Single row used by both Setup and Earn sections. Visually simple: a
// checkbox/checkmark on the left, title + optional description in the middle,
// and an optional right-aligned CTA. Completed rows dim and lose the CTA.
export function TaskRow({ complete, title, description, cta }: TaskRowProps) {
  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg ${
        complete ? 'opacity-50' : 'hover:bg-gray-50'
      } transition-colors`}
    >
      <div className="shrink-0 mt-0.5">
        {complete ? (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </span>
        ) : (
          <span className="inline-block w-4 h-4 rounded-full border-2 border-gray-300" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-semibold text-gray-900 ${complete ? 'line-through' : ''}`}>
          {title}
        </div>
        {description && (
          <div className="text-[11px] text-gray-500 leading-snug mt-0.5">
            {description}
          </div>
        )}
      </div>
      {cta && !complete && (
        <button
          onClick={cta.onClick}
          className="shrink-0 px-2 py-1 text-[11px] font-semibold text-black bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -10 ; echo "---DONE---"`
Expected: No project errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/personal/src/renderer/views/adoption-checklist/TaskRow.tsx
git commit -m "Adoption checklist: TaskRow component"
```

---

## Task 9: SetupSection component

**Files:**
- Create: `apps/personal/src/renderer/views/adoption-checklist/SetupSection.tsx`

- [ ] **Step 1: Create SetupSection**

Create `apps/personal/src/renderer/views/adoption-checklist/SetupSection.tsx`:

```tsx
import React from 'react';
import { TaskRow } from './TaskRow';
import { SETUP_TASKS } from './tasks';
import type { AdoptionChecklistData } from '../../convex';
import type { CtaTarget } from './types';

interface SetupSectionProps {
  setup: AdoptionChecklistData['setup'];
  /** Lifecycle phase — drives prominent vs collapsed rendering. Hidden state
   *  is handled by the parent (popover) by not mounting this component. */
  phase: 'prominent' | 'collapsed';
  /** Invoked when the user clicks a task's CTA. Parent routes the deep-link. */
  onCta: (target: CtaTarget) => void;
  /** Invoked when the user clicks × Skip on the section header. */
  onDismiss: () => void;
}

export function SetupSection({ setup, phase, onCta, onDismiss }: SetupSectionProps) {
  const completed = SETUP_TASKS.filter((t) => setup[t.id]).length;
  const total = SETUP_TASKS.length;
  const percent = Math.round((completed / total) * 100);

  if (phase === 'collapsed') {
    // Compact one-line summary. User can click to expand by re-opening
    // popover after Setup section is dismissed; expansion not implemented
    // for v1 — collapsed phase is purely informational.
    return (
      <div className="px-3 py-2 text-[12px] text-gray-500 border-b border-gray-100">
        Setup {completed}/{total} — keep going
      </div>
    );
  }

  return (
    <div className="border-b border-gray-100 pb-2">
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Get set up
          </div>
          <div className="text-[12px] font-medium text-gray-900 mt-0.5">
            {completed} of {total} complete
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          title="Hide setup checklist"
        >
          × Skip
        </button>
      </div>
      <div className="mx-3 mb-2 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="px-1">
        {SETUP_TASKS.map((task) => (
          <TaskRow
            key={task.id}
            complete={setup[task.id]}
            title={task.title}
            description={task.description}
            cta={{
              label: task.ctaLabel,
              onClick: () => onCta(task.ctaTarget),
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -10 ; echo "---DONE---"`
Expected: No project errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/personal/src/renderer/views/adoption-checklist/SetupSection.tsx
git commit -m "Adoption checklist: SetupSection component"
```

---

## Task 10: EarnSection component

**Files:**
- Create: `apps/personal/src/renderer/views/adoption-checklist/EarnSection.tsx`

- [ ] **Step 1: Create EarnSection**

Create `apps/personal/src/renderer/views/adoption-checklist/EarnSection.tsx`:

```tsx
import React from 'react';
import { TaskRow } from './TaskRow';
import type { AdoptionChecklistData } from '../../convex';
import type { CtaTarget } from './types';

interface EarnSectionProps {
  earn: AdoptionChecklistData['earn'];
  onCta: (target: CtaTarget) => void;
}

// Earn rows are dynamic — the title and description reflect live backend
// state (current Money Bells rank, lifetime Creator Cash earnings,
// testimonial review status). Rows never display a "complete" checkmark
// because the opportunities recur monthly / continuously.
export function EarnSection({ earn, onCta }: EarnSectionProps) {
  const moneyBellsCta = { kind: 'subview' as const, tabId: 'community', subview: 'moneyBells' };
  const creatorCashCta = { kind: 'tab' as const, tabId: 'rewards' };
  const testimonialCta = { kind: 'tab' as const, tabId: 'rewards' };

  // ----- Money Bells row -----
  const mb = earn.moneyBells;
  const moneyBellsTitle = mb.optedIn
    ? mb.currentRank !== null
      ? `Money Bells · ${mb.monthLabel} · #${mb.currentRank} of ${mb.totalParticipants}`
      : `Money Bells · ${mb.monthLabel} · Not on the leaderboard yet`
    : 'Money Bells';
  const moneyBellsDescription = mb.optedIn
    ? `${mb.daysRemaining}d left this month — broadcast another deal to climb`
    : 'Opt in and broadcast closed deals to compete for monthly cash prizes';
  const moneyBellsCtaLabel = mb.optedIn ? 'Broadcast →' : 'Opt in →';

  // ----- Creator Cash row -----
  const cc = earn.creatorCash;
  const creatorCashTitle =
    cc.approvedCount > 0
      ? `Creator Cash · $${cc.totalEarned} from ${cc.approvedCount} approved clip${cc.approvedCount === 1 ? '' : 's'}`
      : 'Creator Cash';
  const creatorCashDescription =
    cc.approvedCount > 0
      ? 'Submit another clip — earn $20–30 per approved'
      : 'Submit a highlight clip — earn $20–30 per approved';

  // ----- Testimonial row -----
  const t = earn.testimonial;
  let testimonialTitle: string;
  let testimonialDescription: string;
  if (!t) {
    testimonialTitle = 'Testimonial';
    testimonialDescription = 'Submit a testimonial video for review';
  } else if (t.status === 'pending') {
    const days = Math.max(1, Math.floor((Date.now() - t.submittedAt) / 86_400_000));
    testimonialTitle = 'Testimonial · Pending review';
    testimonialDescription = `Submitted ${days}d ago — we'll let you know`;
  } else if (t.status === 'paid') {
    testimonialTitle = `Testimonial · Earned $${t.paidAmount ?? 0}`;
    testimonialDescription = 'Submit another testimonial';
  } else if (t.status === 'approved') {
    testimonialTitle = 'Testimonial · Approved (payment pending)';
    testimonialDescription = 'Hang tight — payment processing';
  } else {
    // rejected
    testimonialTitle = 'Testimonial · Rejected';
    testimonialDescription = 'Submit a new testimonial video';
  }

  return (
    <div>
      <div className="px-3 pt-3 pb-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Earn through Sequ3nce
        </div>
      </div>
      <div className="px-1 pb-2">
        <TaskRow
          complete={false}
          title={moneyBellsTitle}
          description={moneyBellsDescription}
          cta={{ label: moneyBellsCtaLabel, onClick: () => onCta(moneyBellsCta) }}
        />
        <TaskRow
          complete={false}
          title={creatorCashTitle}
          description={creatorCashDescription}
          cta={{ label: 'Submit →', onClick: () => onCta(creatorCashCta) }}
        />
        <TaskRow
          complete={false}
          title={testimonialTitle}
          description={testimonialDescription}
          cta={
            !t || t.status === 'paid' || t.status === 'rejected'
              ? { label: 'Submit →', onClick: () => onCta(testimonialCta) }
              : undefined
          }
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -10 ; echo "---DONE---"`
Expected: No project errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/personal/src/renderer/views/adoption-checklist/EarnSection.tsx
git commit -m "Adoption checklist: EarnSection component with dynamic state"
```

---

## Task 11: AdoptionChecklistPopover component

**Files:**
- Create: `apps/personal/src/renderer/views/adoption-checklist/AdoptionChecklistPopover.tsx`

- [ ] **Step 1: Create the popover**

Create `apps/personal/src/renderer/views/adoption-checklist/AdoptionChecklistPopover.tsx`:

```tsx
import React, { useEffect } from 'react';
import { SetupSection } from './SetupSection';
import { EarnSection } from './EarnSection';
import { SETUP_TASKS } from './tasks';
import type { AdoptionChecklistData } from '../../convex';
import type { CtaTarget } from './types';

interface AdoptionChecklistPopoverProps {
  data: AdoptionChecklistData;
  onClose: () => void;
  onCta: (target: CtaTarget) => void;
  onDismissSetup: () => void;
}

const SETUP_PROMINENT_DAYS = 14;
const SETUP_HIDDEN_DAY = 30;

// Computes which lifecycle phase Setup is in based on the spec's Approach C
// rules: prominent for 14 days from firstSeenAt, collapsed days 15–30,
// hidden day 31+. Also hidden when 100% complete OR explicitly dismissed.
function setupPhase(state: AdoptionChecklistData['state'], setupComplete: boolean):
  | 'prominent' | 'collapsed' | 'hidden' {
  if (setupComplete) return 'hidden';
  if (!state) return 'prominent';
  if (state.setupDismissedAt) return 'hidden';
  const ageDays = (Date.now() - state.firstSeenAt) / 86_400_000;
  if (ageDays >= SETUP_HIDDEN_DAY) return 'hidden';
  if (ageDays >= SETUP_PROMINENT_DAYS) return 'collapsed';
  return 'prominent';
}

export function AdoptionChecklistPopover({
  data,
  onClose,
  onCta,
  onDismissSetup,
}: AdoptionChecklistPopoverProps) {
  // Esc closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setupCompletedCount = SETUP_TASKS.filter((t) => data.setup[t.id]).length;
  const setupAllDone = setupCompletedCount === SETUP_TASKS.length;
  const phase = setupPhase(data.state, setupAllDone);

  return (
    <>
      {/* Click-outside backdrop. Transparent — popover sits on top. */}
      <div className="fixed inset-0 z-[150]" onClick={onClose} />
      <div
        className="fixed top-14 right-5 z-[160] w-[380px] max-h-[80vh] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {phase !== 'hidden' && (
          <SetupSection
            setup={data.setup}
            phase={phase === 'prominent' ? 'prominent' : 'collapsed'}
            onCta={onCta}
            onDismiss={onDismissSetup}
          />
        )}
        <EarnSection earn={data.earn} onCta={onCta} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -10 ; echo "---DONE---"`
Expected: No project errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/personal/src/renderer/views/adoption-checklist/AdoptionChecklistPopover.tsx
git commit -m "Adoption checklist: popover wrapper with lifecycle phase logic"
```

---

## Task 12: AdoptionChecklistButton (titlebar)

**Files:**
- Create: `apps/personal/src/renderer/views/adoption-checklist/AdoptionChecklistButton.tsx`

- [ ] **Step 1: Create the button**

Create `apps/personal/src/renderer/views/adoption-checklist/AdoptionChecklistButton.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useAdoptionChecklist } from './useAdoptionChecklist';
import { AdoptionChecklistPopover } from './AdoptionChecklistPopover';
import { SETUP_TASKS } from './tasks';
import type { CtaTarget } from './types';

interface AdoptionChecklistButtonProps {
  userId: string | undefined;
  /** Called when the user clicks a task's CTA. The parent (MeetingBotHub)
   *  routes to the right tab/modal and closes the popover. */
  onCta: (target: CtaTarget) => void;
}

const PULSE_DAYS = 7;

// Titlebar button + popover anchor. Phase-driven label:
//   - "Get started" with N/5 progress count while Setup is active
//   - "Earn" when Setup is hidden (complete or day 31+)
// Pulse for 7 days after firstSeenAt. Red dot when there's a new monetary
// opportunity since the user last opened the panel.
export function AdoptionChecklistButton({ userId, onCta }: AdoptionChecklistButtonProps) {
  const checklist = useAdoptionChecklist(userId);
  const [open, setOpen] = useState(false);
  const [autoOpenChecked, setAutoOpenChecked] = useState(false);

  // Ensure the row exists once we have data (or lack thereof).
  useEffect(() => {
    if (!userId) return;
    if (checklist.data?.state) return;
    void checklist.ensureRow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, checklist.data?.state]);

  // Auto-open once on first encounter (only after data loads + row exists).
  useEffect(() => {
    if (autoOpenChecked) return;
    if (!checklist.data) return;
    const state = checklist.data.state;
    if (!state) return; // row not yet created — wait for ensureRow
    setAutoOpenChecked(true);
    if (state.setupAutoOpenedAt) return; // already auto-opened in a past session
    if (state.setupCompletedAt) return; // already finished — no need to interrupt

    setOpen(true);
    void checklist.markAutoOpened();
  }, [checklist, autoOpenChecked]);

  if (!userId || !checklist.data) {
    // Render placeholder so titlebar layout doesn't shift between auth states.
    return null;
  }

  const data = checklist.data;
  const setupCompleted = SETUP_TASKS.filter((t) => data.setup[t.id]).length;
  const setupTotal = SETUP_TASKS.length;
  const setupAllDone = setupCompleted === setupTotal;
  const ageDays = data.state ? (Date.now() - data.state.firstSeenAt) / 86_400_000 : 0;
  const setupHidden =
    setupAllDone ||
    !!data.state?.setupDismissedAt ||
    ageDays >= 30;

  // Label.
  const label = setupHidden ? 'Earn' : 'Get started';
  const showCount = !setupHidden;
  const countText = `${setupCompleted}/${setupTotal}`;

  // Pulse — first 7 days only.
  const showPulse = !!data.state && ageDays < PULSE_DAYS && !open;

  // Red dot — for now: any non-paid recent activity in the Earn surface,
  // computed against earnRedDotLastSeenAt. For v1 we surface the dot when
  // there's never been an open AND there's anything to look at (Money Bells
  // contest exists, or a paid clip exists, etc.). Refine later.
  const earnHasNews =
    !data.state?.earnRedDotLastSeenAt ||
    (data.earn.testimonial?.status === 'approved' || data.earn.testimonial?.status === 'paid') ||
    data.earn.creatorCash.totalEarned > 0;
  const showRedDot = setupHidden && earnHasNews && !open;

  function handleToggle() {
    if (!open) {
      // Opening — clear the earn red dot.
      void checklist.markEarnSeen();
    }
    setOpen((v) => !v);
  }

  function handleCta(target: CtaTarget) {
    setOpen(false);
    onCta(target);
  }

  return (
    <>
      <button
        onClick={handleToggle}
        className={`no-drag relative flex items-center gap-2 px-3 py-2 text-[13px] font-semibold rounded-lg border transition-colors ${
          showPulse
            ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100 animate-pulse'
            : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'
        }`}
        title={setupHidden ? 'Earn through Sequ3nce' : 'Get started checklist'}
      >
        <span className="text-[14px] leading-none">{setupHidden ? '$' : '🚀'}</span>
        <span>{label}</span>
        {showCount && (
          <span className="text-[11px] font-mono text-gray-500">{countText}</span>
        )}
        {showRedDot && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />
        )}
      </button>
      {open && (
        <AdoptionChecklistPopover
          data={data}
          onClose={() => setOpen(false)}
          onCta={handleCta}
          onDismissSetup={() => {
            void checklist.dismissSetup();
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -10 ; echo "---DONE---"`
Expected: No project errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/personal/src/renderer/views/adoption-checklist/AdoptionChecklistButton.tsx
git commit -m "Adoption checklist: titlebar button with phase + pulse + red-dot"
```

---

## Task 13: Mount the button + wire deep-link routing in MeetingBotHub

**Files:**
- Modify: `apps/personal/src/renderer/views/MeetingBotHub.tsx`

- [ ] **Step 1: Add imports**

Open `apps/personal/src/renderer/views/MeetingBotHub.tsx`. Add this import near the top:

```ts
import { AdoptionChecklistButton } from './adoption-checklist/AdoptionChecklistButton';
import type { CtaTarget } from './adoption-checklist/types';
```

- [ ] **Step 2: Add a CTA-routing handler**

Find an existing function declaration inside the component (e.g., `handleEndCall`) and add this handler nearby:

```tsx
  // Routes the deep-link target from an adoption-checklist task CTA.
  // Tabs: switch active sidebar tab. Modals: open the relevant modal.
  // Subviews: switch tab AND set a hash param the destination tab reads.
  function handleAdoptionCta(target: CtaTarget) {
    if (target.kind === 'tab') {
      setActiveTab(target.tabId);
      window.location.hash = `#tab=${target.tabId}&setup=${tabIdToTaskId(target.tabId)}`;
    } else if (target.kind === 'subview') {
      setActiveTab(target.tabId);
      window.location.hash = `#tab=${target.tabId}&subview=${target.subview}&setup=${target.subview}`;
    } else if (target.kind === 'modal') {
      if (target.modalId === 'quickBot') {
        window.location.hash = '#setup=firstCall';
        setShowQuickBot(true);
      } else if (target.modalId === 'stream') {
        window.location.hash = '#setup=stream';
        setShowStream(true);
      }
    }
  }

  // Maps a tabId to its corresponding setup task id, so the destination view
  // can read `?setup=<taskId>` and render the correct banner.
  function tabIdToTaskId(tabId: string): string {
    if (tabId === 'profile') return 'profile';
    if (tabId === 'calls') return 'highlightClip';
    return tabId;
  }
```

(If the actual state setters in your file are named differently — `setActiveTab`, `setShowQuickBot`, `setShowStream` — substitute the real names. Search for the existing setter definitions to confirm.)

- [ ] **Step 3: Mount the button in the titlebar**

Find the titlebar block (search for `className="titlebar h-14`). Insert the `<AdoptionChecklistButton>` BEFORE the Messages button so it's leftmost in the right-justified group:

```tsx
        <div className="titlebar h-14 border-b border-gray-100 flex items-center justify-end px-5 gap-2">
          {/* Adoption Checklist button — phase-driven Get Started / Earn */}
          <AdoptionChecklistButton
            userId={closerInfo.b2cUserId}
            onCta={handleAdoptionCta}
          />
          {/* Messages button */}
          <button
            onClick={() => setShowMessages(!showMessages)}
            ...
```

- [ ] **Step 4: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -10 ; echo "---DONE---"`
Expected: No project errors.

- [ ] **Step 5: Smoke test**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npm start 2>&1 | tail -5 &
```
Wait ~30s for the app to launch. Sign in. Look at the titlebar. The new button should appear leftmost in the titlebar right-zone. Click it — popover should open showing both sections. Close the app when verified.

- [ ] **Step 6: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/personal/src/renderer/views/MeetingBotHub.tsx
git commit -m "Adoption checklist: mount button in MeetingBotHub titlebar + CTA routing"
```

---

## Task 14: TaskHintBanner component

**Files:**
- Create: `apps/personal/src/renderer/views/adoption-checklist/TaskHintBanner.tsx`

- [ ] **Step 1: Create TaskHintBanner**

Create `apps/personal/src/renderer/views/adoption-checklist/TaskHintBanner.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { getSetupTask } from './tasks';
import type { SetupTaskId } from './types';

interface TaskHintBannerProps {
  /** The task this banner represents. Banner only renders if the URL hash
   *  contains `setup=<taskId>` matching this prop. */
  taskId: SetupTaskId;
}

// Reads the URL hash for `setup=<taskId>`. If present and matches this
// component's taskId, renders a soft amber banner with the task's banner
// copy. User can dismiss with × Skip; banner clears the hash param so it
// doesn't reappear on hot reload.
export function TaskHintBanner({ taskId }: TaskHintBannerProps) {
  const [visible, setVisible] = useState(() => hashHasSetup(taskId));

  // React to hash changes (e.g., user clicks a Try-it-now CTA from the
  // popover while already on this tab).
  useEffect(() => {
    function onHashChange() {
      setVisible(hashHasSetup(taskId));
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [taskId]);

  if (!visible) return null;

  const task = getSetupTask(taskId);

  function dismiss() {
    setVisible(false);
    // Strip the setup= param from the hash so it doesn't re-trigger.
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    params.delete('setup');
    const next = params.toString();
    window.location.hash = next ? `#${next}` : '';
  }

  return (
    <div className="px-4 py-2.5 bg-amber-50/80 border-b border-amber-200/70 flex items-center gap-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 shrink-0">
        Setup
      </div>
      <div className="flex-1 text-[12.5px] text-amber-900 leading-snug">
        {task.bannerCopy}
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 text-[11px] text-amber-700 hover:text-amber-900 transition-colors"
        title="Skip this hint"
      >
        × Skip
      </button>
    </div>
  );
}

function hashHasSetup(taskId: string): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return params.get('setup') === taskId;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -10 ; echo "---DONE---"`
Expected: No project errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/personal/src/renderer/views/adoption-checklist/TaskHintBanner.tsx
git commit -m "Adoption checklist: TaskHintBanner component"
```

---

## Task 15: Wire banners into destination views

**Files:**
- Modify: `apps/personal/src/renderer/views/ProfileView.tsx`
- Modify: `apps/personal/src/renderer/views/CallHistoryView.tsx`
- Modify: `apps/personal/src/renderer/views/community/coaching/CoachingView.tsx`
- Modify: `apps/personal/src/renderer/views/QuickBotModal.tsx`
- Modify: `apps/personal/src/renderer/views/stream/StreamModal.tsx`

For each file, the change is the same shape: import the banner, render it as the first child of the view's outermost container. Below are the specific edits per file.

- [ ] **Step 1: ProfileView**

Open `apps/personal/src/renderer/views/ProfileView.tsx`. Add this import:

```ts
import { TaskHintBanner } from './adoption-checklist/TaskHintBanner';
```

Find the top-level returned element (search for the first `return (`). Insert `<TaskHintBanner taskId="profile" />` as the FIRST child inside the outer wrapper, before any header/content.

Example pattern:
```tsx
return (
  <div className="flex flex-col h-full">
    <TaskHintBanner taskId="profile" />
    {/* existing content */}
    ...
  </div>
);
```

If the existing return has its content directly without an outer wrapper, wrap it: replace `return (<div>...) ;` with `return (<><TaskHintBanner taskId="profile" /><div>...</div></>);`.

- [ ] **Step 2: CallHistoryView**

Open `apps/personal/src/renderer/views/CallHistoryView.tsx`. Add import:

```ts
import { TaskHintBanner } from './adoption-checklist/TaskHintBanner';
```

Insert `<TaskHintBanner taskId="highlightClip" />` as the first child of the outer return.

- [ ] **Step 3: CoachingView**

Open `apps/personal/src/renderer/views/community/coaching/CoachingView.tsx`. Add import:

```ts
import { TaskHintBanner } from '../../adoption-checklist/TaskHintBanner';
```

Insert `<TaskHintBanner taskId="coachingCall" />` as the first child of the outer return.

- [ ] **Step 4: QuickBotModal**

Open `apps/personal/src/renderer/views/QuickBotModal.tsx`. Add import:

```ts
import { TaskHintBanner } from './adoption-checklist/TaskHintBanner';
```

Insert `<TaskHintBanner taskId="firstCall" />` inside the modal body, immediately under the modal header (so it's visible without scrolling).

- [ ] **Step 5: StreamModal**

Open `apps/personal/src/renderer/views/stream/StreamModal.tsx`. Add import:

```ts
import { TaskHintBanner } from '../adoption-checklist/TaskHintBanner';
```

Insert `<TaskHintBanner taskId="stream" />` inside the modal body, immediately under the modal header.

- [ ] **Step 6: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -20 ; echo "---DONE---"`
Expected: No project errors.

- [ ] **Step 7: Smoke test**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npm start 2>&1 | tail -5 &
```
Wait ~30s. Open the app. Click the new titlebar button to open the popover. Click each task's "Try it now →" CTA in turn. Verify:
- Profile CTA → switches to Profile tab AND amber banner appears at top with profile copy
- First Call CTA → opens Quick Bot modal AND banner appears in modal body
- Highlight Clip CTA → switches to Calls tab AND banner appears
- Coaching CTA → switches to Community → Coaching AND banner appears
- Stream CTA → opens Stream modal AND banner appears

Click × Skip on a banner — banner disappears and stays gone within that session.

Close the app when verified.

- [ ] **Step 8: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/personal/src/renderer/views/ProfileView.tsx \
        apps/personal/src/renderer/views/CallHistoryView.tsx \
        apps/personal/src/renderer/views/community/coaching/CoachingView.tsx \
        apps/personal/src/renderer/views/QuickBotModal.tsx \
        apps/personal/src/renderer/views/stream/StreamModal.tsx
git commit -m "Adoption checklist: wire TaskHintBanner into 5 destination views"
```

---

## Task 16: Replay-watched instrumentation in ReplayPlayerModal

**Files:**
- Modify: `apps/personal/src/renderer/views/community/coaching/ReplayPlayerModal.tsx`

- [ ] **Step 1: Add imports**

Open `apps/personal/src/renderer/views/community/coaching/ReplayPlayerModal.tsx`. Add:

```ts
import { recordReplayProgress } from '../../../convex';
```

- [ ] **Step 2: Find the video element + the user's b2cUserId source**

Search for `<video` (or `<DailyVideo`, `<ReactPlayer`, etc.) in the file to find the playback element. Note its ref or `onTimeUpdate`/`onProgress` event hook.

Search for the prop or context that gives the modal access to `b2cUserId` and `callId`. Likely passed in from the parent (e.g., `closerInfo` and the `call._id`).

- [ ] **Step 3: Add a throttled progress reporter**

Inside the modal component, add this effect. Replace `videoRef`, `userId`, and `callId` with the actual prop/ref names in the file:

```tsx
  // Reports replay progress every 10s while the user is watching. Used by
  // the adoption-checklist "watch a coaching replay" task — task is
  // satisfied when watchedSeconds >= 30.
  useEffect(() => {
    if (!userId || !callId) return;
    const interval = setInterval(() => {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused || v.ended) return;
      const seconds = Math.floor(v.currentTime);
      if (seconds <= 0) return;
      void recordReplayProgress(userId, callId, seconds);
    }, 10_000);
    return () => clearInterval(interval);
  }, [userId, callId]);
```

If the modal uses a non-`<video>` player (e.g., a Daily replay or Mux player), adapt the `videoRef.current.currentTime` access to whatever the player exposes. The intent: every 10s of active playback, send the `seconds` value.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -10 ; echo "---DONE---"`
Expected: No project errors.

- [ ] **Step 5: Smoke test**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npm start 2>&1 | tail -5 &
```
Wait ~30s. Sign in. Navigate to Community → Coaching → Past calls. Open a replay. Let it play for ~40 seconds. Open DevTools Network tab — you should see two `POST /b2c/coaching-calls/replay-progress` calls (at ~10s and ~20s of playback, roughly).

Verify the coaching task in the popover flips to ✓ on next refresh (within 30s — the polling interval).

- [ ] **Step 6: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/personal/src/renderer/views/community/coaching/ReplayPlayerModal.tsx
git commit -m "Adoption checklist: instrument ReplayPlayerModal to report watch progress"
```

---

## Task 17: Final verification + smoke test of full flow

- [ ] **Step 1: Full typecheck**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -20 ; echo "---DONE---"
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -20 ; echo "---DONE---"
```
Expected: zero project errors in both.

- [ ] **Step 2: Convex deploy (if not already)**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx convex deploy --yes 2>&1 | tail -3
```
Expected: `✔ Deployed Convex functions to https://ideal-ram-982.convex.cloud`

- [ ] **Step 3: Full smoke test**

Start the app:
```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npm start 2>&1 | tail -5 &
```

Verify each of the following in order:

1. **Auto-open on first launch.** Sign in for the first time post-feature ship. Within ~2 seconds of the dashboard rendering, the popover auto-opens. Setup section visible at top with whatever count of already-completed tasks (likely 0/5 for a fresh user, 4/5 or 5/5 for an existing user). Earn section visible below.

2. **Pulse animation.** Close the popover. Look at the titlebar button. It should have a subtle amber-tinted pulse for the first 7 days from `firstSeenAt`.

3. **Setup task CTA.** Open popover. Click "Try it now →" on the Profile task. The popover closes, the active tab switches to Profile, and an amber banner appears at the top with copy *"Fill in your slug, photo, headline, and at least one industry — then Save."*

4. **Banner skip.** Click × Skip on the banner. Banner disappears.

5. **Setup task auto-completion.** Complete the Profile fields and Save. Within 30s (poll interval), re-open the popover. The Profile task row should show a green ✓ and be dimmed/struck-through. The progress count and bar should reflect the change.

6. **Section dismiss.** Click × Skip on the Setup section header. Setup section disappears from the popover. The titlebar button label changes from "Get started" to "Earn".

7. **Earn section dynamic state.** Verify the Money Bells row shows your actual current rank for the month (or "Opt in →" if not opted in). Verify Creator Cash shows your actual lifetime earnings. Verify Testimonial reflects your actual most-recent submission state.

8. **Red dot.** This is harder to manually trigger; verify by checking the conditional logic with DevTools — the red dot should appear on the button when `setupHidden && earnHasNews && !open`.

9. **Modal CTAs.** Open popover, click Quick Bot CTA — Quick Bot modal opens with banner. Click Stream CTA — Stream modal opens with banner.

10. **No console errors.** DevTools → Console should be free of errors related to the new code paths.

- [ ] **Step 4: Final commit (if any cleanup)**

If any small fixes came out of the smoke test, commit them now with message: `Adoption checklist: smoke-test fixes`.

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git status --short
# Stage any fixup files by name, then:
# git commit -m "Adoption checklist: smoke-test fixes"
```

- [ ] **Step 5: Summary**

Report to Tyler:
- All 17 tasks complete
- Both typechecks pass
- Convex deployed
- All smoke-test items verified
- Ready for cohort testing or release

---

## Out of scope (reminder)

These were intentionally excluded — do not add them as part of this plan:

- Tutorial videos (any format)
- Affiliate task in Earn section
- Call of the Week task
- Multi-step interactive tours / spotlight overlays / pulse arrows on specific buttons
- Re-engagement emails
- Mobile responsiveness for the popover
- Per-task analytics on banner skip rates

---

## Notes for the executor

- **Frequent commits.** Each task commits at the end. Don't squash; keep history granular for review.
- **Existing patterns first.** When in doubt about Convex routing, CORS, or fetch patterns, copy the shape of the closest existing route in `apps/web/convex/http.ts`.
- **Verify schema indexes before referencing.** Task 2 explicitly checks. If a referenced index doesn't exist, add it to `schema.ts` in the same task — don't invent index names.
- **Don't refactor unrelated code.** This plan touches a lot of files. Resist the urge to clean up nearby code. If you spot something worth fixing, write it down for a follow-up.
- **Type names are stable across tasks.** `AdoptionChecklistData`, `SetupTaskId`, `CtaTarget`, `SetupTaskConfig` are referenced in multiple tasks — don't rename.
- **Manual smoke checks are part of the gate.** The codebase has no test runner for these surfaces; the smoke checks in Tasks 13, 15, 16, 17 are non-skippable.
