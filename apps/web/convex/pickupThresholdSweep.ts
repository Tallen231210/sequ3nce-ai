// ============================================================================
// Read-only diagnostic: which connect threshold best matches the pick-ups
// setters file? For every outbound setter with a Close user and every day
// they filed, count their answered dials at each duration threshold and put
// the filed pick-ups beside it. Also the duration histogram of answered
// dials, to see where the voicemail cluster sits.
//   CONVEX_DEPLOYMENT=dev:fastidious-dragon-782 npx convex run \
//     pickupThresholdSweep:sweep '{"teamId":"…","startDayKey":"2026-09-01","endDayKey":"2026-09-09"}' --prod
// ============================================================================

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { getLocalDateRangeUtc } from "./setterDataNotifications";
import { DEFAULT_CONNECT_SEC } from "./lib/dialAnswered";

const DEFAULT_THRESHOLDS = [0, 15, 30, 45, 60, 90, 120, 180];
const BUCKETS: Array<[string, number, number]> = [
  ["0-9s", 0, 10], ["10-29s", 10, 30], ["30-44s", 30, 45], ["45-59s", 45, 60], ["60-89s", 60, 90], ["90-119s", 90, 120], ["120-179s", 120, 180], ["180s+", 180, Infinity],
];
const EVENTS_TAKE = 8_000;

/** Same reading of Close's disposition as lib/dialAnswered: anything but an explicit non-"answered" counts as answered. */
function answeredSec(details: unknown): number | null {
  const d = details as { disposition?: unknown; callDurationSec?: unknown } | undefined;
  if (typeof d?.disposition === "string" && d.disposition.toLowerCase() !== "answered") return null;
  return typeof d?.callDurationSec === "number" ? d.callDurationSec : 0;
}

export const sweep = internalQuery({
  args: { teamId: v.id("teams"), startDayKey: v.string(), endDayKey: v.string(), thresholds: v.optional(v.array(v.number())) },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) return { error: "team not found" };
    const tz = (team as { timezone?: string }).timezone || DEFAULT_TIMEZONE;
    const thresholds = args.thresholds ?? DEFAULT_THRESHOLDS;
    const { startMs } = getLocalDateRangeUtc(args.startDayKey, tz);
    const { endMs } = getLocalDateRangeUtc(args.endDayKey, tz);

    const rosters = (await ctx.db.query("setterRoster").withIndex("by_team", (q) => q.eq("teamId", args.teamId)).take(200))
      .filter((r) => r.role !== "confirmation" && r.crmUserId);
    const entries = await ctx.db
      .query("setterEodEntries")
      .withIndex("by_team_and_day", (q) => q.eq("teamId", args.teamId).gte("dayKey", args.startDayKey).lte("dayKey", args.endDayKey))
      .take(4_000);
    const filedBy = new Map<string, { pickUps: number; dials: number }>();
    for (const e of entries) if (e.formShape !== "confirmation") filedBy.set(`${String(e.rosterId)}|${e.dayKey}`, { pickUps: e.pickUps, dials: e.dials });

    const setters = [];
    for (const r of rosters) {
      const rows = await ctx.db
        .query("setterLeadEvents")
        .withIndex("by_team_and_setter_and_time", (q) => q.eq("teamId", args.teamId).eq("ghlUserId", r.crmUserId as string).gte("occurredAt", startMs).lt("occurredAt", endMs))
        .order("desc")
        .take(EVENTS_TAKE);
      const byDay = new Map<string, { dials: number; answered: number[] }>();
      const histogram: Record<string, number> = Object.fromEntries(BUCKETS.map(([b]) => [b, 0]));
      for (const e of rows) {
        if (e.eventType !== "dial_outbound") continue;
        const key = dayKeyInTz(e.occurredAt, tz);
        const d = byDay.get(key) ?? { dials: 0, answered: [] };
        d.dials += 1;
        const sec = answeredSec(e.details);
        if (sec !== null) {
          d.answered.push(sec);
          const b = BUCKETS.find(([, lo, hi]) => sec >= lo && sec < hi);
          if (b) histogram[b[0]] += 1;
        }
        byDay.set(key, d);
      }
      const days = [];
      const totals: Record<string, number> = Object.fromEntries(thresholds.map((t) => [String(t), 0]));
      const absPct: Record<string, number[]> = Object.fromEntries(thresholds.map((t) => [String(t), []]));
      let filedPickUps = 0;
      let filedDials = 0;
      let closeDials = 0;
      for (const [key, filed] of Array.from(filedBy.entries()).filter(([k]) => k.startsWith(`${String(r._id)}|`)).map(([k, f]) => [k.split("|")[1], f] as const).sort()) {
        const d = byDay.get(key) ?? { dials: 0, answered: [] };
        const byThreshold: Record<string, number> = {};
        for (const t of thresholds) {
          const n = d.answered.filter((s) => s >= t).length;
          byThreshold[String(t)] = n;
          totals[String(t)] += n;
          if (filed.pickUps > 0) absPct[String(t)].push(Math.abs(n - filed.pickUps) / filed.pickUps);
        }
        filedPickUps += filed.pickUps;
        filedDials += filed.dials;
        closeDials += d.dials;
        days.push({ dayKey: key, filedDials: filed.dials, closeDials: d.dials, filedPickUps: filed.pickUps, byThreshold });
      }
      const fit = thresholds.map((t) => {
        const errs = absPct[String(t)];
        return { threshold: t, total: totals[String(t)], meanAbsPctError: errs.length ? Math.round((errs.reduce((a, b) => a + b, 0) / errs.length) * 100) : null };
      });
      const best = fit.filter((f) => f.meanAbsPctError !== null).sort((a, b) => (a.meanAbsPctError as number) - (b.meanAbsPctError as number))[0] ?? null;
      setters.push({ name: r.name, filedDays: days.length, filedDials, closeDials, filedPickUps, fit, bestThreshold: best?.threshold ?? null, histogram, days, truncated: rows.length >= EVENTS_TAKE });
    }
    return { timezone: tz, teamThresholdSec: team.setterConnectionThresholdSec ?? DEFAULT_CONNECT_SEC, thresholds, setters };
  },
});
