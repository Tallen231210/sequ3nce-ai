/**
 * Closer Scorecard — E2's manager-facing closer analogue of the setter
 * scorecard. Spec: docs/superpowers/specs/2026-08-25-closer-scorecard-design.md
 *
 * NOT to be confused with:
 *  - closerScorecardData.ts / closerScorecardSettings.ts — the daily
 *    Slack/Discord post for the Team Performance board (July 2026).
 *  - scorecard.ts — the SETTER weekly projection scorecard.
 *
 * The range query resolves the three-layer precedence FIELD BY FIELD, per
 * closer per day: manager override > closer entry > measured. Deliberately
 * its own resolution code rather than a change to mergeDailyRows — the
 * shared merge feeds Team Performance and the EOD nudge, and this feature
 * must not touch their behaviour.
 */
import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { isFollowUpTitle } from "./lib/followUpTitle";
import { resolveAuthUser } from "./setterGhlOauth";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { getLocalDateRangeUtc } from "./setterDataNotifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Only managers/admins may edit — same rule as the Team Performance board
 *  (closerPerformanceMutations.canEdit). */
function canEdit(user: Doc<"users">): boolean {
  return user.role === "admin" || user.role === "manager";
}

// Date helpers copied from scorecard.ts (module-local there; duplicating a
// few pure lines beats exporting internals across an unrelated feature).
function addDaysKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Days in [start, end] inclusive, capped like the setter scorecard. */
function spanDayKeys(start: string, end: string): string[] {
  const out: string[] = [];
  let k = start;
  for (let i = 0; i < 92; i++) {
    out.push(k);
    if (k === end) return out;
    k = addDaysKey(k, 1);
  }
  throw new ConvexError("That range is too long — 92 days max");
}

/** Same shape as the setter's baselineKey, prefixed so the two features can
 *  share the scorecardBaselines table without colliding. */
function closerBaselineKey(weekStart: string, rangeEnd?: string): string {
  const base =
    !rangeEnd || rangeEnd === addDaysKey(weekStart, 6)
      ? weekStart
      : `${weekStart}_${rangeEnd}`;
  return `closer_${base}`;
}

/** Source→engine field mapping. contractValue has no override layer by
 *  design (closerDailyOverrides never carried it), so its `o` is always
 *  undefined — no special case needed. */
const FIELD_MAP = [
  ["booked", "booked"],
  ["taken", "live"],
  ["closes", "closes"],
  ["contractValue", "gross"],
  ["cash", "collected"],
  ["fuBooked", "fub"],
  ["fuShown", "fus"],
  ["tier1Pitched", "p1"],
  ["tier2Pitched", "p2"],
  ["tier3Pitched", "p3"],
] as const;

interface CloserRangeRow {
  closerId: string;
  name: string;
  booked: number;
  live: number;
  closes: number;
  gross: number;
  collected: number;
  fub: number;
  fus: number;
  p1: number;
  p2: number;
  p3: number;
  /** Day-field resolutions counted by winning source — never blend silently. */
  provenance: { manager: number; closer: number; measured: number };
  filedDays: number;
  expectedDays: number;
  missedDayKeys: string[];
  callsCompleted: number;
  callsConfirmed: number;
}

export const getRange = query({
  args: {
    clerkId: v.string(),
    weekStart: v.string(),
    /** Inclusive end day. Omitted = the classic Sat–Sat week. */
    rangeEnd: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;

    if (!DAY_KEY_RE.test(args.weekStart)) throw new ConvexError("Invalid start date");
    if (args.rangeEnd !== undefined && !DAY_KEY_RE.test(args.rangeEnd)) {
      throw new ConvexError("Invalid end date");
    }
    const endKey = args.rangeEnd ?? addDaysKey(args.weekStart, 6);
    if (endKey < args.weekStart) throw new ConvexError("Range ends before it starts");
    const dayKeys = spanDayKeys(args.weekStart, endKey);
    const todayKey = dayKeyInTz(Date.now(), tz);

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .take(500);
    const active = closers.filter((c: any) => c.status !== "deactivated");

    const [stats, entries, overrides] = await Promise.all([
      ctx.db
        .query("closerDailyStats")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", args.weekStart).lte("dayKey", endKey),
        )
        .collect(),
      ctx.db
        .query("closerDailyEntries")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", args.weekStart).lte("dayKey", endKey),
        )
        .collect(),
      ctx.db
        .query("closerDailyOverrides")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", args.weekStart).lte("dayKey", endKey),
        )
        .collect(),
    ]);

    const key = (d: string, c: any) => `${d}|${String(c)}`;
    const statBy = new Map(stats.map((r: any) => [key(r.dayKey, r.closerId), r]));
    const entryBy = new Map(entries.map((r: any) => [key(r.dayKey, r.closerId), r]));
    const ovBy = new Map(overrides.map((r: any) => [key(r.dayKey, r.closerId), r]));

    // Confirmation rate window in UTC ms, from the team-local day span.
    const { startMs } = getLocalDateRangeUtc(args.weekStart, tz);
    const { endMs } = getLocalDateRangeUtc(endKey, tz);

    const rows: CloserRangeRow[] = [];
    for (const closer of active) {
      const row: CloserRangeRow = {
        closerId: String(closer._id),
        name: (closer as any).name ?? "",
        booked: 0, live: 0, closes: 0, gross: 0, collected: 0,
        fub: 0, fus: 0, p1: 0, p2: 0, p3: 0,
        provenance: { manager: 0, closer: 0, measured: 0 },
        filedDays: 0, expectedDays: 0, missedDayKeys: [],
        callsCompleted: 0, callsConfirmed: 0,
      };

      for (const dayKey of dayKeys) {
        const st = statBy.get(key(dayKey, closer._id)) as any;
        const en = entryBy.get(key(dayKey, closer._id)) as any;
        const ov = ovBy.get(key(dayKey, closer._id)) as any;

        for (const [src, dst] of FIELD_MAP) {
          const o = ov?.[src] as number | undefined;
          const e = en?.[src] as number | undefined;
          const m = st?.[src] as number | undefined;
          const val = o ?? e ?? m ?? 0;
          (row as any)[dst] += val;
          if (o !== undefined) row.provenance.manager += 1;
          else if (e !== undefined) row.provenance.closer += 1;
          else if (m !== undefined && m !== 0) row.provenance.measured += 1;
        }

        // Filing visibility — the eodNudge rule verbatim: expected when we
        // MEASURED activity, filed when an entry row exists. Today is never
        // "missed"; the day isn't over.
        const worked = !!st && ((st.booked ?? 0) > 0 || (st.taken ?? 0) > 0);
        if (worked && dayKey !== todayKey) {
          row.expectedDays += 1;
          if (en) row.filedDays += 1;
          else row.missedDayKeys.push(dayKey);
        } else if (worked && en) {
          row.expectedDays += 1;
          row.filedDays += 1;
        }
      }

      // % of calls confirmed — human eyes on the per-call figures.
      const calls = await ctx.db
        .query("calls")
        .withIndex("by_closer_and_startedAt", (q: any) =>
          q.eq("closerId", closer._id).gte("startedAt", startMs).lt("startedAt", endMs),
        )
        .take(500);
      for (const c of calls as any[]) {
        if (c.status !== "completed" || c.countsTowardStats === false) continue;
        row.callsCompleted += 1;
        if (
          c.factsConfirmedAt != null ||
          c.outcomeSource === "closer" ||
          c.outcomeSource === "manager"
        ) {
          row.callsConfirmed += 1;
        }
      }

      rows.push(row);
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));

    const baseline = await ctx.db
      .query("scorecardBaselines")
      .withIndex("by_team_and_week", (q: any) =>
        q.eq("teamId", teamId).eq("weekKey", closerBaselineKey(args.weekStart, args.rangeEnd)),
      )
      .first();

    return {
      weekStart: args.weekStart,
      rangeEnd: args.rangeEnd ?? null,
      canEdit: canEdit(user),
      timezone: tz,
      settings: {
        tierPrices: (team as any)?.closerTierPrices ?? null,
        costPerBookedCall: (team as any)?.closerCostPerBookedCall ?? null,
        targetCdpbc: (team as any)?.closerTargetCdpbc ?? null,
      },
      rows,
      baseline: baseline
        ? { rows: (baseline as any).rows ?? null, lockedAt: (baseline as any).lockedAt }
        : null,
    };
  },
});

/**
 * Lock/clear the whiteboard baseline for a range. Same table as the setter
 * scorecard, `closer_`-prefixed key. Unlike the setter's lockBaseline this
 * applies the manager-role check — matching Team Performance's standard.
 */
export const lockCloserBaseline = mutation({
  args: {
    clerkId: v.string(),
    weekStart: v.string(),
    rangeEnd: v.optional(v.string()),
    /** JSON rows to lock; null clears the lock; omitted = no-op. */
    rows: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");
    if (!canEdit(user)) {
      throw new ConvexError("Only managers can lock a baseline");
    }
    if (!DAY_KEY_RE.test(args.weekStart)) throw new ConvexError("Invalid start date");
    if (args.rangeEnd !== undefined && !DAY_KEY_RE.test(args.rangeEnd)) {
      throw new ConvexError("Invalid end date");
    }
    if (typeof args.rows === "string" && args.rows.length > 100_000) {
      throw new ConvexError("Baseline too large");
    }
    const teamId = user.teamId as Id<"teams">;
    const weekKey = closerBaselineKey(args.weekStart, args.rangeEnd);

    const existing = await ctx.db
      .query("scorecardBaselines")
      .withIndex("by_team_and_week", (q: any) =>
        q.eq("teamId", teamId).eq("weekKey", weekKey),
      )
      .first();

    const patch: Record<string, unknown> = { lockedAt: Date.now() };
    if (args.rows !== undefined) patch.rows = args.rows ?? undefined;

    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("scorecardBaselines", { teamId, weekKey, ...patch } as any);
    return { saved: true };
  },
});

/** Zion-editable scorecard settings, sparse-patched onto the team doc. */
export const updateCloserScorecardSettings = mutation({
  args: {
    clerkId: v.string(),
    /** 1–3 package prices, lowest first. Null clears (hides tier inputs). */
    tierPrices: v.optional(v.union(v.array(v.number()), v.null())),
    costPerBookedCall: v.optional(v.union(v.number(), v.null())),
    targetCdpbc: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");
    if (!canEdit(user)) {
      throw new ConvexError("Only managers can change scorecard settings");
    }

    const patch: Record<string, unknown> = {};
    if (args.tierPrices !== undefined) {
      if (args.tierPrices === null) patch.closerTierPrices = undefined;
      else {
        if (args.tierPrices.length < 1 || args.tierPrices.length > 3) {
          throw new ConvexError("Set between one and three tier prices");
        }
        for (const p of args.tierPrices) {
          if (!Number.isFinite(p) || p < 1 || p > 1_000_000) {
            throw new ConvexError("Tier prices must be between $1 and $1,000,000");
          }
        }
        patch.closerTierPrices = args.tierPrices.map((p) => Math.round(p));
      }
    }
    if (args.costPerBookedCall !== undefined) {
      if (args.costPerBookedCall === null) patch.closerCostPerBookedCall = undefined;
      else if (
        !Number.isFinite(args.costPerBookedCall) ||
        args.costPerBookedCall < 0 ||
        args.costPerBookedCall > 100_000
      ) {
        throw new ConvexError("Cost per booked call must be between $0 and $100,000");
      } else patch.closerCostPerBookedCall = args.costPerBookedCall;
    }
    if (args.targetCdpbc !== undefined) {
      if (args.targetCdpbc === null) patch.closerTargetCdpbc = undefined;
      else if (
        !Number.isFinite(args.targetCdpbc) ||
        args.targetCdpbc < 0 ||
        args.targetCdpbc > 1_000_000
      ) {
        throw new ConvexError("Target CDPBC must be between $0 and $1,000,000");
      } else patch.closerTargetCdpbc = args.targetCdpbc;
    }

    if (Object.keys(patch).length === 0) return { saved: false };
    await ctx.db.patch(user.teamId as Id<"teams">, patch);
    return { saved: true };
  },
});

/** CLI bench for the follow-up matcher (repo convention: unit tests are
 * internalQuery benches — npx convex run --prod closerScorecard:followUpTitleBench '{}'). */
export const followUpTitleBench = internalQuery({
  args: {},
  handler: async () => {
    const cases: Array<{ title: string; expect: boolean }> = [
      { title: "Follow up - John x Ethan", expect: true },
      { title: "(er) Follow-up call", expect: true },
      { title: "followup w/ John", expect: true },
      { title: "FOLLOW UP: payment", expect: true },
      { title: "John Follow    up", expect: true }, // any run of spaces/hyphens
      { title: "Canceled: follow-up with Sam", expect: true }, // anywhere in title
      { title: "(er) John x Ethan", expect: false },
      { title: "FU John", expect: false },
      { title: "Fellowship onboarding", expect: false },
      { title: "Following up next steps doc", expect: false }, // "following" ≠ "follow up"
      { title: "", expect: false },
    ];
    const results = cases.map((c) => ({
      title: c.title,
      got: isFollowUpTitle(c.title),
      pass: isFollowUpTitle(c.title) === c.expect,
    }));
    return { allPass: results.every((r) => r.pass), results };
  },
});
