import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// ============================================================================
// The dashboard's "This week" card, in one round-trip: what is alive right
// now — the next (or live) coaching call, roles added this week, members
// online, the newest community posts. Honest numbers only; nothing is
// padded. Test accounts are excluded from every count, and posts in coach
// or VIP channels never leak to people outside them.
// ============================================================================

const DAY = 86_400_000;
const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // matches b2cPresence
const POST_SNIPPET_LEN = 80;

export const getThisWeek = query({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const me = await ctx.db.get(args.userId);
    if (!me) return null;
    const now = Date.now();

    // Next coaching call: a live one wins; else the soonest scheduled call
    // that hasn't already passed (the hourly sweep may lag a stale row).
    const live = await ctx.db
      .query("b2cCoachingCalls")
      .withIndex("by_status_start", (q) => q.eq("status", "live"))
      .first();
    const scheduled = await ctx.db
      .query("b2cCoachingCalls")
      .withIndex("by_status_start", (q) => q.eq("status", "scheduled").gt("scheduledStartTime", now - 30 * 60_000))
      .order("asc")
      .first();
    const call = live ?? scheduled;
    const coach = call ? await ctx.db.get(call.coachUserId) : null;
    const nextCoachingCall = call
      ? {
          callId: call._id,
          title: call.title,
          scheduledStartTime: call.scheduledStartTime,
          scheduledDurationMin: call.scheduledDurationMin,
          status: call.status,
          coachName: coach?.name ?? "Coach",
        }
      : null;

    // Roles added in the last 7 days (same window as the Monday announcement).
    const jobs = await ctx.db
      .query("b2cPublicJobs")
      .withIndex("by_status", (q) => q.eq("status", "active").gte("createdAt", now - 7 * DAY))
      .collect();
    const byIndustry = new Map<string, number>();
    for (const j of jobs) byIndustry.set(j.industry, (byIndustry.get(j.industry) ?? 0) + 1);
    // The live feed's weekly total comes from the latest Monday-note snapshot
    // (b2cWeeklyRoles), so the tile shows the same headline as the note.
    const snapshot = await ctx.db
      .query("b2cWeeklyRolesSnapshots")
      .withIndex("by_computed")
      .order("desc")
      .first();
    const feedTotal =
      snapshot && snapshot.feedTotal !== undefined && now - snapshot.computedAt < 8 * DAY
        ? snapshot.feedTotal
        : undefined;
    const rolesThisWeek = {
      count: jobs.length,
      topIndustries: [...byIndustry.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name),
      feedTotal,
      total: jobs.length + (feedTotal ?? 0),
    };

    // Members online now (presence rule), excluding self and test accounts.
    const users = await ctx.db.query("b2cUsers").collect();
    const testIds = new Set(users.filter((u) => u.isTestAccount === true).map((u) => u._id));
    const onlineCount = users.filter(
      (u) =>
        u._id !== args.userId &&
        !testIds.has(u._id) &&
        !!u.lastSeenAt &&
        u.lastSeenAt > now - ONLINE_THRESHOLD_MS,
    ).length;

    // Newest posts a member is allowed to see: skip deleted, test authors,
    // and anything in a coach-owned or VIP-only channel.
    const recent = await ctx.db.query("b2cCommunityPosts").withIndex("by_created").order("desc").take(10);
    const channels = new Map<Id<"b2cCommunityChannels">, Doc<"b2cCommunityChannels"> | null>();
    const latestPosts: Array<{ postId: Id<"b2cCommunityPosts">; authorName: string; channelName: string; createdAt: number; snippet: string }> = [];
    for (const p of recent) {
      if (p.isDeleted || testIds.has(p.authorId)) continue;
      if (!channels.has(p.channelId)) channels.set(p.channelId, await ctx.db.get(p.channelId));
      const ch = channels.get(p.channelId);
      if (!ch || ch.isArchived || ch.coachId || ch.vipOnly) continue;
      const text = p.body.replace(/\s+/g, " ").trim();
      latestPosts.push({
        postId: p._id,
        authorName: p.authorName,
        channelName: ch.name,
        createdAt: p.createdAt,
        snippet: text.length > POST_SNIPPET_LEN ? `${text.slice(0, POST_SNIPPET_LEN - 1)}…` : text,
      });
      if (latestPosts.length === 2) break;
    }

    return { nextCoachingCall, rolesThisWeek, onlineCount, latestPosts };
  },
});
