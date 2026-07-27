// ============================================================================
// Connecting and disconnecting a Fathom account.
//
// The customer pastes an API key; everything else happens here. We check the
// key works, register a webhook so Fathom pushes new meetings to us, and store
// the pair. No OAuth, no approval queue, no waiting on Fathom.
//
// One thing shapes this whole file: **Fathom has no way to list your
// webhooks.** There is a create, an update and a delete, and that is all. So
// the id we get back on creation is the only record that a webhook exists — if
// we lose it, that webhook fires at us forever and nobody can turn it off.
// Hence: store the id before anything else can fail, and always delete the old
// one before creating a new one.
// ============================================================================

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const API = "https://api.fathom.ai/external/v1";

/**
 * Which recordings Fathom should push to us.
 *
 * The scopes are not additive in the obvious way. On a Team plan
 * `my_recordings` silently EXCLUDES anything shared with a team, so asking for
 * it alone would miss most of a sales team's calls — exactly the ones we want.
 * We ask for everything and narrow only if Fathom refuses.
 */
const TEAM_SCOPES = [
  "my_recordings",
  "my_shared_with_team_recordings",
  "shared_external_recordings",
];
/** An individual Fathom account has no teams, and the team scopes are rejected. */
const SOLO_SCOPES = ["my_recordings", "shared_external_recordings"];

interface FathomError {
  status?: number;
  message?: string;
}

async function fathom(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Fathom returns an empty body on delete. Not an error.
  }
  return { ok: res.ok, status: res.status, body };
}

/**
 * Point a Fathom account at us.
 *
 * Safe to run again: reconnecting removes the previous webhook first, so a
 * customer who pastes a new key doesn't end up with two live webhooks both
 * delivering every meeting.
 */
export const connect = internalAction({
  args: {
    teamId: v.id("teams"),
    closerId: v.optional(v.id("closers")),
    apiKey: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; error?: string; scope?: string }> => {
    const apiKey = args.apiKey.trim();
    if (!apiKey) return { success: false, error: "Paste your Fathom API key first." };

    // 1. Does the key work? Ask for the cheapest thing there is. Failing here
    //    is by far the most likely outcome — a mistyped or expired key — and
    //    it should say so in words the customer can act on.
    const check = await fathom(apiKey, "/meetings?limit=1");
    if (!check.ok) {
      const msg = (check.body as FathomError)?.message ?? "";
      return {
        success: false,
        error:
          check.status === 401 || check.status === 403
            ? "Fathom didn't accept that key. Check you copied all of it, and that it hasn't been revoked."
            : `Fathom returned ${check.status}${msg ? `: ${msg}` : ""}`,
      };
    }

    // 2. Remove the webhook we registered last time, if any. Fathom can't list
    //    them, so an orphan here is permanent — worth doing before we make a
    //    second one, not after.
    const existing = await ctx.runQuery(
      internal.fathomConnections.getConnectionForTeam,
      { teamId: args.teamId },
    );
    if (existing?.webhookId) {
      await fathom(apiKey, `/webhooks/${existing.webhookId}`, { method: "DELETE" });
    }

    // 3. Register the new one. The team scopes fail on a personal Fathom
    //    account, which is a completely normal way for a closer to be set up,
    //    so fall back rather than treating it as an error.
    const destination = `${process.env.CONVEX_SITE_URL}/webhooks/fathom?team=${args.teamId}`;
    const payload = {
      destination_url: destination,
      include_transcript: true,
      include_summary: true,
      include_action_items: true,
    };

    let scope = "team";
    let created = await fathom(apiKey, "/webhooks", {
      method: "POST",
      body: JSON.stringify({ ...payload, triggered_for: TEAM_SCOPES }),
    });
    if (!created.ok) {
      scope = "personal";
      created = await fathom(apiKey, "/webhooks", {
        method: "POST",
        body: JSON.stringify({ ...payload, triggered_for: SOLO_SCOPES }),
      });
    }
    if (!created.ok) {
      const msg = (created.body as FathomError)?.message ?? "";
      return {
        success: false,
        error: `Fathom wouldn't accept the connection${msg ? `: ${msg}` : ` (${created.status})`}`,
      };
    }

    const hook = created.body as { id?: string | number; secret?: string };
    if (!hook?.id || !hook?.secret) {
      // Without the secret we cannot verify a single delivery, and without the
      // id we can never delete the webhook we just made. Neither is recoverable
      // later, so refuse rather than store a half-connection.
      return {
        success: false,
        error: "Fathom created the connection but didn't return its details. Try again.",
      };
    }

    await ctx.runMutation(internal.fathomConnections.saveConnection, {
      teamId: args.teamId,
      ...(args.closerId ? { closerId: args.closerId } : {}),
      apiKey,
      webhookId: String(hook.id),
      webhookSecret: String(hook.secret),
    });

    return { success: true, scope };
  },
});

/**
 * Stop receiving meetings.
 *
 * Deletes the webhook at Fathom's end first. If that fails we still clear our
 * side — a customer asking to disconnect must not be left connected because a
 * third party was down — but the webhook then delivers to an endpoint that no
 * longer recognises it, which the route already answers with a 404.
 */
export const disconnect = internalAction({
  args: { teamId: v.id("teams"), connectionId: v.id("fathomConnections") },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const conn = await ctx.runQuery(
      internal.fathomConnections.getConnectionForTeam,
      { teamId: args.teamId },
    );
    if (conn?.webhookId && conn.apiKey) {
      await fathom(conn.apiKey, `/webhooks/${conn.webhookId}`, { method: "DELETE" });
    }
    await ctx.runMutation(internal.fathomConnections.revokeConnection, {
      connectionId: args.connectionId,
    });
    return { success: true };
  },
});

/**
 * Pull recent meetings on demand.
 *
 * Not a backfill — that needs a queue, because Fathom allows as few as five
 * heavy requests a minute when they're busy. This is the small version: the
 * most recent page, so a customer who has just connected sees something
 * immediately instead of waiting for their next call to finish.
 */
export const syncRecent = internalAction({
  args: { teamId: v.id("teams"), limit: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; created: number; updated: number; skipped: number; error?: string }> => {
    const conn = await ctx.runQuery(
      internal.fathomConnections.getConnectionForTeam,
      { teamId: args.teamId },
    );
    if (!conn?.apiKey) {
      return { success: false, created: 0, updated: 0, skipped: 0, error: "Not connected to Fathom." };
    }

    const limit = Math.min(Math.max(args.limit ?? 25, 1), 50);
    const res = await fathom(
      conn.apiKey,
      `/meetings?include_transcript=true&limit=${limit}`,
    );
    if (!res.ok) {
      const msg = (res.body as FathomError)?.message ?? "";
      await ctx.runMutation(internal.fathomConnections.markConnectionError, {
        connectionId: conn._id as Id<"fathomConnections">,
        message: `list meetings failed (${res.status}) ${msg}`,
      });
      return { success: false, created: 0, updated: 0, skipped: 0, error: `Fathom returned ${res.status}` };
    }

    const payload = res.body as { items?: unknown[]; data?: unknown[] };
    const meetings = payload.items ?? payload.data ?? [];
    let created = 0,
      updated = 0,
      skipped = 0;

    for (const meeting of meetings) {
      // One at a time and never in parallel. Each of these is a write
      // transaction, and firing 50 at once at the same table is how we OCC
      // thrash ourselves — the lesson from the setter-data sync chains.
      const out = await ctx.runMutation(internal.fathom.ingestMeeting, {
        teamId: args.teamId,
        meeting,
      });
      if (out.status === "created") created++;
      else if (out.status === "updated") updated++;
      else skipped++;
    }

    await ctx.runMutation(internal.fathomConnections.markSynced, {
      connectionId: conn._id as Id<"fathomConnections">,
    });
    return { success: true, created, updated, skipped };
  },
});
