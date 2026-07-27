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

/**
 * What the closer app shows on the Fathom card.
 *
 * Returns no credential of any kind — this crosses the network to a browser.
 * `connectedBySomeoneElse` is the case that matters for a team-wide setup: the
 * closer has nothing to do, and should be told that rather than being shown an
 * empty box asking for a key they don't have.
 */
export const getStatusForCloser = internalQuery({
  args: { teamId: v.id("teams"), closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    const all = await ctx.db
      .query("fathomConnections")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const live = all.filter((c) => c.status === "active");
    const teamWide = live.find((c) => !c.closerId);
    const mine = live.find((c) => String(c.closerId) === String(args.closerId));
    const conn = mine ?? teamWide ?? null;

    return {
      connected: !!conn,
      connectionId: conn?._id ?? null,
      // Whether this closer connected it, or it came with the company account.
      connectedBySomeoneElse: !mine && !!teamWide,
      lastSyncedAt: conn?.lastSyncedAt ?? null,
      errorMessage: conn?.status === "error" ? conn.errorMessage : null,
      fathomEmail: closer?.fathomEmail ?? null,
      email: closer?.email ?? null,
      // Recordings arriving from an address nobody here owns. Shown so it can
      // be fixed, because the symptom otherwise is just missing calls.
      unmatchedRecorders: conn?.unmatchedRecorders ?? [],
      outcomeRemindersEnabled: closer?.outcomeRemindersEnabled === true,
    };
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

/**
 * Turn a connection off.
 *
 * Keeps the row rather than deleting it. The calls it already brought in stay
 * on the board, and a customer who reconnects next week should see continuity
 * rather than a blank slate. The key is cleared, so a revoked connection can't
 * quietly keep working.
 */
export const revokeConnection = internalMutation({
  args: { connectionId: v.id("fathomConnections") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.connectionId);
    if (!c) return;
    await ctx.db.patch(args.connectionId, {
      status: "revoked",
      apiKey: "",
      webhookId: undefined,
      webhookSecret: undefined,
    });
  },
});

/**
 * Remember a Fathom account we couldn't match to anyone on the team.
 *
 * Capped at twenty. This is a prompt for a human to fix something, not a log —
 * and an unbounded array on a row we read constantly is how documents quietly
 * grow until a query starts failing.
 */
export const noteUnmatchedRecorder = internalMutation({
  args: { teamId: v.id("teams"), email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!email) return;
    const all = await ctx.db
      .query("fathomConnections")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const conn = all.find((c) => c.status === "active" && !c.closerId) ?? all.find((c) => c.status === "active");
    if (!conn) return;

    const seen = [...(conn.unmatchedRecorders ?? [])];
    const hit = seen.find((u) => u.email === email);
    if (hit) {
      hit.count += 1;
      hit.lastSeenAt = Date.now();
    } else {
      if (seen.length >= 20) return;
      seen.push({ email, count: 1, lastSeenAt: Date.now() });
    }
    await ctx.db.patch(conn._id, { unmatchedRecorders: seen });
  },
});

/** Once the closer is added or their Fathom email set, stop nagging. */
export const clearUnmatchedRecorder = internalMutation({
  args: { teamId: v.id("teams"), email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const all = await ctx.db
      .query("fathomConnections")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    for (const c of all) {
      if (!c.unmatchedRecorders?.length) continue;
      const kept = c.unmatchedRecorders.filter((u) => u.email !== email);
      if (kept.length !== c.unmatchedRecorders.length) {
        await ctx.db.patch(c._id, { unmatchedRecorders: kept });
      }
    }
  },
});

export const markSynced = internalMutation({
  args: { connectionId: v.id("fathomConnections") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, { lastSyncedAt: Date.now() });
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

    // If this is the address we'd been failing to place, the problem is solved
    // — stop asking about it. Their past calls still need a re-sync to attach,
    // which the "check for new meetings" button does.
    const closer = await ctx.db.get(args.closerId);
    if (closer) {
      const conns = await ctx.db
        .query("fathomConnections")
        .withIndex("by_team", (q) => q.eq("teamId", closer.teamId))
        .collect();
      for (const c of conns) {
        if (!c.unmatchedRecorders?.length) continue;
        const kept = c.unmatchedRecorders.filter((u) => u.email !== email);
        if (kept.length !== c.unmatchedRecorders.length) {
          await ctx.db.patch(c._id, { unmatchedRecorders: kept });
        }
      }
    }
    return { success: true };
  },
});

/**
 * Every live Fathom connection, for the reconciliation sweep.
 *
 * Returns the key, so this must stay internal — it exists only to be called
 * by the sweep, never by anything that reaches a browser.
 */
export const listActiveConnections = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("fathomConnections").collect();
    return all
      .filter((c) => c.status === "active" && !!c.apiKey)
      .map((c) => ({ connectionId: c._id, teamId: c.teamId }));
  },
});

/** The closer choosing whether we may email them. Theirs alone to set. */
export const setOutcomeReminders = internalMutation({
  args: { closerId: v.id("closers"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.closerId, {
      outcomeRemindersEnabled: args.enabled,
    });
    return { success: true };
  },
});
