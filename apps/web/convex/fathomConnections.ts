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

    // Fathom is the Oversight plan's recording source — and no customer team
    // is on it today; every live team records with the Sequ3nce bot. Two
    // closers (CreateFreedom Aug 6, E2 Aug 21) have already found this button
    // and wired up personal Fathom accounts, which creates a second, poorer
    // pipeline for the same meetings (no live view, mixed sources, double
    // rows) that reads as breakage. Plan decides, no exceptions — the gate is
    // on connecting, existing connections keep syncing until revoked.
    const team = await ctx.db.get(args.teamId);
    const tier =
      (team as any)?.productTierOverride ?? (team as any)?.productTier;
    const availableOnPlan = tier === "oversight";

    // This closer once had their OWN connection and it's been revoked on a
    // plan that doesn't include Fathom: tell them once, in the app, instead
    // of letting the card silently vanish.
    const mineRevoked = all.some(
      (c) =>
        String(c.closerId) === String(args.closerId) && c.status === "revoked",
    );

    return {
      availableOnPlan,
      disconnectedByPlan: !availableOnPlan && !conn && mineRevoked,
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
      // Shown so an ignore is reversible. An invisible suppression rule is how
      // someone spends an afternoon wondering why a teammate's calls are
      // missing, when the answer is that a colleague dismissed them months ago.
      ignoredRecorders: Array.from(
        new Set(live.flatMap((c) => c.ignoredRecorders ?? [])),
      ),
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

    // Told once that this address isn't a closer, don't raise it again.
    //
    // Checked across every connection on the team, not just the one we're
    // about to write to: when each closer has their own key they can all see
    // the same shared recordings, and one person marking support staff as
    // "not a closer" shouldn't leave their teammates still being nagged.
    if (all.some((c) => (c.ignoredRecorders ?? []).includes(email))) return;

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

/**
 * "This address isn't one of our closers — stop telling me."
 *
 * Written to every connection on the team so the answer holds no matter which
 * one a future recording is noticed through, and so it survives a closer
 * disconnecting and reconnecting.
 *
 * Clears the outstanding notice at the same time, because a button that says
 * "ignore" and leaves the thing on screen reads as broken.
 */
export const ignoreRecorder = internalMutation({
  args: { teamId: v.id("teams"), email: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const email = args.email.trim().toLowerCase();
    if (!email) return { success: false };

    const all = await ctx.db
      .query("fathomConnections")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    for (const c of all) {
      const ignored = c.ignoredRecorders ?? [];
      const patch: Record<string, unknown> = {};

      if (!ignored.includes(email)) {
        // A ceiling, so a misconfigured workspace can't grow this without
        // bound. Twenty distinct non-closers is already a sign something else
        // is wrong.
        if (ignored.length >= 20) continue;
        patch.ignoredRecorders = [...ignored, email];
      }

      const kept = (c.unmatchedRecorders ?? []).filter((u) => u.email !== email);
      if (kept.length !== (c.unmatchedRecorders ?? []).length) {
        patch.unmatchedRecorders = kept;
      }

      if (Object.keys(patch).length > 0) await ctx.db.patch(c._id, patch);
    }

    return { success: true };
  },
});

/** Undo the above. The address starts being reported again if it recurs. */
export const unignoreRecorder = internalMutation({
  args: { teamId: v.id("teams"), email: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const email = args.email.trim().toLowerCase();
    if (!email) return { success: false };

    const all = await ctx.db
      .query("fathomConnections")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    for (const c of all) {
      const ignored = c.ignoredRecorders ?? [];
      if (!ignored.includes(email)) continue;
      await ctx.db.patch(c._id, {
        ignoredRecorders: ignored.filter((e) => e !== email),
      });
    }

    return { success: true };
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
