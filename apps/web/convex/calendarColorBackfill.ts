// ============================================================================
// One-off: stamp today's Google colors onto older calendar events.
//
// The live sync only looks 7 days back, and the color fields it now writes
// start empty on everything older. This walks a team's closers' calendars
// further back (35 days by default), in 7-day chunks and Google pages, and
// fills in eventColorId / googleUpdatedAt / colorFirstObservedAt on rows we
// already hold. What it deliberately does NOT do:
//   - insert calendar events (a booking we never synced would change the
//     measured Booked counts retroactively);
//   - set colorChangedAt (we did not watch any change happen — the check-ins
//     card reads these rows as "unverified", which is the truth);
//   - touch rows the live sync has already observed (fresher than us).
// Idempotent: run it twice and the second run patches nothing.
//
//   npx convex run --prod calendarColorBackfill:backfillTeamColors \
//     '{"teamId":"<team>","daysBack":35}'
// ============================================================================

import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { lastColorHistoryFor } from "./calendarColorHistory";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHUNK_MS = 7 * DAY_MS;
/** Live sync already covers the last 7 days. */
const LIVE_WINDOW_MS = 7 * DAY_MS;
const DEFAULT_DAYS_BACK = 35;
const MAX_DAYS_BACK = 90;
/** ≤500 items × 2 indexed lookups keeps a page well inside the 4,096-query limit. */
const PAGE_SIZE = 500;

interface BackfillTotals {
  closers: number;
  pages: number;
  patched: number;
  historyRows: number;
  alreadyObserved: number;
  unmatched: number;
  failures: number;
}

interface PageResult {
  patched: number;
  historyRows: number;
  alreadyObserved: number;
  unmatched: number;
}

interface BackfillItem {
  uid: string;
  title?: string;
  colorId?: string;
  updatedAt?: number;
  startTime?: number;
}

interface GoogleItem {
  id: string;
  status?: string;
  summary?: string;
  colorId?: string;
  updated?: string;
  start?: { dateTime?: string; date?: string };
}

function toMs(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
}

export const backfillTeamColors = internalAction({
  args: {
    teamId: v.id("teams"),
    daysBack: v.optional(v.number()),
    /** Re-run for one closer only. */
    closerId: v.optional(v.id("closers")),
  },
  // Explicit types throughout: an action that calls functions in its own
  // module trips TypeScript's circular-inference check otherwise.
  handler: async (ctx, args): Promise<BackfillTotals> => {
    const daysBack = Math.max(8, Math.min(args.daysBack ?? DEFAULT_DAYS_BACK, MAX_DAYS_BACK));
    const now = Date.now();
    const windowStart = now - daysBack * DAY_MS;
    const windowEnd = now - LIVE_WINDOW_MS;

    const allClosers: Doc<"closers">[] = await ctx.runQuery(
      internal.googleCalendar.getClosersWithGoogleCalendar,
      {},
    );
    const closers: Doc<"closers">[] = allClosers.filter(
      (c: Doc<"closers">) =>
        String(c.teamId) === String(args.teamId) &&
        (!args.closerId || String(c._id) === String(args.closerId)),
    );

    const totals: BackfillTotals = {
      closers: closers.length,
      pages: 0,
      patched: 0,
      historyRows: 0,
      alreadyObserved: 0,
      unmatched: 0,
      failures: 0,
    };

    for (const closer of closers) {
      try {
        const token: string = await ctx.runAction(
          internal.googleCalendar.refreshAccessToken,
          { closerId: closer._id },
        );
        const subs: Doc<"closerCalendarSubscriptions">[] = await ctx.runQuery(
          internal.closerCalendarSubscriptions.getEnabledSubscriptionsForCloserInternal,
          { closerId: closer._id },
        );
        for (const sub of subs) {
          for (let from = windowStart; from < windowEnd; from += CHUNK_MS) {
            const to = Math.min(from + CHUNK_MS, windowEnd);
            let pageToken: string | undefined;
            do {
              const params = new URLSearchParams({
                timeMin: new Date(from).toISOString(),
                timeMax: new Date(to).toISOString(),
                singleEvents: "true",
                maxResults: String(PAGE_SIZE),
                fields: "items(id,status,summary,colorId,updated,start),nextPageToken",
              });
              if (pageToken) params.set("pageToken", pageToken);
              const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(sub.googleCalendarId)}/events?${params}`;
              const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
              if (!res.ok) {
                throw new Error(`Google ${res.status} for ${closer.name} / ${sub.googleCalendarId}`);
              }
              const data = (await res.json()) as { items?: GoogleItem[]; nextPageToken?: string };
              const items: BackfillItem[] = (data.items ?? [])
                .filter((it) => it.status !== "cancelled")
                .map((it) => ({
                  uid: it.id,
                  title: it.summary,
                  colorId: it.colorId || undefined,
                  updatedAt: toMs(it.updated),
                  startTime: toMs(it.start?.dateTime ?? it.start?.date),
                }));
              if (items.length > 0) {
                const r: PageResult = await ctx.runMutation(internal.calendarColorBackfill.applyBackfillPage, {
                  closerId: closer._id,
                  teamId: args.teamId,
                  subscriptionId: sub._id,
                  items,
                });
                totals.patched += r.patched;
                totals.historyRows += r.historyRows;
                totals.alreadyObserved += r.alreadyObserved;
                totals.unmatched += r.unmatched;
              }
              totals.pages += 1;
              pageToken = data.nextPageToken;
            } while (pageToken);
          }
        }
      } catch (err) {
        totals.failures += 1;
        console.error(`[ColorBackfill] ${closer.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return totals;
  },
});

export const applyBackfillPage = internalMutation({
  args: {
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    subscriptionId: v.id("closerCalendarSubscriptions"),
    items: v.array(
      v.object({
        uid: v.string(),
        title: v.optional(v.string()),
        colorId: v.optional(v.string()),
        updatedAt: v.optional(v.number()),
        startTime: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<PageResult> => {
    const now = Date.now();
    const out: PageResult = { patched: 0, historyRows: 0, alreadyObserved: 0, unmatched: 0 };
    for (const item of args.items) {
      const copies = await ctx.db
        .query("calendarEvents")
        .withIndex("by_closer_and_uid", (q) =>
          q.eq("closerId", args.closerId).eq("uid", item.uid),
        )
        .take(10);
      const row = copies.find((c) => String(c.subscriptionId) === String(args.subscriptionId));
      if (!row) {
        out.unmatched += 1;
        continue;
      }
      // The live sync got here first; its stamps are the honest ones.
      if (row.colorFirstObservedAt !== undefined) {
        out.alreadyObserved += 1;
        continue;
      }
      await ctx.db.patch(row._id, {
        eventColorId: item.colorId,
        colorFirstObservedAt: now,
        ...(item.updatedAt !== undefined ? { googleUpdatedAt: item.updatedAt } : {}),
      });
      out.patched += 1;

      if (item.colorId === undefined) continue;
      const last = await lastColorHistoryFor(ctx, args.closerId, item.uid);
      if (last) continue; // a trail already exists; don't rewrite history
      await ctx.db.insert("calendarEventColorHistory", {
        teamId: args.teamId,
        closerId: args.closerId,
        subscriptionId: args.subscriptionId,
        eventUid: item.uid,
        calendarEventId: row._id as Id<"calendarEvents">,
        title: item.title ?? row.title,
        eventStartTime: item.startTime ?? row.startTime,
        colorId: item.colorId,
        previousColorId: undefined,
        observedAt: now,
        googleUpdatedAt: item.updatedAt,
        source: "backfill",
      });
      out.historyRows += 1;
    }
    return out;
  },
});
