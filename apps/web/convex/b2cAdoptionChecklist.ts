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

    // Fetch the b2cUser doc once — used both for profile slug and the
    // closer lookup for first-call detection.
    const userDoc = await ctx.db.get(args.userId);
    const u = userDoc as Doc<"b2cUsers"> | null;

    // Profile: requires profileSlug (on b2cUsers), and photoStorageId +
    // headline + at least one industry (on b2cProfiles).
    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const profileComplete =
      !!u?.profileSlug &&
      !!profile?.photoStorageId &&
      !!profile?.headline &&
      (profile?.industries?.length ?? 0) >= 1;

    // First call: any calls row exists for the user's closer.
    let firstCallComplete = false;
    if (u) {
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

    // Stream: any dictation entry. The B2C app records these in
    // streamTranscriptions (the field is b2cUserId, not userId; no b2c prefix
    // on the table name itself).
    const anyStreamEntry = await ctx.db
      .query("streamTranscriptions")
      .withIndex("by_user_and_date", (q) => q.eq("b2cUserId", args.userId))
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
      .withIndex("by_month_cash", (q) =>
        q.eq("month", monthKey).eq("isDeleted", false),
      )
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
    // Use by_user index + filter by type (no by_user_type index in schema).
    const allUserSubs = await ctx.db
      .query("b2cContentSubmissions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const clipSubs = allUserSubs.filter((s) => s.type === "clip");
    const paidClips = clipSubs.filter((s) => s.status === "paid");
    const creatorCash = {
      totalEarned: paidClips.reduce((sum, s) => sum + (s.paidAmount ?? 0), 0),
      approvedCount: clipSubs.filter((s) => s.status === "approved" || s.status === "paid").length,
    };

    // Testimonial: most recent testimonial submission.
    const testimonialSubs = allUserSubs
      .filter((s) => s.type === "testimonial")
      .sort((a, b) => b._creationTime - a._creationTime);
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
