import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

// ============================================================================
// Coach Classrooms — profiles, membership, replays routing.
// Spec: docs/superpowers/specs/2026-09-01-coach-classrooms-design.md
//
// A coach = b2cUsers row with the "coach" badge + a b2cCoaches profile row.
// Free classroom is joinable by any member; premium tier arrives Phase 3.
// Recording pipeline is untouched — replays route by the call's coachUserId.
// ============================================================================

function isFounder(user: Doc<"b2cUsers"> | null): boolean {
  return !!user?.badges?.includes("founder");
}

async function coachProfileForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"b2cUsers">,
): Promise<Doc<"b2cCoaches"> | null> {
  return await ctx.db
    .query("b2cCoaches")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

async function membershipFor(
  ctx: QueryCtx | MutationCtx,
  coachId: Id<"b2cCoaches">,
  userId: Id<"b2cUsers">,
): Promise<Doc<"b2cClassroomMemberships"> | null> {
  return await ctx.db
    .query("b2cClassroomMemberships")
    .withIndex("by_coach_user", (q) => q.eq("coachId", coachId).eq("userId", userId))
    .first();
}

// ==================== Member-facing ====================

/**
 * The classroom landing data for a member. Single-coach era: with no
 * coachId argument it returns the first active coach's classroom (the
 * picker arrives with coach #2). Returns null when no active coach exists
 * — the app hides the Classroom area entirely in that case.
 */
export const getClassroomHome = query({
  args: {
    userId: v.id("b2cUsers"),
    coachId: v.optional(v.id("b2cCoaches")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    // Cloaking: coaches whose account is a test account are invisible to
    // real users (mirrors the community/presence isTestAccount rule) but
    // remain visible to test-account viewers so E2E rigs work end-to-end.
    const viewerIsTest = user.isTestAccount === true;
    const coachVisible = async (c: Doc<"b2cCoaches">) => {
      if (viewerIsTest) return true;
      const cu = await ctx.db.get(c.userId);
      return cu?.isTestAccount !== true;
    };

    let coach: Doc<"b2cCoaches"> | null = null;
    if (args.coachId) {
      const c = await ctx.db.get(args.coachId);
      coach = c && (await coachVisible(c)) ? c : null;
    } else {
      const actives = await ctx.db
        .query("b2cCoaches")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
      for (const c of actives) {
        if (await coachVisible(c)) { coach = c; break; }
      }
    }
    if (!coach || !coach.isActive) return null;

    const coachUser = await ctx.db.get(coach.userId);
    const membership = await membershipFor(ctx, coach._id, args.userId);
    const memberCount = (
      await ctx.db
        .query("b2cClassroomMemberships")
        .withIndex("by_coach", (q) => q.eq("coachId", coach._id))
        .collect()
    ).length;

    let avatarUrl: string | null = null;
    if (coach.avatarStorageId) {
      avatarUrl = await ctx.storage.getUrl(coach.avatarStorageId as any);
    }

    return {
      coach: {
        coachId: coach._id,
        slug: coach.slug,
        displayName: coach.displayName,
        headline: coach.headline ?? null,
        bio: coach.bio ?? null,
        avatarUrl,
        coachUserId: coach.userId,
        coachUserName: coachUser?.name ?? coach.displayName,
      },
      membership: membership
        ? { tier: membership.tier, joinedAt: membership.joinedAt }
        : null,
      memberCount,
      viewerIsCoach: coach.userId === args.userId,
    };
  },
});

/** Join a classroom on the free tier. Idempotent. */
export const joinClassroom = mutation({
  args: { userId: v.id("b2cUsers"), coachId: v.id("b2cCoaches") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    const coach = await ctx.db.get(args.coachId);
    if (!coach || !coach.isActive) throw new Error("Classroom not available");

    const existing = await membershipFor(ctx, args.coachId, args.userId);
    if (existing) return { joined: true, already: true };

    await ctx.db.insert("b2cClassroomMemberships", {
      coachId: args.coachId,
      userId: args.userId,
      tier: "free",
      joinedAt: Date.now(),
    });
    return { joined: true, already: false };
  },
});

/**
 * The classroom's Replays shelf: the coach's past calls with ready
 * recordings. Members only. Premium-tier replays are hidden from free
 * members (forward provision — nothing premium exists yet).
 */
export const getClassroomReplays = query({
  args: { userId: v.id("b2cUsers"), coachId: v.id("b2cCoaches") },
  handler: async (ctx, args) => {
    const coach = await ctx.db.get(args.coachId);
    if (!coach) return [];
    const membership = await membershipFor(ctx, args.coachId, args.userId);
    const viewerIsCoach = coach.userId === args.userId;
    const user = await ctx.db.get(args.userId);
    if (!membership && !viewerIsCoach && !isFounder(user)) return [];

    const calls = await ctx.db
      .query("b2cCoachingCalls")
      .withIndex("by_coach", (q) => q.eq("coachUserId", coach.userId))
      .order("desc")
      .take(100);

    const memberTier = membership?.tier ?? "free";
    return calls
      .filter((c) => c.recordingStatus === "ready" && c.recordingUrl)
      .filter(
        (c) =>
          viewerIsCoach ||
          isFounder(user) ||
          (c.tier ?? "free") === "free" ||
          memberTier === "premium",
      )
      .map((c) => ({
        callId: c._id,
        title: c.title,
        description: c.description ?? null,
        scheduledStartTime: c.scheduledStartTime,
        recordingUrl: c.recordingUrl!,
        featuredInTraining: c.featuredInTraining === true,
        tier: c.tier ?? "free",
      }));
  },
});

// ==================== Coach-facing ====================

/** The viewer's own coach profile, or null if they aren't a coach. */
export const getMyCoachProfile = query({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const coach = await coachProfileForUser(ctx, args.userId);
    if (!coach) return null;
    let avatarUrl: string | null = null;
    if (coach.avatarStorageId) {
      avatarUrl = await ctx.storage.getUrl(coach.avatarStorageId as any);
    }
    return { ...coach, avatarUrl };
  },
});

/** Coach edits their own profile copy. */
export const updateCoachProfile = mutation({
  args: {
    userId: v.id("b2cUsers"),
    displayName: v.optional(v.string()),
    headline: v.optional(v.string()),
    bio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coach = await coachProfileForUser(ctx, args.userId);
    if (!coach) throw new Error("Not a coach");
    const patch: Record<string, string> = {};
    if (args.displayName !== undefined) {
      const dn = args.displayName.trim();
      if (dn.length < 2 || dn.length > 60) throw new Error("Display name must be 2-60 characters");
      patch.displayName = dn;
    }
    if (args.headline !== undefined) {
      if (args.headline.length > 120) throw new Error("Headline too long (max 120)");
      patch.headline = args.headline.trim();
    }
    if (args.bio !== undefined) {
      if (args.bio.length > 2000) throw new Error("Bio too long (max 2000)");
      patch.bio = args.bio.trim();
    }
    await ctx.db.patch(coach._id, patch);
    return { updated: true };
  },
});

/**
 * Coach pushes one of THEIR replays to the house Training tab, making it
 * visible to every Sequ3nce member. Founder may also feature any replay.
 */
export const pushReplayToTraining = mutation({
  args: { userId: v.id("b2cUsers"), callId: v.id("b2cCoachingCalls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
    const user = await ctx.db.get(args.userId);
    if (call.coachUserId !== args.userId && !isFounder(user)) {
      throw new Error("Only the call's coach can share it with all users");
    }
    if (call.recordingStatus !== "ready" || !call.recordingUrl) {
      throw new Error("Recording isn't ready yet");
    }
    await ctx.db.patch(args.callId, { featuredInTraining: true });
    return { featured: true };
  },
});

/** Founder-only: pull a featured replay back out of the house Training tab. */
export const unfeatureReplay = mutation({
  args: { userId: v.id("b2cUsers"), callId: v.id("b2cCoachingCalls") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!isFounder(user)) throw new Error("Founder access required");
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
    await ctx.db.patch(args.callId, { featuredInTraining: false });
    return { featured: false };
  },
});

// ==================== Provisioning (CLI-only) ====================

/**
 * Make an existing user a coach: append the "coach" badge and create their
 * b2cCoaches profile. Internal — run via CLI when onboarding a coach.
 */
export const createCoach = internalMutation({
  args: {
    userId: v.id("b2cUsers"),
    slug: v.string(),
    displayName: v.string(),
    headline: v.optional(v.string()),
    bio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    const slug = args.slug.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) throw new Error("Bad slug (a-z, 0-9, dashes)");
    const slugTaken = await ctx.db
      .query("b2cCoaches")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (slugTaken) throw new Error(`Slug '${slug}' already taken`);
    const existing = await coachProfileForUser(ctx, args.userId);
    if (existing) throw new Error("User already has a coach profile");

    const badges = user.badges ?? [];
    if (!badges.includes("coach")) {
      await ctx.db.patch(args.userId, { badges: [...badges, "coach"] });
    }
    const coachId = await ctx.db.insert("b2cCoaches", {
      userId: args.userId,
      slug,
      displayName: args.displayName.trim(),
      headline: args.headline?.trim(),
      bio: args.bio?.trim(),
      isActive: true,
      createdAt: Date.now(),
    });
    return { coachId };
  },
});
