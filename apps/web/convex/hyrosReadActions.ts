"use node";

// ============================================================================
// Hyros Read Direction (Phase 5) — Node-runtime actions.
//
// Two responsibilities:
//   1. Poll backstop cron — finds setterLeads with hyrosAttributionStatus
//      pending and queries Hyros's GET /api/v1.0/leads/clicks per email.
//      Bounded per team per tick to respect Hyros's rate limits.
//   2. One-shot backfill action — for a team newly configured with Hyros,
//      iterate setterLeads where hyrosAttributionStatus is unset and
//      enqueue them for polling.
//
// The V8 helpers in hyrosRead.ts handle the DB writes. This file does
// the outbound HTTP work.
// ============================================================================

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { decryptApiKey } from "./lib/encrypt";
import { captureAndPersist } from "./lib/sentry";

// Hyros's actual API base path is /v1/api/v1.0/ (double v1 prefix). The
// OpenAPI spec at api-docs.hyros.com elides the outer /v1, which led to
// 404s before this was diagnosed live. Auth is via API-Key header, NOT
// Bearer (which the push side uses incorrectly — separate fix).
const HYROS_API_BASE = "https://api.hyros.com/v1/api/v1.0";
const POLL_PAGE_SIZE = 100;
const POLL_INTERVAL_BAILOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7d — older leads aren't polled
const POLL_PER_LEAD_TIMEOUT_MS = 8_000;

export const runHyrosAttributionPoll = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    teamsChecked: number;
    leadsPolled: number;
    leadsAttributed: number;
    teamsErrored: number;
  }> => {
    const teams = (await ctx.runQuery(
      internal.hyrosReadInternal.getTeamsWithHyrosEnabled,
      {},
    )) as Array<{ _id: Id<"teams">; hyrosApiKey?: string }>;
    let leadsPolled = 0;
    let leadsAttributed = 0;
    let teamsErrored = 0;
    for (const team of teams) {
      try {
        const r = await pollOneTeam(ctx, team._id, team.hyrosApiKey);
        leadsPolled += r.polled;
        leadsAttributed += r.attributed;
      } catch (err) {
        teamsErrored++;
        const transient = isTransientHyrosError(err);
        await captureAndPersist(err, async () => {}, {
          feature: transient ? "hyrosPoll.transient" : "hyrosPoll.hard",
          integration: "hyros",
          extra: { teamId: String(team._id) },
        });
      }
    }
    return { teamsChecked: teams.length, leadsPolled, leadsAttributed, teamsErrored };
  },
});

export const backfillAttributionForTeam = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ marked: number }> => {
    return ctx.runMutation(
      internal.hyrosReadInternal.markPendingForBackfill,
      { teamId: args.teamId },
    );
  },
});

async function pollOneTeam(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  teamId: Id<"teams">,
  encryptedApiKey: string | undefined,
): Promise<{ polled: number; attributed: number }> {
  if (!encryptedApiKey) return { polled: 0, attributed: 0 };

  const leads = (await ctx.runQuery(
    internal.hyrosReadInternal.fetchPendingLeads,
    { teamId, limit: POLL_PAGE_SIZE, bailoutBeforeMs: Date.now() - POLL_INTERVAL_BAILOUT_MS },
  )) as Array<{ id: Id<"setterLeads">; email: string }>;

  if (leads.length === 0) return { polled: 0, attributed: 0 };

  const apiKey = decryptApiKey(encryptedApiKey);
  let polled = 0;
  let attributed = 0;

  for (const lead of leads) {
    polled++;
    try {
      const result = await fetchHyrosAttribution(apiKey, lead.email);
      if (result === "not_found") {
        await ctx.runMutation(
          internal.hyrosReadInternal.markLeadNotFound,
          { leadId: lead.id },
        );
      } else if (result) {
        await ctx.runMutation(
          internal.hyrosReadInternal.applyPolledAttribution,
          {
            leadId: lead.id,
            firstSource: result.firstSource,
            lastSource: result.lastSource,
          },
        );
        attributed++;
      }
      // else null = transient, leave as pending for next tick
    } catch (err) {
      const transient = isTransientHyrosError(err);
      await captureAndPersist(err, async () => {}, {
        feature: transient ? "hyrosPoll.transient" : "hyrosPoll.parse",
        integration: "hyros",
        extra: { leadId: String(lead.id), email: lead.email },
      });
    }
  }
  return { polled, attributed };
}

async function fetchHyrosAttribution(
  apiKey: string,
  email: string,
): Promise<
  | { firstSource: any; lastSource: any }
  | "not_found"
  | null
> {
  // /leads endpoint (not /leads/clicks) — returns the lead with
  // firstSource + lastSource already resolved by Hyros's attribution
  // model. Cleaner than walking the raw click stream ourselves.
  const url = `${HYROS_API_BASE}/leads?emails=${encodeURIComponent(email)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), POLL_PER_LEAD_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers: {
        "API-Key": apiKey,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (resp.status === 404) return "not_found";
  if (resp.status === 401 || resp.status === 403) {
    throw new HyrosAuthError(`Hyros auth failed: ${resp.status}`);
  }
  if (!resp.ok) {
    if (resp.status >= 500 || resp.status === 429) return null; // transient
    throw new Error(`Hyros API ${resp.status} ${resp.statusText}`);
  }
  const body = await resp.json();
  // GET /leads returns { result: Array<Lead> } where each Lead has
  // firstSource + lastSource already resolved by Hyros's attribution
  // model. We pick the first match by email — Hyros dedupes contacts.
  const leads = Array.isArray(body?.result)
    ? body.result
    : Array.isArray(body)
      ? body
      : [];
  if (leads.length === 0) return "not_found";
  const lead = leads[0];
  if (!lead?.firstSource && !lead?.lastSource) return "not_found";
  return {
    firstSource: lead.firstSource,
    lastSource: lead.lastSource ?? lead.firstSource,
  };
}

class HyrosAuthError extends Error {}

function isTransientHyrosError(err: unknown): boolean {
  if (err instanceof HyrosAuthError) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /429|5\d\d|fetch failed|ECONNRESET|ETIMEDOUT|AbortError/i.test(msg);
}
