// ============================================================================
// Close activity by user for the Setters page: dials, answered calls and
// texts from the daily rollups (full UTC days) plus capped raw reads for the
// two partial edge days, and the filed EOD numbers for the same range.
// Rollup day keys are UTC; EOD day keys are team-local — the two never sit
// on one row here, only in range totals.
// ============================================================================

import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { dayKeyInTz } from "./closerPerformance";
import { DAY_MS, dayKeyOf, readDailyStatsRange } from "./setterRollups";
import { DEFAULT_CONNECT_SEC, dialConnected } from "./lib/dialAnswered";

const EDGE_TAKE = 4_000;
const EOD_TAKE = 2_000;

export interface ActivityCounts {
  dials: number;
  answered: number;
  texts: number;
}

export interface FiledSums {
  days: number;
  dials: number;
  pickUps: number;
  sets: number;
  callsOnCalendar: number;
  callsShown: number;
  callsClosed: number;
  cashCollected: number;
  cashReported: boolean;
  newSelfBooked: number;
  contacted: number;
  reached: number;
  confirmed: number;
  confirmedOnCalendar: number;
  confirmedShowed: number;
}

export interface ActivityLoad {
  /** Close user id → counts. "" is the blank user (automation / unattributed). */
  byUser: Map<string, ActivityCounts>;
  rollupsReady: boolean;
  connectSec: number;
  truncated: string[];
}

const zero = (): ActivityCounts => ({ dials: 0, answered: 0, texts: 0 });

async function rawEdge(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  fromMs: number,
  toMs: number,
  connectSec: number,
  into: Map<string, ActivityCounts>,
  truncated: string[],
): Promise<void> {
  if (toMs <= fromMs) return;
  const dials = await ctx.db
    .query("setterLeadEvents")
    .withIndex("by_team_and_type_and_time", (q) =>
      q.eq("teamId", teamId).eq("eventType", "dial_outbound").gte("occurredAt", fromMs).lt("occurredAt", toMs),
    )
    .order("desc")
    .take(EDGE_TAKE);
  if (dials.length >= EDGE_TAKE) truncated.push("dials (edge day)");
  for (const e of dials) {
    const c = into.get(e.ghlUserId ?? "") ?? zero();
    c.dials += 1;
    if (dialConnected(e.details, connectSec)) c.answered += 1;
    into.set(e.ghlUserId ?? "", c);
  }
  const texts = await ctx.db
    .query("setterLeadEvents")
    .withIndex("by_team_and_type_and_time", (q) =>
      q.eq("teamId", teamId).eq("eventType", "sms_outbound").gte("occurredAt", fromMs).lt("occurredAt", toMs),
    )
    .order("desc")
    .take(EDGE_TAKE);
  if (texts.length >= EDGE_TAKE) truncated.push("texts (edge day)");
  for (const e of texts) {
    const c = into.get(e.ghlUserId ?? "") ?? zero();
    c.texts += 1;
    into.set(e.ghlUserId ?? "", c);
  }
}

/** Dials / answered / texts per Close user over [startMs, endMs). */
export async function loadActivity(
  ctx: QueryCtx,
  team: Doc<"teams">,
  startMs: number,
  endMs: number,
): Promise<ActivityLoad> {
  const teamId = team._id;
  const connectSec = team.setterConnectionThresholdSec ?? DEFAULT_CONNECT_SEC;
  const byUser = new Map<string, ActivityCounts>();
  const truncated: string[] = [];
  const rollupsReady = team.setterRollupsBackfilledAt !== undefined;

  // Full UTC days inside the range come from the rollups; the partial days
  // at either end from raw events. Without a backfill, everything is raw.
  const firstFull = Math.ceil(startMs / DAY_MS) * DAY_MS;
  const lastFullEnd = Math.floor(endMs / DAY_MS) * DAY_MS;
  if (rollupsReady && firstFull < lastFullEnd) {
    const rows = await readDailyStatsRange(ctx, teamId, dayKeyOf(firstFull), dayKeyOf(lastFullEnd - DAY_MS));
    for (const r of rows) {
      const c = byUser.get(r.setterId) ?? zero();
      c.dials += r.dials;
      c.answered += r.answered ?? 0;
      c.texts += r.smsOutbound ?? 0;
      byUser.set(r.setterId, c);
    }
    await rawEdge(ctx, teamId, startMs, firstFull, connectSec, byUser, truncated);
    await rawEdge(ctx, teamId, lastFullEnd, endMs, connectSec, byUser, truncated);
  } else {
    await rawEdge(ctx, teamId, startMs, endMs, connectSec, byUser, truncated);
  }
  return { byUser, rollupsReady, connectSec, truncated };
}

const zeroFiled = (): FiledSums => ({
  days: 0, dials: 0, pickUps: 0, sets: 0, callsOnCalendar: 0, callsShown: 0, callsClosed: 0, cashCollected: 0, cashReported: false,
  newSelfBooked: 0, contacted: 0, reached: 0, confirmed: 0, confirmedOnCalendar: 0, confirmedShowed: 0,
});

/** Filed EOD numbers per roster row over the team-local days the range covers. */
export async function loadFiled(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  startMs: number,
  endMs: number,
  tz: string,
): Promise<{ byRoster: Map<string, FiledSums>; truncated: string[] }> {
  const startKey = dayKeyInTz(startMs, tz);
  const endKey = dayKeyInTz(endMs - 1, tz);
  const entries = await ctx.db
    .query("setterEodEntries")
    .withIndex("by_team_and_day", (q) => q.eq("teamId", teamId).gte("dayKey", startKey).lte("dayKey", endKey))
    .take(EOD_TAKE);
  const truncated = entries.length >= EOD_TAKE ? ["eod entries"] : [];
  const byRoster = new Map<string, FiledSums>();
  for (const e of entries) {
    const f = byRoster.get(String(e.rosterId)) ?? zeroFiled();
    f.days += 1;
    f.dials += e.dials;
    f.pickUps += e.pickUps;
    f.sets += e.sets;
    f.callsOnCalendar += e.callsOnCalendar ?? 0;
    f.callsShown += e.callsShown ?? 0;
    f.callsClosed += e.callsClosed ?? 0;
    f.cashCollected += e.cashCollected ?? 0;
    f.cashReported = f.cashReported || e.cashCollected !== undefined;
    f.newSelfBooked += e.newSelfBooked ?? 0;
    f.contacted += e.contacted ?? 0;
    f.reached += e.reached ?? 0;
    f.confirmed += e.confirmed ?? 0;
    f.confirmedOnCalendar += e.confirmedOnCalendar ?? 0;
    f.confirmedShowed += e.confirmedShowed ?? 0;
    byRoster.set(String(e.rosterId), f);
  }
  return { byRoster, truncated };
}

/** One setter's own Close events for the range, bucketed by team-local day — the drawer's measured column. */
export async function loadUserDays(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  crmUserId: string,
  startMs: number,
  endMs: number,
  tz: string,
  connectSec: number,
): Promise<{ byDay: Map<string, ActivityCounts>; truncated: boolean }> {
  const rows = await ctx.db
    .query("setterLeadEvents")
    .withIndex("by_team_and_setter_and_time", (q) =>
      q.eq("teamId", teamId).eq("ghlUserId", crmUserId).gte("occurredAt", startMs).lt("occurredAt", endMs),
    )
    .order("desc")
    .take(5_000);
  const byDay = new Map<string, ActivityCounts>();
  for (const e of rows) {
    if (e.eventType !== "dial_outbound" && e.eventType !== "sms_outbound") continue;
    const key = dayKeyInTz(e.occurredAt, tz);
    const c = byDay.get(key) ?? zero();
    if (e.eventType === "sms_outbound") c.texts += 1;
    else {
      c.dials += 1;
      if (dialConnected(e.details, connectSec)) c.answered += 1;
    }
    byDay.set(key, c);
  }
  return { byDay, truncated: rows.length >= 5_000 };
}

