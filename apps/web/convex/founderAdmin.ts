/**
 * Founder-only admin queries for the read-only /admin dashboard.
 *
 * Filename note: convex/admin.ts already exists for ammo config team-admin
 * operations (different concept — that file is for the "team admin" role
 * within a customer's account). This file is for SEQU3NCE founders/staff.
 *
 * Every query MUST call assertFounder(ctx, args.clerkId) FIRST. This is the
 * actual security boundary — the Next.js page-level gate at /admin/layout.tsx
 * is for UX (redirect to /dashboard), not security. Defense in depth.
 *
 * Plan: .claude/plans/admin-dashboard-readonly.md
 */

import { v, ConvexError } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Allowlist of Sequ3nce founders. Kept in sync with FOUNDER_EMAILS in
 * apps/web/src/lib/founders.ts — if you change one, change the other in
 * the same PR. Convex bundles separately from the Next.js app so this
 * file can't import from src/.
 */
const FOUNDER_EMAILS: ReadonlySet<string> = new Set([
  "tadigitalsmm@gmail.com",
]);

/**
 * Throws ConvexError("Forbidden") if the requesting user's email isn't in
 * the founder allowlist. Called FIRST by every admin query — defense in
 * depth even if the Next.js page gate is bypassed.
 */
async function assertFounder(
  ctx: QueryCtx,
  clerkId: string,
): Promise<Doc<"users">> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first();
  if (!user || !FOUNDER_EMAILS.has(user.email.toLowerCase().trim())) {
    throw new ConvexError("Forbidden");
  }
  return user;
}

// ============================================================================
// Team list — /admin
// ============================================================================

export const listAllTeams = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    await assertFounder(ctx, args.clerkId);

    // Pull every team. List is small (dozens at most for the foreseeable
    // future); a search/filter UI is a v1.1 enhancement.
    const teams = await ctx.db.query("teams").collect();

    const enriched = await Promise.all(
      teams.map(async (team) => {
        const closers = await ctx.db
          .query("closers")
          .withIndex("by_team", (q) => q.eq("teamId", team._id))
          .collect();
        // Last call — single .first() on the team_and_date index. callStats
        // sidecar is small per row so no read-limit risk.
        const lastCall = await ctx.db
          .query("callStats")
          .withIndex("by_team_and_date", (q) => q.eq("teamId", team._id))
          .order("desc")
          .first();
        return {
          _id: team._id,
          name: team.name,
          createdAt: team.createdAt ?? team._creationTime,
          closerCount: closers.length,
          lastCallAt: lastCall?.createdAt ?? null,
          integrations: {
            slack: !!team.slackAccessToken,
            ghl: !!team.ghlApiKey,
            hyros: !!team.hyrosApiKey,
            calendly: !!team.calendlyAccessToken,
          },
        };
      }),
    );

    // Sort by recent activity — teams with calls bubble up.
    enriched.sort((a, b) => (b.lastCallAt ?? 0) - (a.lastCallAt ?? 0));
    return enriched;
  },
});

// ============================================================================
// Team detail snapshot — /admin/[teamId]
// ============================================================================

export const getTeamSnapshot = query({
  args: {
    clerkId: v.string(),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    await assertFounder(ctx, args.clerkId);

    const team = await ctx.db.get(args.teamId);
    if (!team) return null;

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    // Recent calls — read from calls (not callStats) so we get prospectName.
    // 50-row cap keeps us well under the 16 MiB scan limit (post callContent
    // split, calls rows are ~100 bytes each).
    const recentCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_status", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(50);

    const closerLookup = new Map(closers.map((c) => [c._id as string, c]));
    const callsWithCloserName = await Promise.all(
      recentCalls.map(async (c) => {
        const content = await ctx.db
          .query("callContent")
          .withIndex("by_call", (q) => q.eq("callId", c._id))
          .first();
        return {
          _id: c._id,
          startedAt: c.startedAt ?? null,
          duration: c.duration ?? null,
          outcome: c.outcome ?? null,
          prospectName: c.prospectName ?? null,
          closerName: closerLookup.get(c.closerId as string)?.name ?? "Unknown",
          hasTranscript: !!content?.transcriptText,
        };
      }),
    );

    const recentBots = await ctx.db
      .query("meetingBots")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(20);
    const botsWithCloserName = recentBots.map((b) => ({
      _id: b._id,
      _creationTime: b._creationTime,
      closerName: closerLookup.get(b.closerId as string)?.name ?? null,
      source: b.source,
      status: b.status,
      joinedAt: b.joinedAt ?? null,
    }));

    return {
      team,
      closers: closers.map((c) => ({
        _id: c._id,
        name: c.name,
        email: c.email,
        status: c.status,
        lastLoginAt: c.lastLoginAt ?? null,
      })),
      recentCalls: callsWithCloserName,
      recentBots: botsWithCloserName,
      integrations: {
        slack: !!team.slackAccessToken,
        slackChannels: team.slackNotificationChannels
          ? Object.values(team.slackNotificationChannels).filter(
              (c) =>
                typeof c === "object" &&
                c !== null &&
                (c as { enabled?: boolean }).enabled,
            ).length
          : 0,
        ghl: !!team.ghlApiKey,
        ghlLocationId: team.ghlLocationId ?? null,
        hyros: !!team.hyrosApiKey,
        calendly: !!team.calendlyAccessToken,
        calendlyEmail: team.calendlyConnectedEmail ?? null,
      },
    };
  },
});

// ============================================================================
// Performance queries — mirror customer-facing logic with teamId direct
// ============================================================================

const DATE_RANGE = v.union(
  v.literal("today"),
  v.literal("this_week"),
  v.literal("this_month"),
  v.literal("last_30_days"),
  v.literal("all_time"),
);

type DateRange =
  | "today"
  | "this_week"
  | "this_month"
  | "last_30_days"
  | "all_time";

/**
 * Compute the start-of-range cutoff for a given named range.
 * Mirrors the date math in closers.ts (getCloserStats / getTeamStats).
 * `all_time` returns 0 so every call passes the filter.
 */
function filterDateForRange(range: DateRange): number {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  switch (range) {
    case "today":
      return startOfToday.getTime();
    case "this_week": {
      const startOfWeek = new Date(startOfToday);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday
      return startOfWeek.getTime();
    }
    case "this_month": {
      const startOfMonth = new Date(startOfToday);
      startOfMonth.setDate(1);
      return startOfMonth.getTime();
    }
    case "last_30_days":
      return now - 30 * 24 * 60 * 60 * 1000;
    case "all_time":
      return 0;
  }
}

/**
 * Team-wide performance for the selected range. Mirrors the subset of
 * fields from api.closers.getTeamStats that the admin leaderboard shows.
 * Reads from callStats sidecar (safe at any team size).
 */
export const getTeamStatsForTeam = query({
  args: {
    clerkId: v.string(),
    teamId: v.id("teams"),
    dateRange: DATE_RANGE,
  },
  handler: async (ctx, args) => {
    await assertFounder(ctx, args.clerkId);

    const filterDate = filterDateForRange(args.dateRange);
    const stats = await ctx.db
      .query("callStats")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", filterDate),
      )
      .collect();

    // Same filter logic as getCloserStats — completed calls with outcome
    // set are the "real" call count; closed-outcome subset drives the
    // close rate and cash totals.
    const completed = stats.filter(
      (c) => c.status === "completed" && c.outcome != null,
    );
    const closed = completed.filter((c) => c.outcome === "closed");
    const cashCollected = closed.reduce(
      (sum, c) => sum + (c.cashCollected || 0),
      0,
    );

    return {
      totalCalls: completed.length,
      closedDeals: closed.length,
      closeRate: completed.length > 0 ? closed.length / completed.length : 0,
      cashCollected,
      avgDealSize: closed.length > 0 ? cashCollected / closed.length : 0,
    };
  },
});

/**
 * Per-closer leaderboard for the selected range. Mirrors the subset of
 * fields from api.closers.getCloserStats that the admin view shows.
 * Same filter logic as the customer-facing query — outputs should match
 * what AICom sees on their own /dashboard/closer-stats.
 */
export const getCloserStatsForTeam = query({
  args: {
    clerkId: v.string(),
    teamId: v.id("teams"),
    dateRange: DATE_RANGE,
  },
  handler: async (ctx, args) => {
    await assertFounder(ctx, args.clerkId);

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const activeClosers = closers.filter(
      (c) => c.status === "active" || c.status === "pending",
    );
    if (activeClosers.length === 0) return [];

    const filterDate = filterDateForRange(args.dateRange);
    const stats = await ctx.db
      .query("callStats")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", filterDate),
      )
      .collect();

    const byCloser = new Map<string, typeof stats>();
    for (const c of stats) {
      const list = byCloser.get(c.closerId);
      if (list) list.push(c);
      else byCloser.set(c.closerId, [c]);
    }

    const rows = activeClosers.map((closer) => {
      const closerCalls = byCloser.get(closer._id) ?? [];
      const completed = closerCalls.filter(
        (c) => c.status === "completed" && c.outcome != null,
      );
      const closed = completed.filter((c) => c.outcome === "closed");
      const cashCollected = closed.reduce(
        (sum, c) => sum + (c.cashCollected || 0),
        0,
      );
      return {
        closerId: closer._id as Id<"closers">,
        name: closer.name,
        email: closer.email,
        calls: completed.length,
        closed: closed.length,
        closeRate: completed.length > 0 ? closed.length / completed.length : 0,
        cashCollected,
        avgDealSize: closed.length > 0 ? cashCollected / closed.length : 0,
      };
    });

    rows.sort((a, b) => b.closeRate - a.closeRate);
    return rows;
  },
});
