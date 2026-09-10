import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { dialAnswered } from "./lib/dialAnswered";

// ============================================================================
// Setter Data — daily rollup sidecar (setterDailyStats).
//
// Why: Convex caps a transaction at 32k documents scanned / 16 MiB read.
// Wide-range scorecards used to scan every setterLeadEvents row (40-80k per
// 90 days on the largest org). Rollups turn those scans into ≤ days×setters
// document reads, forever.
//
// Shape: one row per (team, UTC dayKey, setterId). setterId "" buckets
// unattributed dials so sum(rows) === true team totals. Per-setter rows keep
// OCC write contention per-dialer (a single team-day doc would make every
// concurrent GHL webhook conflict; a scheduled mutation that exhausts OCC
// retries throws WITHOUT re-running — lost events).
//
// Maintenance:
//   - live: bumpDailyStat() called transactionally inside recordCallEvent
//     (after its dedup early-return, so redeliveries can never double-count).
//   - backfill/repair: recountDay() writes ABSOLUTE per-day values from the
//     events table (idempotent; safe to re-run any time; OCC serializability
//     means a concurrent live insert forces the recount to retry and see it).
//   - backfillRollupsStep(): self-rescheduling walk (one day per transaction)
//     from the team's earliest event to today, then a firstDial-attribution
//     repair pass, then sets teams.setterRollupsBackfilledAt — the marker
//     computeScorecard gates on before trusting rollups.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKeyOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function dayStartMs(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00.000Z`);
}

export type DailyStatKind = "dials" | "connects" | "callsInbound" | "answered" | "smsOutbound";

type DailyCounts = Record<DailyStatKind, number>;
const zeroCounts = (): DailyCounts => ({ dials: 0, connects: 0, callsInbound: 0, answered: 0, smsOutbound: 0 });

/**
 * Transactional increment of one or more counters on one setter-day row —
 * called from recordCallEvent / recordSmsEvent inside the same mutation as
 * the event insert (atomic for GHL webhook dispatch and Close batch ingest
 * alike). One read, one write, however many kinds. Older rows predate the
 * `answered` / `smsOutbound` fields, so a missing counter reads as 0 here.
 */
export async function bumpDailyStats(
  ctx: any,
  teamId: Id<"teams">,
  occurredAt: number,
  setterId: string | undefined,
  kinds: DailyStatKind[],
): Promise<void> {
  if (kinds.length === 0) return;
  const dayKey = dayKeyOf(occurredAt);
  const sid = setterId ?? "";
  const existing = await ctx.db
    .query("setterDailyStats")
    .withIndex("by_team_day_setter", (q: any) =>
      q.eq("teamId", teamId).eq("dayKey", dayKey).eq("setterId", sid),
    )
    .first();
  if (existing) {
    const patch: Partial<DailyCounts> = {};
    for (const kind of kinds) patch[kind] = (existing[kind] ?? 0) + 1;
    await ctx.db.patch(existing._id, patch);
  } else {
    const row = zeroCounts();
    for (const kind of kinds) row[kind] += 1;
    await ctx.db.insert("setterDailyStats", { teamId, dayKey, setterId: sid, ...row });
  }
}

/** Single-counter form, kept for the existing call sites. */
export async function bumpDailyStat(
  ctx: any,
  teamId: Id<"teams">,
  occurredAt: number,
  setterId: string | undefined,
  kind: DailyStatKind,
): Promise<void> {
  await bumpDailyStats(ctx, teamId, occurredAt, setterId, [kind]);
}

const EVENT_TYPES: Array<{ type: string; kind: DailyStatKind }> = [
  { type: "dial_outbound", kind: "dials" },
  { type: "connected", kind: "connects" },
  { type: "call_inbound", kind: "callsInbound" },
  { type: "sms_outbound", kind: "smsOutbound" },
];

/**
 * Recount one UTC day from the events table and write ABSOLUTE values.
 * Idempotent — the backfill/repair primitive. One day of events is bounded
 * (a few thousand rows even for the largest org).
 */
async function recountDayImpl(
  ctx: any,
  teamId: Id<"teams">,
  dayKey: string,
): Promise<{ rows: number }> {
  const start = dayStartMs(dayKey);
  const end = start + DAY_MS;
  // `answered` is a predicate on dial rows (a person picked up), not an
  // event type, so it rides the dial_outbound scan.

  const counts = new Map<string, DailyCounts>();
  const bump = (sid: string, kind: DailyStatKind) => {
    const row = counts.get(sid) ?? zeroCounts();
    row[kind] += 1;
    counts.set(sid, row);
  };

  for (const { type, kind } of EVENT_TYPES) {
    const events: Doc<"setterLeadEvents">[] = await ctx.db
      .query("setterLeadEvents")
      .withIndex("by_team_and_type_and_time", (q: any) =>
        q.eq("teamId", teamId).eq("eventType", type).gte("occurredAt", start).lt("occurredAt", end),
      )
      .collect();
    for (const e of events) {
      bump(e.ghlUserId ?? "", kind);
      if (type === "dial_outbound" && dialAnswered(e.details)) bump(e.ghlUserId ?? "", "answered");
    }
  }

  const existing: Doc<"setterDailyStats">[] = await ctx.db
    .query("setterDailyStats")
    .withIndex("by_team_and_day", (q: any) =>
      q.eq("teamId", teamId).eq("dayKey", dayKey),
    )
    .collect();
  const existingBySetter = new Map(existing.map((r) => [r.setterId, r]));

  for (const [sid, c] of counts) {
    const row = existingBySetter.get(sid);
    if (row) {
      await ctx.db.patch(row._id, c);
      existingBySetter.delete(sid);
    } else {
      await ctx.db.insert("setterDailyStats", { teamId, dayKey, setterId: sid, ...c });
    }
  }
  // Rows for setters with zero events on this day (stale) — remove.
  for (const [, row] of existingBySetter) await ctx.db.delete(row._id);

  return { rows: counts.size };
}

export const recountDay = internalMutation({
  args: { teamId: v.id("teams"), dayKey: v.string() },
  handler: async (ctx, args) => recountDayImpl(ctx, args.teamId, args.dayKey),
});

/**
 * Recount a span of UTC days, one day per transaction, self-scheduling until
 * endDayKey. The way to backfill a NEW counter (answered, smsOutbound) for a
 * team without re-running the whole rollup backfill (which also repairs
 * leads and re-stamps setterRollupsBackfilledAt). Kick ONCE per team —
 * two concurrent chains OCC-thrash each other.
 *   npx convex run setterRollups:recountRange '{"teamId":"…","startDayKey":"2026-09-01","endDayKey":"2026-09-10"}' --prod
 */
export const recountRange = internalMutation({
  args: { teamId: v.id("teams"), startDayKey: v.string(), endDayKey: v.string() },
  handler: async (ctx, args): Promise<void> => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.startDayKey) || !/^\d{4}-\d{2}-\d{2}$/.test(args.endDayKey)) {
      throw new Error("day keys must be YYYY-MM-DD");
    }
    if (args.startDayKey > args.endDayKey) return;
    await recountDayImpl(ctx, args.teamId, args.startDayKey);
    const next = dayKeyOf(dayStartMs(args.startDayKey) + DAY_MS);
    if (next <= args.endDayKey) {
      await ctx.scheduler.runAfter(150, internal.setterRollups.recountRange, {
        teamId: args.teamId,
        startDayKey: next,
        endDayKey: args.endDayKey,
      });
    } else {
      console.log(`[rollups] recountRange complete for team ${args.teamId} (${args.endDayKey})`);
    }
  },
});

const BACKFILL_PHASE = v.union(v.literal("days"), v.literal("repair"));
// Small page: every lead on the page reads its event history in the SAME
// transaction, so 25 leads × a dense ~1k-event lead each stays well under
// the 32k-doc scan budget. (150-lead pages crashed mid-chain on a real
// team when a page of heavily-dialed leads exceeded the budget — and a
// crashed scheduled mutation kills the chain silently.)
const REPAIR_PAGE = 25;
// Per-lead event read cap: pathological contacts (test loops) can carry
// thousands of events; past this cap the min-scan is approximate for that
// one lead, which beats crashing the whole repair.
const REPAIR_EVENTS_CAP = 2_000;

/**
 * Self-rescheduling backfill: recount every day from the team's earliest
 * event to today (one day per transaction), then repair missing
 * firstDialByUserId attribution on leads (one page per transaction), then
 * set teams.setterRollupsBackfilledAt. Rerunnable.
 */
export const backfillRollupsStep = internalMutation({
  args: {
    teamId: v.id("teams"),
    phase: v.optional(BACKFILL_PHASE),
    dayCursor: v.optional(v.string()),
    leadCursor: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const phase = args.phase ?? "days";

    if (phase === "days") {
      let dayKey = args.dayCursor;
      if (!dayKey) {
        // Find the earliest event across the rolled-up types.
        let earliest: number | undefined;
        for (const { type } of EVENT_TYPES) {
          const first: Doc<"setterLeadEvents"> | null = await ctx.db
            .query("setterLeadEvents")
            .withIndex("by_team_and_type_and_time", (q: any) =>
              q.eq("teamId", args.teamId).eq("eventType", type),
            )
            .order("asc")
            .first();
          if (first && (earliest === undefined || first.occurredAt < earliest)) {
            earliest = first.occurredAt;
          }
        }
        if (earliest === undefined) {
          // No events at all — straight to repair (which will also no-op).
          await ctx.scheduler.runAfter(0, internal.setterRollups.backfillRollupsStep, {
            teamId: args.teamId,
            phase: "repair",
          });
          return;
        }
        dayKey = dayKeyOf(earliest);
      }

      await recountDayImpl(ctx, args.teamId, dayKey);

      const nextDayKey = dayKeyOf(dayStartMs(dayKey) + DAY_MS);
      if (dayStartMs(nextDayKey) > Date.now()) {
        await ctx.scheduler.runAfter(0, internal.setterRollups.backfillRollupsStep, {
          teamId: args.teamId,
          phase: "repair",
        });
      } else {
        await ctx.scheduler.runAfter(0, internal.setterRollups.backfillRollupsStep, {
          teamId: args.teamId,
          phase: "days",
          dayCursor: nextDayKey,
        });
      }
      return;
    }

    // ---- repair phase: stamp firstDialAt/firstDialByUserId from events ----
    const page = await ctx.db
      .query("setterLeads")
      .withIndex("by_team_and_date_added", (q: any) => q.eq("teamId", args.teamId))
      .order("desc")
      .paginate({ numItems: REPAIR_PAGE, cursor: args.leadCursor ?? null });

    for (const lead of page.page) {
      const needsDialRepair =
        lead.dialCount > 0 && (lead as any).firstDialByUserId === undefined;
      const needsSmsRepair =
        lead.smsOutboundCount > 0 &&
        (lead as any).firstSmsOutboundAt === undefined;
      if (!needsDialRepair && !needsSmsRepair) continue;

      const events: Doc<"setterLeadEvents">[] = await ctx.db
        .query("setterLeadEvents")
        .withIndex("by_team_and_contact", (q: any) =>
          q.eq("teamId", args.teamId).eq("ghlContactId", lead.ghlContactId),
        )
        .take(REPAIR_EVENTS_CAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = {};

      if (needsDialRepair) {
        const outbound = events.filter((e) => e.eventType === "dial_outbound");
        if (outbound.length > 0) {
          let min = outbound[0];
          for (const e of outbound) if (e.occurredAt < min.occurredAt) min = e;
          if (lead.firstDialAt === undefined || min.occurredAt < lead.firstDialAt) {
            patch.firstDialAt = min.occurredAt;
          }
          if (min.ghlUserId !== undefined) {
            patch.firstDialByUserId = min.ghlUserId;
          }
        }
      }
      if (needsSmsRepair) {
        const sms = events.filter((e) => e.eventType === "sms_outbound");
        if (sms.length > 0) {
          let minAt = sms[0].occurredAt;
          for (const e of sms) if (e.occurredAt < minAt) minAt = e.occurredAt;
          patch.firstSmsOutboundAt = minAt;
        }
      }
      if (Object.keys(patch).length > 0) await ctx.db.patch(lead._id, patch);
    }

    if (page.isDone) {
      await ctx.db.patch(args.teamId, { setterRollupsBackfilledAt: Date.now() });
      console.log("[setterRollups] backfill complete", args.teamId);
    } else {
      await ctx.scheduler.runAfter(0, internal.setterRollups.backfillRollupsStep, {
        teamId: args.teamId,
        phase: "repair",
        leadCursor: page.continueCursor,
      });
    }
  },
});

/**
 * Plain range-reader for the metrics layer: rollup rows whose dayKey falls
 * in [startDayKey, endDayKey] inclusive. ISO date strings compare
 * lexicographically = chronologically.
 */
export async function readDailyStatsRange(
  ctx: any,
  teamId: string,
  startDayKey: string,
  endDayKey: string,
): Promise<Doc<"setterDailyStats">[]> {
  return await ctx.db
    .query("setterDailyStats")
    .withIndex("by_team_and_day", (q: any) =>
      q.eq("teamId", teamId).gte("dayKey", startDayKey).lte("dayKey", endDayKey),
    )
    .collect();
}
