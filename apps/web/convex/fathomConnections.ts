// ============================================================================
// Connecting a Fathom account.
//
// Two shapes have to work, because customers differ and we can't make them
// change how they buy software:
//
//   - the company pays for Fathom Teams, one connection covers everyone
//   - each closer connects their own personal Fathom account
//
// A connection with no `closerId` is the first; with one, the second. Nothing
// downstream cares which — the recorder's email decides whose call it is
// either way.
// ============================================================================

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * The connection a webhook should be verified against.
 *
 * Team-wide connections are preferred over per-closer ones: if a company has
 * both, the team-wide webhook is the one Fathom is posting to.
 */
export const getConnectionForTeam = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("fathomConnections")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const live = all.filter((c) => c.status === "active");
    return live.find((c) => !c.closerId) ?? live[0] ?? null;
  },
});

export const listConnectionsForTeam = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("fathomConnections")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    // Never return the key itself. Nothing downstream needs it, and a stray
    // log line is all it takes to leak a customer's credential.
    return all.map(({ apiKey, webhookSecret, ...rest }) => ({
      ...rest,
      hasKey: !!apiKey,
      hasWebhook: !!webhookSecret,
    }));
  },
});

export const saveConnection = internalMutation({
  args: {
    teamId: v.id("teams"),
    closerId: v.optional(v.id("closers")),
    apiKey: v.string(),
    webhookId: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"fathomConnections">> => {
    const existing = (
      await ctx.db
        .query("fathomConnections")
        .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
        .collect()
    ).find((c) => String(c.closerId ?? "") === String(args.closerId ?? ""));

    if (existing) {
      await ctx.db.patch(existing._id, {
        apiKey: args.apiKey,
        ...(args.webhookId ? { webhookId: args.webhookId } : {}),
        ...(args.webhookSecret ? { webhookSecret: args.webhookSecret } : {}),
        status: "active",
        errorMessage: undefined,
        errorAt: undefined,
      });
      return existing._id;
    }

    return await ctx.db.insert("fathomConnections", {
      teamId: args.teamId,
      ...(args.closerId ? { closerId: args.closerId } : {}),
      apiKey: args.apiKey,
      ...(args.webhookId ? { webhookId: args.webhookId } : {}),
      ...(args.webhookSecret ? { webhookSecret: args.webhookSecret } : {}),
      status: "active",
      createdAt: Date.now(),
    });
  },
});

/**
 * Record that a connection is failing.
 *
 * Deliberately keeps the FIRST error rather than the most recent. We learned
 * this on the GoHighLevel integration: a second write would overwrite the
 * message that explained what actually went wrong with a generic follow-on
 * failure, leaving nothing to debug from.
 */
export const markConnectionError = internalMutation({
  args: {
    connectionId: v.id("fathomConnections"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.connectionId);
    if (!c) return;
    if (c.status === "error" && c.errorMessage) return;
    await ctx.db.patch(args.connectionId, {
      status: "error",
      errorMessage: args.message.slice(0, 500),
      errorAt: Date.now(),
    });
  },
});

/** Which closer said this is their Fathom address. Set once, by them. */
export const setCloserFathomEmail = internalMutation({
  args: { closerId: v.id("closers"), fathomEmail: v.string() },
  handler: async (ctx, args) => {
    const email = args.fathomEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("That doesn't look like an email address");
    }
    await ctx.db.patch(args.closerId, { fathomEmail: email });
    return { success: true };
  },
});
