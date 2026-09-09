import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// ============================================================================
// One member, one line: everything the founder needs to know about how a new
// member is actually using the product, computed from the tables the app
// already writes. Feeds the cancellation alert and the daily new-member
// digest. Every read is indexed and bounded per member.
// ============================================================================

const DAY = 86_400_000;

export interface MemberSnapshot {
  userId: string;
  name: string;
  email: string;
  isTestAccount: boolean;
  createdAt: number;
  daysSinceSignup: number;
  subscriptionStatus: string;
  planTerm?: string;
  cancelAtPeriodEnd: boolean;
  cancellationReason?: string;
  cancellationComment?: string;
  currentPeriodEnd?: number;
  lastSeenAt?: number;
  lastLoginAt?: number;
  appVersion?: string;
  hasPassword: boolean;
  profilePct: number;
  callsRecorded: number;
  rolesTracked: number;
  channelsOpened: number;
  posts: number;
  comments: number;
  coachingAttended: number;
  classroomJoined: boolean;
}

/** Mirrors the app's nine-step completeness bar (ProfileView / lib/profile-completeness). */
export function profileCompletionPct(
  profile: Doc<"b2cProfiles"> | null,
  profileSlug: string | undefined,
): number {
  const social = (profile?.socialLinks ?? {}) as Record<string, unknown>;
  const steps = [
    !!profile?.photoStorageId,
    !!profile?.headline,
    !!profile?.bio,
    !!profile?.location,
    (profile?.industries?.length ?? 0) > 0,
    !!profile?.ticketRange,
    (profile?.skills?.length ?? 0) > 0,
    Object.values(social).some((value) => !!value),
    !!profileSlug,
  ];
  return Math.round((steps.filter(Boolean).length / steps.length) * 100);
}

export async function summarizeMember(
  ctx: QueryCtx,
  user: Doc<"b2cUsers">,
): Promise<MemberSnapshot> {
  const uid = user._id;
  const profile = await ctx.db
    .query("b2cProfiles")
    .withIndex("by_user", (q) => q.eq("userId", uid))
    .first();
  const closer = user.personalWorkspaceId
    ? await ctx.db
        .query("closers")
        .withIndex("by_team", (q) => q.eq("teamId", user.personalWorkspaceId))
        .first()
    : null;
  const calls = closer
    ? await ctx.db
        .query("calls")
        .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
        .collect()
    : [];
  const freeHire = await ctx.db
    .query("b2cFreeHireJobTracking")
    .withIndex("by_user_updated", (q) => q.eq("userId", uid))
    .collect();
  const publicJobs = await ctx.db
    .query("b2cPublicJobTracking")
    .withIndex("by_user", (q) => q.eq("userId", uid))
    .collect();
  const reads = await ctx.db
    .query("b2cChannelReadState")
    .withIndex("by_user", (q) => q.eq("userId", uid))
    .collect();
  const posts = await ctx.db
    .query("b2cCommunityPosts")
    .withIndex("by_author", (q) => q.eq("authorId", uid))
    .collect();
  const comments = await ctx.db
    .query("b2cCommunityComments")
    .withIndex("by_author", (q) => q.eq("authorId", uid))
    .collect();
  const attendance = await ctx.db
    .query("b2cCoachingCallAttendance")
    .withIndex("by_user", (q) => q.eq("userId", uid))
    .collect();
  const membership = await ctx.db
    .query("b2cClassroomMemberships")
    .withIndex("by_user", (q) => q.eq("userId", uid))
    .first();

  const createdAt = user.createdAt ?? user._creationTime;
  return {
    userId: uid,
    name: user.name,
    email: user.email,
    isTestAccount: user.isTestAccount === true,
    createdAt,
    daysSinceSignup: Math.floor((Date.now() - createdAt) / DAY),
    subscriptionStatus: user.subscriptionStatus,
    planTerm: user.planTerm,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd === true,
    cancellationReason: user.cancellationReason,
    cancellationComment: user.cancellationComment,
    currentPeriodEnd: user.currentPeriodEnd,
    lastSeenAt: user.lastSeenAt,
    lastLoginAt: user.lastLoginAt,
    appVersion: user.appVersion,
    hasPassword: !!user.passwordHash,
    profilePct: profileCompletionPct(profile, user.profileSlug),
    callsRecorded: calls.length,
    rolesTracked: freeHire.filter((t) => !t.dismissed).length + publicJobs.length,
    channelsOpened: reads.length,
    posts: posts.filter((p) => !p.isDeleted).length,
    comments: comments.filter((c) => !c.isDeleted).length,
    coachingAttended: attendance.length,
    classroomJoined: !!membership,
  };
}

export const getMemberSnapshot = internalQuery({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args): Promise<MemberSnapshot | null> => {
    const user = await ctx.db.get(args.userId);
    return user ? await summarizeMember(ctx, user) : null;
  },
});

/** Real (non-test) members who signed up within `withinDays`, newest first. */
export const listRecentMemberSnapshots = internalQuery({
  args: { withinDays: v.number() },
  handler: async (ctx, args): Promise<MemberSnapshot[]> => {
    const since = Date.now() - args.withinDays * DAY;
    const users = await ctx.db.query("b2cUsers").collect();
    const recent = users
      .filter((u) => u.isTestAccount !== true && (u.createdAt ?? u._creationTime) >= since)
      .sort((a, b) => (b.createdAt ?? b._creationTime) - (a.createdAt ?? a._creationTime));
    const out: MemberSnapshot[] = [];
    for (const u of recent) out.push(await summarizeMember(ctx, u));
    return out;
  },
});
