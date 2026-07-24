import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// Admin action audit log. Written by the admin API routes (server-side, via
// ConvexHttpClient) which are themselves gated on the signed admin session —
// so these are not additionally auth-checked here, but they are NOT public
// paths a customer UI ever calls.
// ============================================================================

export const logAdminAction = mutation({
  args: {
    action: v.string(),
    targetClerkId: v.optional(v.string()),
    targetEmail: v.optional(v.string()),
    targetTeamId: v.optional(v.id("teams")),
    targetTeamName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("adminAuditLog", {
      action: args.action,
      targetClerkId: args.targetClerkId,
      targetEmail: args.targetEmail,
      targetTeamId: args.targetTeamId,
      targetTeamName: args.targetTeamName,
      createdAt: Date.now(),
    });
  },
});

/** Resolve a Clerk user id → their team (for the impersonate confirm label). */
export const teamForClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return null;
    const team = await ctx.db.get(user.teamId);
    return {
      teamId: user.teamId,
      teamName: (team as { name?: string } | null)?.name ?? null,
      userEmail: user.email,
    };
  },
});

export const recentAdminActions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("adminAuditLog")
      .withIndex("by_created")
      .order("desc")
      .take(Math.min(args.limit ?? 10, 50));
    return rows.map((r) => ({
      action: r.action,
      targetEmail: r.targetEmail ?? null,
      targetTeamName: r.targetTeamName ?? null,
      createdAt: r.createdAt,
    }));
  },
});
