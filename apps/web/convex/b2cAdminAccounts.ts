import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Internal account admin: hard-delete a single Money Bells broadcast, and
// provision flagged test accounts (the Playwright suite's fixtures). Not
// reachable over HTTP — run via `npx convex run --prod`.
// ============================================================================

/**
 * Hard-deletes ONE broadcast plus its linked feed post and that post's
 * children, and fixes the channel counter. The stock deleteBroadcast only
 * soft-deletes (patches isDeleted), which keeps the row in the DB; this is
 * for scrubbing test money out of the leaderboard for good. The owner's
 * account is untouched.
 */
export const hardDeleteMoneyBellBroadcast = internalMutation({
  args: { broadcastId: v.id("b2cMoneyBellBroadcasts") },
  handler: async (ctx, args) => {
    const broadcast = await ctx.db.get(args.broadcastId);
    if (!broadcast) return { deleted: false, reason: "broadcast not found" };
    const counts: Record<string, number> = {};

    if (broadcast.postId) {
      const post = await ctx.db.get(broadcast.postId);
      if (post) {
        const comments = await ctx.db
          .query("b2cCommunityComments")
          .withIndex("by_post", (q: any) => q.eq("postId", post._id))
          .collect();
        for (const c of comments) {
          const likes = await ctx.db
            .query("b2cCommunityCommentLikes")
            .withIndex("by_comment_user", (q: any) => q.eq("commentId", c._id))
            .collect();
          for (const l of likes) await ctx.db.delete(l._id);
          const cr = await ctx.db
            .query("b2cCommunityReactions")
            .withIndex("by_target", (q: any) =>
              q.eq("targetType", "comment").eq("targetId", String(c._id)),
            )
            .collect();
          for (const r of cr) await ctx.db.delete(r._id);
          await ctx.db.delete(c._id);
        }
        counts.comments = comments.length;

        const likes = await ctx.db
          .query("b2cCommunityPostLikes")
          .withIndex("by_post_user", (q: any) => q.eq("postId", post._id))
          .collect();
        for (const l of likes) await ctx.db.delete(l._id);
        counts.likes = likes.length;

        const reactions = await ctx.db
          .query("b2cCommunityReactions")
          .withIndex("by_target", (q: any) =>
            q.eq("targetType", "post").eq("targetId", String(post._id)),
          )
          .collect();
        for (const r of reactions) await ctx.db.delete(r._id);
        counts.reactions = reactions.length;

        if (!post.isDeleted) {
          const channel = await ctx.db.get(post.channelId);
          if (channel) {
            await ctx.db.patch(post.channelId, {
              postCount: Math.max(0, channel.postCount - 1),
            });
          }
        }
        await ctx.db.delete(post._id);
        counts.post = 1;
      }
    }

    await ctx.db.delete(broadcast._id);
    return { deleted: true, cashCollected: broadcast.cashCollected, counts };
  },
});

/** Same SHA-256 hashing the signup path uses (b2cAuth.ts). */
async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Creates the same three rows signup creates (personal workspace team +
 * closer + b2cUsers — mirrors b2cAuth.ts signupB2CUser) but flagged
 * isTestAccount so community/presence queries hide it, emailVerified so
 * login works immediately, and with NO GHL sync. Returns the ids the
 * Playwright fixtures need.
 */
export const provisionTestAccount = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    password: v.string(),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("none"),
      v.literal("cancelled"),
      v.literal("past_due"),
    ),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .first();
    if (existing) throw new Error(`${email} already exists — purge it first`);

    const passwordHash = await hashPassword(args.password);
    const now = Date.now();

    const teamId = await ctx.db.insert("teams", {
      name: `${args.name}'s Workspace`,
      type: "personal",
      plan: "active",
      createdAt: now,
    });
    const closerId = await ctx.db.insert("closers", {
      email,
      name: args.name,
      teamId,
      status: "active",
      passwordHash,
      invitedAt: now,
      activatedAt: now,
      // UI specs must land on the hub, not the calendar-onboarding overlay
      calendarOnboardingCompleted: true,
    });
    const b2cUserId = await ctx.db.insert("b2cUsers", {
      email,
      phoneVerified: false,
      emailVerified: true,
      name: args.name,
      passwordHash,
      personalWorkspaceId: teamId,
      subscriptionStatus: args.subscriptionStatus,
      isTestAccount: true,
      // Skip the welcome/goal questionnaire on real logins in UI specs
      onboardingCompleted: true,
      createdAt: now,
    });

    return { b2cUserId, closerId, teamId };
  },
});

/** Adjust a TEST account's subscription status (refuses real accounts). */
export const setTestAccountSubscription = internalMutation({
  args: {
    email: v.string(),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("none"),
      v.literal("cancelled"),
      v.literal("past_due"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q: any) => q.eq("email", args.email.toLowerCase()))
      .first();
    if (!user) throw new Error("no such user");
    if (user.isTestAccount !== true) throw new Error("refusing: not a test account");
    await ctx.db.patch(user._id, { subscriptionStatus: args.subscriptionStatus });
    return { updated: true, subscriptionStatus: args.subscriptionStatus };
  },
});

/**
 * Delete specific b2cLeads rows by id — internal-only maintenance for
 * scrubbing test leads that would otherwise surface in the public
 * social-proof feed. Refuses ids that don't resolve to b2cLeads.
 */
export const deleteLeadsByIds = internalMutation({
  args: { leadIds: v.array(v.string()) },
  handler: async (ctx, { leadIds }) => {
    const deleted: string[] = [];
    for (const raw of leadIds) {
      const id = ctx.db.normalizeId("b2cLeads", raw);
      if (!id) continue;
      const row = await ctx.db.get(id);
      if (!row) continue;
      await ctx.db.delete(id);
      deleted.push(raw);
    }
    return { deleted };
  },
});

/**
 * Reset a TEST account's password (isTestAccount rows only — refuses real
 * accounts). E2E/maintenance tool: lets the rig recover accounts whose
 * generated passwords weren't retained.
 */
export const setTestAccountPassword = internalMutation({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .first();
    if (!user) throw new Error("No such user");
    if (user.isTestAccount !== true) throw new Error("Refusing: not a test account");
    const passwordHash = await hashPassword(args.password);
    await ctx.db.patch(user._id, { passwordHash });
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .first();
    if (closer) await ctx.db.patch(closer._id, { passwordHash });
    return { reset: true };
  },
});

/**
 * Provision a COACH account: a REAL, VISIBLE, comped member (the opposite
 * of a test account) plus the coach badge and their b2cCoaches classroom
 * profile. CLI-only, one command per new coach. No GHL sync — coaches are
 * not leads.
 */
export const provisionCoachAccount = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    password: v.string(),
    slug: v.string(),
    headline: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .first();
    if (existing) throw new Error(`${email} already exists`);
    const slug = args.slug.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) throw new Error("Bad slug");
    const slugTaken = await ctx.db
      .query("b2cCoaches")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .first();
    if (slugTaken) throw new Error(`Slug '${slug}' already taken`);

    const passwordHash = await hashPassword(args.password);
    const now = Date.now();
    const teamId = await ctx.db.insert("teams", {
      name: `${args.name}'s Workspace`,
      type: "personal",
      plan: "active",
      createdAt: now,
    });
    const closerId = await ctx.db.insert("closers", {
      email,
      name: args.name,
      teamId,
      status: "active",
      passwordHash,
      invitedAt: now,
      activatedAt: now,
      calendarOnboardingCompleted: true,
    });
    const b2cUserId = await ctx.db.insert("b2cUsers", {
      email,
      phoneVerified: false,
      emailVerified: true,
      name: args.name,
      passwordHash,
      personalWorkspaceId: teamId,
      subscriptionStatus: "active", // comped — coaches don't pay
      onboardingCompleted: true,
      badges: ["coach"],
      createdAt: now,
    });
    const coachId = await ctx.db.insert("b2cCoaches", {
      userId: b2cUserId,
      slug,
      displayName: args.name,
      headline: args.headline?.trim(),
      isActive: true,
      createdAt: now,
    });
    return { b2cUserId, closerId, teamId, coachId };
  },
});

/**
 * Seed/clean auto-join test fixtures for a TEST account: one live-looking
 * b2cCalendars row and one near-future calendar event with a meeting URL.
 * Refuses non-test accounts. Used by the auto-join scheduler tests.
 */
export const seedAutoJoinFixture = internalMutation({
  args: { email: v.string(), cleanup: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .first();
    if (!user || user.isTestAccount !== true) throw new Error("Refusing: not a test account");
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_team", (q: any) => q.eq("teamId", user.personalWorkspaceId))
      .first();
    if (!closer) throw new Error("No closer row");

    if (args.cleanup) {
      const cals = await ctx.db
        .query("b2cCalendars")
        .withIndex("by_closer", (q: any) => q.eq("closerId", closer._id))
        .collect();
      for (const c of cals) if (c.label === "AutoJoin Test") await ctx.db.delete(c._id);
      const events = await ctx.db
        .query("calendarEvents")
        .withIndex("by_closer", (q: any) => q.eq("closerId", closer._id))
        .collect();
      let deleted = 0;
      for (const e of events) if (e.uid?.startsWith("autojoin-test-")) { await ctx.db.delete(e._id); deleted++; }
      return { cleaned: true, eventsDeleted: deleted };
    }

    const calId = await ctx.db.insert("b2cCalendars", {
      closerId: closer._id,
      teamId: user.personalWorkspaceId,
      label: "AutoJoin Test",
      color: "#10b981",
      provider: "ics",
      isEnabled: true,
      lastSyncAt: Date.now(),
      createdAt: Date.now(),
    });
    const eventId = await ctx.db.insert("calendarEvents", {
      closerId: closer._id,
      teamId: user.personalWorkspaceId,
      uid: `autojoin-test-${Date.now()}`,
      title: "AutoJoin Test Meeting",
      startTime: Date.now() + 2 * 60 * 60 * 1000,
      endTime: Date.now() + 3 * 60 * 60 * 1000,
      meetingUrl: "https://meet.google.com/xxx-autojoin-test",
      calendarId: calId,
      fetchedAt: Date.now(),
    } as any);
    return { seeded: true, calId, eventId };
  },
});

/** Give a TEST account's manual calls realistic durations (demo screenshots). */
export const polishDemoCalls = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .first();
    if (!user || user.isTestAccount !== true) throw new Error("Refusing: not a test account");
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_team", (q: any) => q.eq("teamId", user.personalWorkspaceId))
      .first();
    if (!closer) throw new Error("No closer");
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_closer", (q: any) => q.eq("closerId", closer._id))
      .collect();
    let patched = 0;
    const durations = [2760, 1980, 3240, 1500, 2280, 3060, 1740, 2520, 2940, 1620, 2100, 3300, 1860];
    for (const c of calls) {
      if (!(c as any).duration) {
        await ctx.db.patch(c._id, { duration: durations[patched % durations.length] } as any);
        patched++;
      }
    }
    return { patched };
  },
});
