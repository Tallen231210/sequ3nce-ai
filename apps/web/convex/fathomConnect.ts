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
import { internalAction, internalMutation } from "./_generated/server";
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

/** Just enough of a listed meeting to decide whether we already have it. */
interface FathomListItem {
  recording_id?: number | string;
  [key: string]: unknown;
}

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
    // Transcript only. We generate our own summary and analysis from it, so
    // asking Fathom for theirs adds nothing — and if their delivery waits for
    // every requested piece to finish generating, requesting more can only
    // make a call arrive later.
    const payload = {
      destination_url: destination,
      include_transcript: true,
    };

    // Ask what this account actually has, rather than sending the team scopes
    // and treating a rejection as the answer.
    //
    // Fathom does NOT reject a scope the account can't satisfy — it accepts
    // the request and returns a webhook. So the old try-team-then-fall-back
    // never fell back, and an individual account ended up registered with
    // `my_shared_with_team_recordings`, a Team-plan-only trigger. That webhook
    // then delivered nothing at all: verified against a real personal account
    // where a recording sat undelivered for 25 minutes with no attempt ever
    // reaching us, and re-registering with personal scopes alone was the fix.
    //
    // An empty /teams list is the signal. It costs one cheap request at
    // connect time and turns a silent, invisible failure into a decision.
    const teamsRes = await fathom(apiKey, "/teams");
    const teamsBody = teamsRes.body as { items?: unknown[] } | null;
    const hasTeams = teamsRes.ok && (teamsBody?.items?.length ?? 0) > 0;
    const scope = hasTeams ? "team" : "personal";

    const created = await fathom(apiKey, "/webhooks", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        triggered_for: hasTeams ? TEAM_SCOPES : SOLO_SCOPES,
      }),
    });
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

    // Bring in this month's calls in the background. Scheduled rather than
    // awaited: it can take a while on a busy account, and a customer who has
    // just pasted a key should see "connected" immediately, not a spinner.
    await ctx.scheduler.runAfter(0, internal.fathomConnect.backfillMonthToDate, {
      teamId: args.teamId,
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
 * Bring in this calendar month's calls when someone connects.
 *
 * Month-to-date rather than everything, and rather than nothing.
 *
 * Nothing means a closer connects and stares at an empty app, with no way to
 * see the thing working. Everything is unbounded — a heavy account could be
 * thousands of calls nobody will ever look at, and it makes the first
 * impression a progress bar.
 *
 * A month gives every closer a complete first month whenever they join: the
 * backfill covers the 1st up to today, and live delivery covers today to the
 * month's end. Join on the 5th or the 26th and July is still a whole July.
 *
 * What it does NOT give them is comparable numbers, and that distinction is
 * the reason `historical` exists. Someone who joined on the 26th has 25 days of
 * calls with no outcome recorded against them; someone who joined on the 5th
 * has almost none. Counting both would make the late joiner look far worse for
 * a reason that has nothing to do with selling. So these arrive as history —
 * visible, searchable, coachable — and start counting only once a human says
 * how the call went.
 *
 * The window is UTC. A call late at night on the 1st in a western timezone
 * could fall outside it; that is a rounding error on a convenience feature,
 * not worth per-team timezone handling.
 */
export const backfillMonthToDate = internalAction({
  args: {
    teamId: v.id("teams"),
    /**
     * Override the window. Defaults to the 1st of the current month, which is
     * what connecting uses. Exists so the reconciliation sweep can reuse this
     * to re-check a narrow recent window without a second implementation.
     */
    sinceIso: v.optional(v.string()),
    /**
     * Whether these arrive as history. True for the connect-time backfill.
     * MUST be false for the reconciliation sweep: those are live calls the
     * webhook failed to deliver minutes ago, and treating them as history
     * would keep genuine sales calls out of the numbers forever — the exact
     * silent loss the sweep exists to prevent.
     */
    historical: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; imported: number; pages: number; error?: string }> => {
    const conn = await ctx.runQuery(
      internal.fathomConnections.getConnectionForTeam,
      { teamId: args.teamId },
    );
    if (!conn?.apiKey) {
      return { success: false, imported: 0, pages: 0, error: "Not connected to Fathom." };
    }

    const now = new Date();
    const since =
      args.sinceIso ??
      new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
      ).toISOString();

    let cursor: string | null = null;
    let imported = 0;
    let pages = 0;

    // A hard stop, not a target. Without it a misbehaving cursor loops until
    // the action times out, and the failure would look like a hang.
    const MAX_PAGES = 20;

    while (pages < MAX_PAGES) {
      const qs = new URLSearchParams({
        include_transcript: "true",
        created_after: since,
      });
      if (cursor) qs.set("cursor", cursor);

      const res = await fathom(conn.apiKey, `/meetings?${qs.toString()}`);
      if (!res.ok) {
        // Report what we managed rather than throwing it all away. These are
        // heavy requests and Fathom drops to five a minute when busy, so
        // hitting a limit part-way through is a normal Tuesday.
        return {
          success: imported > 0,
          imported,
          pages,
          error: `Fathom returned ${res.status} after ${imported} calls. Try again shortly.`,
        };
      }

      const payload = res.body as { items?: unknown[]; data?: unknown[]; next_cursor?: string | null };
      const meetings = payload.items ?? payload.data ?? [];
      pages++;

      for (const meeting of meetings) {
        // Sequentially. Each is a write transaction against the same table and
        // firing a page of them at once is how concurrent chains OCC-thrash
        // each other — the lesson from the setter-data sync work.
        const out = await ctx.runMutation(internal.fathom.ingestMeeting, {
          teamId: args.teamId,
          meeting,
          historical: args.historical !== false,
        });
        if (out.status === "created") imported++;
      }

      cursor = payload.next_cursor ?? null;
      if (!cursor || meetings.length === 0) break;
    }

    await ctx.runMutation(internal.fathomConnections.markSynced, {
      connectionId: conn._id as Id<"fathomConnections">,
    });
    return { success: true, imported, pages };
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

/**
 * Catch the calls the webhook didn't deliver.
 *
 * Fathom pushes each meeting to us once when it finishes. If we're mid-deploy,
 * or their delivery fails, or the request times out, that call is simply gone —
 * and nobody finds out, because the symptom is a call that never appears.
 * Silent loss is the worst kind: the closer assumes it recorded, the manager
 * sees a smaller number, and there is nothing to debug from.
 *
 * So every few hours we ask Fathom for the last few days and re-ingest. Ingest
 * is idempotent on the recording id, so anything we already have is updated
 * rather than duplicated, and anything we missed quietly appears.
 *
 * Three days rather than one: a delivery lost during a weekend outage still
 * needs to be caught on Monday, and re-checking a call we already hold costs
 * one page of a rate limit we aren't otherwise using.
 *
 * NOT marked historical. These are live calls that should have arrived through
 * the webhook minutes ago, not history pulled in at connect time — treating
 * them as history would quietly keep genuine sales calls out of the numbers.
 */
/**
 * Finish the work that never completed.
 *
 * The ingest queues a summary and analysis whenever they're missing, which is
 * meant to make a failure self-healing "on the next sync". For a call we
 * already have there is no next sync: the poller skips every recording id it
 * knows, and the daily reconcile only re-ingests the last three days. So an
 * analysis that failed once is blank forever, and the only symptom is an empty
 * tab on a tier that is largely sold on that tab.
 *
 * Two different repairs, deliberately separated by cost. A missing transcript
 * needs a rate-limited Fathom request. A missing summary or analysis does not —
 * we already hold the transcript, so it's just work to re-queue.
 *
 * Bounded per run; whatever's left is picked up on the next pass.
 */
export const repairMissingTranscripts = internalAction({
  args: { teamId: v.id("teams"), limit: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    checked: number;
    transcriptsFetched: number;
    aiRequeued: number;
    unavailable: number;
  }> => {
    const conn = await ctx.runQuery(
      internal.fathomConnections.getConnectionForTeam,
      { teamId: args.teamId },
    );
    if (!conn?.apiKey) {
      return { checked: 0, transcriptsFetched: 0, aiRequeued: 0, unavailable: 0 };
    }

    const pending = await ctx.runQuery(internal.fathom.listCallsNeedingAiWork, {
      teamId: args.teamId,
      limit: args.limit ?? 10,
    });

    let transcriptsFetched = 0;
    let aiRequeued = 0;
    let unavailable = 0;

    for (const item of pending) {
      // Already have the words — nothing to buy from Fathom, just re-queue.
      if (!item.needsTranscript) {
        const out = await ctx.runMutation(internal.fathom.queueMissingAiWork, {
          callId: item.callId,
          teamId: args.teamId,
        });
        if (out.queuedSummary || out.queuedAnalysis) aiRequeued++;
        continue;
      }

      const res = await fathom(
        conn.apiKey,
        `/recordings/${item.recordingId}/transcript`,
      );
      if (!res.ok) {
        // A rate limit here is expected and not worth failing the run over —
        // the next pass picks it up.
        console.warn(
          `[fathom] transcript ${item.recordingId} returned ${res.status}`,
        );
        unavailable++;
        continue;
      }

      const transcript = (res.body as { transcript?: unknown[] })?.transcript;
      if (!transcript || transcript.length === 0) {
        // Fathom has the recording but no transcript for it. Nothing to fix.
        unavailable++;
        continue;
      }

      // Storing it queues the summary and analysis on the way through.
      const out = await ctx.runMutation(internal.fathom.storeTranscriptForCall, {
        callId: item.callId,
        teamId: args.teamId,
        transcript,
      });
      if (out.stored) transcriptsFetched++;
      else unavailable++;
    }

    return {
      checked: pending.length,
      transcriptsFetched,
      aiRequeued,
      unavailable,
    };
  },
});

export const reconcile = internalAction({
  args: {},
  handler: async (ctx): Promise<{ teams: number; recovered: number }> => {
    const connections = await ctx.runQuery(
      internal.fathomConnections.listActiveConnections,
      {},
    );

    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    let recovered = 0;

    for (const conn of connections) {
      // Sequentially across teams. These are Fathom's heavy requests, capped
      // as low as five a minute when they are busy, and firing every customer
      // at once would rate-limit us out of our own reconciliation.
      try {
        const result = await ctx.runAction(
          internal.fathomConnect.backfillMonthToDate,
          { teamId: conn.teamId, sinceIso: since, historical: false },
        );
        recovered += result.imported;
        if (result.imported > 0) {
          // Worth a log line. If this is ever consistently non-zero, the
          // webhook is broken and the sweep is quietly papering over it.
          console.warn(
            `[fathom] reconcile recovered ${result.imported} missed call(s) ` +
              `for team ${conn.teamId} — webhook may not be delivering`,
          );
        }
        // A recovered call is no use with empty tabs. Same sweep, because a
        // missing transcript has exactly the same shape as a missed call:
        // nothing errors, nothing retries, and the only symptom is a customer
        // eventually noticing the tier they pay for isn't producing anything.
        const fixed = await ctx.runAction(
          internal.fathomConnect.repairMissingTranscripts,
          { teamId: conn.teamId, limit: 10 },
        );
        if (fixed.transcriptsFetched > 0 || fixed.aiRequeued > 0) {
          console.warn(
            `[fathom] reconcile completed unfinished work for team ` +
              `${conn.teamId}: ${fixed.transcriptsFetched} transcript(s), ` +
              `${fixed.aiRequeued} summary/analysis re-queued`,
          );
        }
      } catch (error) {
        // One team's expired key must not stop the sweep for everyone else.
        console.error(`[fathom] reconcile failed for team ${conn.teamId}:`, error);
      }
    }

    return { teams: connections.length, recovered };
  },
});

/**
 * Check for new recordings, often.
 *
 * Fathom's webhook never delivered. Three webhooks against a real account —
 * the last two shown correctly in Fathom's own settings UI — produced not one
 * delivery attempt across two recordings and forty minutes. Our endpoint was
 * answering and verifying the whole time. So we stopped waiting to be told and
 * started asking.
 *
 * Polling gets a bad name from the version that re-downloads everything. This
 * one doesn't. The list call without transcripts is 2KB and a fifth of a
 * second, and it sits on Fathom's standard 60/min limit rather than the heavy
 * one. Only a recording we've never seen costs a transcript fetch, and those
 * happen as often as a closer finishes a call — which is to say, rarely.
 *
 * Steady state per team is therefore one small request every few minutes, and
 * the expensive work scales with actual calls rather than with clock ticks.
 */
export const pollForNewMeetings = internalAction({
  args: {},
  handler: async (ctx): Promise<{ teams: number; imported: number }> => {
    const connections = await ctx.runQuery(
      internal.fathomConnections.listActiveConnections,
      {},
    );

    // Two hours, not five minutes. The window has to survive a deploy, a
    // Fathom blip, or a few missed runs — anything shorter turns a brief
    // outage into permanently missing calls, which is the failure this exists
    // to prevent. Re-seeing a call we already hold costs one array lookup.
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    let imported = 0;

    for (const conn of connections) {
      try {
        const full = await ctx.runQuery(
          internal.fathomConnections.getConnectionForTeam,
          { teamId: conn.teamId },
        );
        if (!full?.apiKey) continue;

        // Cheap: no transcripts, so this is the standard rate limit.
        const listed = await fathom(
          full.apiKey,
          `/meetings?created_after=${encodeURIComponent(since)}`,
        );
        if (!listed.ok) continue;

        const body = listed.body as { items?: FathomListItem[] };
        const meetings = body.items ?? [];
        if (meetings.length === 0) continue;

        const ids = meetings
          .map((m) => String(m.recording_id ?? ""))
          .filter(Boolean);
        const known = await ctx.runQuery(internal.fathom.whichExist, {
          recordingIds: ids,
        });
        const knownSet = new Set(known);

        for (const meeting of meetings) {
          const id = String(meeting.recording_id ?? "");
          if (!id || knownSet.has(id)) continue;

          // Only now do we spend a heavy request, and only for this one.
          const t = await fathom(full.apiKey, `/recordings/${id}/transcript`);
          const transcript = t.ok
            ? (t.body as { transcript?: unknown[] })?.transcript
            : undefined;

          const out = await ctx.runMutation(internal.fathom.ingestMeeting, {
            teamId: conn.teamId,
            meeting: { ...meeting, transcript: transcript ?? null },
          });
          if (out.status === "created") imported++;
        }
      } catch (error) {
        // One team's expired key must not stop everyone else's calls arriving.
        console.error(`[fathom] poll failed for team ${conn.teamId}:`, error);
      }
    }

    return { teams: connections.length, imported };
  },
});


/**
 * Remove a team's Fathom-imported calls — the undo for a connection that
 * should never have been allowed. Refuses while a connection is still
 * active (disconnect first, or the webhook just refills the table), and
 * dryRun reports what it WOULD delete.
 */
export const purgeTeamFathomImport = internalMutation({
  args: { teamId: v.id("teams"), dryRun: v.boolean() },
  handler: async (ctx, args) => {
    const conns = await ctx.db
      .query("fathomConnections")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    if (conns.some((c) => c.status === "active")) {
      throw new Error("Disconnect the Fathom connection first — an active webhook would refill what this deletes.");
    }
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .take(3000);
    const fathomCalls = calls.filter((c) => c.source === "fathom");
    const sample = fathomCalls.slice(0, 5).map((c) => ({
      prospectName: c.prospectName ?? null,
      createdAt: new Date(c.createdAt).toISOString(),
      status: c.status,
    }));
    if (args.dryRun) {
      return { wouldDelete: fathomCalls.length, sample };
    }
    let contentRows = 0;
    for (const c of fathomCalls) {
      const contents = await ctx.db
        .query("callContent")
        .withIndex("by_call", (q) => q.eq("callId", c._id))
        .collect();
      for (const row of contents) {
        await ctx.db.delete(row._id);
        contentRows++;
      }
      await ctx.db.delete(c._id);
    }
    return { deleted: fathomCalls.length, contentRows, sample };
  },
});
