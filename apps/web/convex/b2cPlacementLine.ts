import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// The Placement Line — the VIP internal priority list (Job Board → Internal).
//
// Not a job board: partner companies ask Sequ3nce for closers, and Sequ3nce
// sends them member PROFILES. So the product is a gate + a waiting room:
//   1. VIP (yearly) only.
//   2. Profile must be send-worthy: photo, headline, bio, public, and
//      stats verified — because the profile IS the application.
//   3. Join once; then Sequ3nce reaches out when a partner matches.
// All gates re-checked server-side at join time.
// ============================================================================

const VIPish = (badges: string[] | undefined) =>
  !!badges?.includes("vip") || !!badges?.includes("founder") || !!badges?.includes("admin");

async function eligibilityFor(ctx: { db: any }, userId: string) {
  const user = await ctx.db.get(userId as any);
  if (!user) return null;
  const profile = await ctx.db
    .query("b2cProfiles")
    .withIndex("by_user", (q: any) => q.eq("userId", user._id))
    .first();
  const checks = {
    photo: !!profile?.photoStorageId,
    headline: !!profile?.headline?.trim(),
    bio: !!profile?.bio?.trim(),
    publicProfile: profile?.isPublic === true,
    verifiedStats: profile?.isManuallyVerified === true,
  };
  return {
    user,
    isVip: VIPish(user.badges),
    checks,
    eligible: Object.values(checks).every(Boolean),
  };
}

export const getPlacementLineStatus = query({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const e = await eligibilityFor(ctx, args.userId);
    if (!e) return null;
    return {
      isVip: e.isVip,
      checks: e.checks,
      eligible: e.eligible,
      joinedAt: (e.user as any).placementLineJoinedAt ?? null,
    };
  },
});

export const joinPlacementLine = mutation({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const e = await eligibilityFor(ctx, args.userId);
    if (!e) throw new Error("User not found");
    if (!e.isVip) throw new Error("The Placement Line is for yearly (VIP) members");
    if (!e.eligible) {
      throw new Error("Finish your profile first — it's what we send to partners");
    }
    if ((e.user as any).placementLineJoinedAt) {
      return { joined: true, already: true };
    }
    await ctx.db.patch(e.user._id, { placementLineJoinedAt: Date.now() });
    return { joined: true, already: false };
  },
});

/** Founder view: everyone on the Line, newest first, with their profiles. */
export const listPlacementLineMembers = query({
  args: { founderId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const founder = await ctx.db.get(args.founderId);
    const badges: string[] = (founder as any)?.badges ?? [];
    if (!badges.includes("founder") && !badges.includes("admin")) {
      throw new Error("Founder access required");
    }
    const users = await ctx.db.query("b2cUsers").collect();
    const online = users
      .filter((u: any) => u.placementLineJoinedAt)
      .sort((a: any, b: any) => b.placementLineJoinedAt - a.placementLineJoinedAt);
    return Promise.all(
      online.map(async (u: any) => {
        const profile = await ctx.db
          .query("b2cProfiles")
          .withIndex("by_user", (q: any) => q.eq("userId", u._id))
          .first();
        return {
          userId: u._id,
          name: u.name,
          email: u.email,
          joinedAt: u.placementLineJoinedAt,
          headline: profile?.headline ?? null,
          verified: profile?.isManuallyVerified === true,
        };
      }),
    );
  },
});
