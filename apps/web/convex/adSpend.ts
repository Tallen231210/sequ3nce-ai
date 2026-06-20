"use node";

// ============================================================================
// Ad Spend ingestion — Phase 1 Closer Unit Economics.
//
// Pulls daily ad spend from external sources and upserts into the
// adSpendDaily table. Joined to Hyros's adSource.adSourceId field in
// getCloserRoi to compute per-closer ROI.
//
// Source priority:
//   1. Meta Marketing API (Facebook + Instagram) — current implementation
//   2. Google Ads API — future
//   3. Manual upload — future fallback
//
// Hyros does NOT expose spend via REST (confirmed via 49-endpoint spike
// June 2026 — see memory: hyros-api-config). They give us attribution
// data and ad metadata; spend has to come from the ad platforms directly.
//
// Auth model (v1 — keep simple, ship faster):
//   - Manager generates a User Access Token via Graph API Explorer with
//     ads_read permission
//   - Pastes into Settings UI → encrypted via lib/encrypt → stored on
//     teams.metaAdsAccessToken
//   - Token expires every 60 days; metaAdsTokenExpiresAt drives a
//     warning banner that prompts re-paste
//   - Full OAuth flow + App Review is a future enhancement
// ============================================================================

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { decryptApiKey } from "./lib/encrypt";

// Meta Marketing API base. v18.0+ stable; we use the latest LTS.
const META_GRAPH_BASE = "https://graph.facebook.com/v21.0";

interface MetaInsightRow {
  ad_id: string;
  ad_name?: string;
  date_start: string;          // "YYYY-MM-DD"
  spend?: string;              // returned as string
  impressions?: string;
  clicks?: string;
  account_id?: string;
}

export const fetchAndUpsertMetaSpend = internalAction({
  args: {
    teamId: v.id("teams"),
    rangeStart: v.string(),    // "YYYY-MM-DD"
    rangeEnd: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    fetched: number;
    upserted: number;
    error?: string;
  }> => {
    const team: { metaAccessToken?: string; metaAdAccountId?: string } | null =
      await ctx.runQuery(internal.adSpendInternal.getMetaCredentials, {
        teamId: args.teamId,
      });
    if (!team?.metaAccessToken || !team?.metaAdAccountId) {
      return { fetched: 0, upserted: 0, error: "Meta not connected" };
    }
    const token = decryptApiKey(team.metaAccessToken);
    const adAccountId = team.metaAdAccountId;

    // Meta's Insights endpoint: per-ad daily breakdown. The level=ad
    // param keys results to individual ad creatives (matches Hyros's
    // adSource.adSourceId). time_increment=1 = daily.
    const fields = [
      "ad_id",
      "ad_name",
      "spend",
      "impressions",
      "clicks",
      "date_start",
      "account_id",
    ].join(",");
    const url =
      `${META_GRAPH_BASE}/${adAccountId}/insights` +
      `?level=ad&time_increment=1` +
      `&time_range=${encodeURIComponent(
        JSON.stringify({ since: args.rangeStart, until: args.rangeEnd }),
      )}` +
      `&fields=${fields}` +
      `&limit=500` +
      `&access_token=${encodeURIComponent(token)}`;

    let fetched = 0;
    let upserted = 0;
    let nextUrl: string | null = url;

    try {
      while (nextUrl) {
        const resp = await fetch(nextUrl);
        if (!resp.ok) {
          const text = await resp.text();
          await ctx.runMutation(internal.adSpendInternal.recordMetaSyncError, {
            teamId: args.teamId,
            error: `Meta API ${resp.status}: ${text.slice(0, 200)}`,
          });
          return {
            fetched,
            upserted,
            error: `Meta API ${resp.status}`,
          };
        }
        const body: {
          data: MetaInsightRow[];
          paging?: { next?: string };
        } = await resp.json();
        const rows = body.data ?? [];
        fetched += rows.length;

        for (const row of rows) {
          const spendCents = Math.round(parseFloat(row.spend ?? "0") * 100);
          const upserted_ok = await ctx.runMutation(
            internal.adSpendInternal.upsertSpendDay,
            {
              teamId: args.teamId,
              date: row.date_start,
              platform: "facebook",
              adAccountId: row.account_id,
              adSourceId: row.ad_id,
              sourceLinkName: row.ad_name,
              spendCents,
              impressions: row.impressions ? parseInt(row.impressions, 10) : undefined,
              clicks: row.clicks ? parseInt(row.clicks, 10) : undefined,
              source: "meta_ads",
            },
          );
          if (upserted_ok) upserted += 1;
        }

        nextUrl = body.paging?.next ?? null;
      }

      await ctx.runMutation(internal.adSpendInternal.recordMetaSyncSuccess, {
        teamId: args.teamId,
      });
      return { fetched, upserted };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.adSpendInternal.recordMetaSyncError, {
        teamId: args.teamId,
        error: msg.slice(0, 200),
      });
      return { fetched, upserted, error: msg };
    }
  },
});

// V8 helpers (internalQuery / internalMutation) live in adSpendInternal.ts —
// Convex requires non-Node runtime for queries/mutations.

/**
 * Daily cron entry — iterates teams with Meta connected and pulls
 * yesterday + today's spend. The 2-day window catches Meta's typical
 * late-attribution adjustments.
 */
export const runDailyMetaSync = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ teamsChecked: number; teamsSynced: number }> => {
    const teams = (await ctx.runQuery(
      internal.adSpendInternal.listTeamsWithMetaConnected,
      {},
    )) as Array<Id<"teams">>;

    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    let synced = 0;
    for (const teamId of teams) {
      try {
        await ctx.runAction(internal.adSpend.fetchAndUpsertMetaSpend, {
          teamId,
          rangeStart: fmt(yesterday),
          rangeEnd: fmt(today),
        });
        synced += 1;
      } catch {
        // Errors are captured per-team via recordMetaSyncError. Continue
        // iterating so one bad team doesn't block the rest.
      }
    }
    return { teamsChecked: teams.length, teamsSynced: synced };
  },
});

/**
 * One-shot backfill action — for a team newly connecting Meta. Pulls
 * the last 90 days so the ROI dashboard has historical context.
 */
export const backfillMetaSpend = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (
    ctx,
    args,
  ): Promise<{ fetched: number; upserted: number; error?: string }> => {
    const today = new Date();
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return await ctx.runAction(internal.adSpend.fetchAndUpsertMetaSpend, {
      teamId: args.teamId,
      rangeStart: fmt(ninetyDaysAgo),
      rangeEnd: fmt(today),
    });
  },
});
