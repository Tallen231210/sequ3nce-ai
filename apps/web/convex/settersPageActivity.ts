// ============================================================================
// Close activity by user for the Setters page: dials, answered calls and
// texts from the daily rollups (full UTC days) plus capped raw reads for the
// two partial edge days, and the filed EOD numbers for the same range.
// Rollup day keys are UTC; EOD day keys are team-local — the two never sit
// on one row here, only in range totals.
// ============================================================================

import { addDaysKey } from "./dataHealthCore";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { dayKeyInTz } from "./closerPerformance";
import { DAY_MS, dayKeyOf, readDailyStatsRange } from "./setterRollups";
import { DEFAULT_CONNECT_SEC, answeredDurationSec, dialConnected } from "./lib/dialAnswered";

const EDGE_TAKE = 4_000;
const EOD_TAKE = 2_000;

export interface ActivityCounts {
  dials: number;
  answered: number;
  texts: number;
  /** Answered dials lasting at least each ladder threshold, aligned with the ladder passed to loadUserDays. */
  answeredAt?: number[];
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
  /** UTC days whose rollup rows predate the connect/text counters — dials are counted, connects and texts are not. */
  uncountedDays: string[];
}

/** One team-local day's UTC bounds. */
export interface DayBounds {
  dayKey: string;
  startMs: number;
  endMs: number;
}

/**
 * The UTC instant of local midnight starting `dayKey` in `tz`. Two probes:
 * the offset at noon gives a first guess; the offset AT that guess corrects
 * it on a clock-change day (the change happens after midnight, so the
 * offset in force at midnight is the one to use).
 */
export function localMidnightMs(dayKey: string, tz: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  const wallMidnight = Date.UTC(y, m - 1, d);
  const guess = wallMidnight - offsetMsAt(Date.UTC(y, m - 1, d, 12), tz);
  return wallMidnight - offsetMsAt(guess, tz);
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
function offsetFormatter(tz: string): Intl.DateTimeFormat {
  let f = offsetFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
    offsetFormatters.set(tz, f);
  }
  return f;
}

/** Ms that take UTC to local wall time at `ms` in `tz`, to the minute (offsets are whole minutes). */
function offsetMsAt(ms: number, tz: string): number {
  const parts = Object.fromEntries(offsetFormatter(tz).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute));
  return wall - Math.floor(ms / 60_000) * 60_000;
}

/**
 * Bounds for every team-local day from startKey to endKey inclusive —
 * contiguous (each day ends where the next begins, 23 or 25 hours on a
 * clock-change day) and computed once, so per-row bucketing needs no
 * date formatting.
 */
export function localDayBounds(startKey: string, endKey: string, tz: string): DayBounds[] {
  const out: DayBounds[] = [];
  let startMs = localMidnightMs(startKey, tz);
  for (let key = startKey; key <= endKey; key = addDaysKey(key, 1)) {
    const next = addDaysKey(key, 1);
    const endMs = localMidnightMs(next, tz);
    out.push({ dayKey: key, startMs, endMs });
    startMs = endMs;
  }
  return out;
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
  label: string,
): Promise<void> {
  if (toMs <= fromMs) return;
  const dials = await ctx.db
    .query("setterLeadEvents")
    .withIndex("by_team_and_type_and_time", (q) =>
      q.eq("teamId", teamId).eq("eventType", "dial_outbound").gte("occurredAt", fromMs).lt("occurredAt", toMs),
    )
    .order("desc")
    .take(EDGE_TAKE);
  if (dials.length >= EDGE_TAKE) truncated.push(`dials (${label})`);
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
  if (texts.length >= EDGE_TAKE) truncated.push(`texts (${label})`);
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
  const uncounted = new Set<string>();
  if (rollupsReady && firstFull < lastFullEnd) {
    const rows = await readDailyStatsRange(ctx, teamId, dayKeyOf(firstFull), dayKeyOf(lastFullEnd - DAY_MS));
    for (const r of rows) {
      const c = byUser.get(r.setterId) ?? zero();
      c.dials += r.dials;
      // Rows written before the connect/text counters existed carry neither.
      // Missing is unknown, not zero: the day is named so the page can say so.
      if (r.answered === undefined || r.smsOutbound === undefined) uncounted.add(r.dayKey);
      c.answered += r.answered ?? 0;
      c.texts += r.smsOutbound ?? 0;
      byUser.set(r.setterId, c);
    }
    await rawEdge(ctx, teamId, startMs, firstFull, connectSec, byUser, truncated, "edge day");
    await rawEdge(ctx, teamId, lastFullEnd, endMs, connectSec, byUser, truncated, "edge day");
  } else {
    await rawEdge(ctx, teamId, startMs, endMs, connectSec, byUser, truncated, "whole range");
  }
  return { byUser, rollupsReady, connectSec, truncated, uncountedDays: Array.from(uncounted).sort() };
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

/** Events read per setter per day; a day past this is reported as unmeasurable rather than counted short. */
const USER_DAY_TAKE = 2_000;

/**
 * One setter's own Close events, one read per team-local day — the drawer's
 * measured column and the cross-check's dials / pick-ups. A day that hits
 * the cap is left OUT of `byDay` (unknown, never zero) and named in
 * `truncatedDays`. No per-row date formatting: the day's bounds do the work.
 */
export async function loadUserDays(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  crmUserId: string,
  days: DayBounds[],
  connectSec: number,
  ladder?: number[],
): Promise<{ byDay: Map<string, ActivityCounts>; truncatedDays: string[] }> {
  const byDay = new Map<string, ActivityCounts>();
  const truncatedDays: string[] = [];
  for (const d of days) {
    const rows = await ctx.db
      .query("setterLeadEvents")
      .withIndex("by_team_and_setter_and_time", (q) =>
        q.eq("teamId", teamId).eq("ghlUserId", crmUserId).gte("occurredAt", d.startMs).lt("occurredAt", d.endMs),
      )
      .take(USER_DAY_TAKE);
    if (rows.length >= USER_DAY_TAKE) {
      truncatedDays.push(d.dayKey);
      continue;
    }
    const c: ActivityCounts = ladder ? { ...zero(), answeredAt: ladder.map(() => 0) } : zero();
    for (const e of rows) {
      if (e.eventType === "sms_outbound") c.texts += 1;
      else if (e.eventType === "dial_outbound") {
        c.dials += 1;
        if (dialConnected(e.details, connectSec)) c.answered += 1;
        if (ladder && c.answeredAt) {
          const sec = answeredDurationSec(e.details);
          if (sec !== null) ladder.forEach((t, i) => { if (sec >= t) c.answeredAt![i] += 1; });
        }
      }
    }
    byDay.set(d.dayKey, c);
  }
  return { byDay, truncatedDays };
}

