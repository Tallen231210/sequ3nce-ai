import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import {
  addTotals,
  computeRates,
  emptyTotals,
  mergeDailyRows,
  type FunnelTotals,
} from "./closerPerformanceMetrics";
import {
  buildBalanceSuggestion,
  buildEodSuggestion,
  buildRateSuggestions,
  rankSuggestions,
  type Suggestion,
} from "./managerSuggestions";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// One card per rep, for the Manager Mode overview.
//
// Reads the same rollup the Team Performance board reads, so a suggestion can
// never contradict the tab a manager would open to check it. A brief that
// disagrees with the dashboard is worse than no brief.
// ============================================================================

/** Two weeks against the two before them. Long enough to be a trend, short
 *  enough that last month's slump doesn't hide this week's. */
const WINDOW_DAYS = 14;

function shiftDay(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

export const listRepCards = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);
    if (!team) return null;

    const tz = team.timezone || DEFAULT_TIMEZONE;
    const today = dayKeyInTz(Date.now(), tz);
    const recentFrom = shiftDay(today, -WINDOW_DAYS);
    const priorFrom = shiftDay(today, -WINDOW_DAYS * 2);

    const [stats, overrides, entries, closers, calls] = await Promise.all([
      ctx.db
        .query("closerDailyStats")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", priorFrom).lte("dayKey", today),
        )
        .collect(),
      ctx.db
        .query("closerDailyOverrides")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", priorFrom).lte("dayKey", today),
        )
        .collect(),
      ctx.db
        .query("closerDailyEntries")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", priorFrom).lte("dayKey", today),
        )
        .collect(),
      ctx.db
        .query("closers")
        .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
        .take(200),
      // Outstanding balances. Read from calls rather than callStats because
      // the settled/written-off flags live here.
      ctx.db
        .query("calls")
        .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
        .order("desc")
        .take(600),
    ]);

    const active = closers.filter((c) => c.status === "active");
    const nameById = new Map(active.map((c) => [String(c._id), c.name ?? "Unknown"]));

    // ---- windows ----
    const recent = new Map<string, FunnelTotals>();
    const prior = new Map<string, FunnelTotals>();
    const missedEod = new Map<string, number>();

    for (const row of mergeDailyRows(stats, overrides, entries)) {
      const id = String(row.closerId);
      if (!nameById.has(id)) continue;

      const bucket = row.dayKey >= recentFrom ? recent : prior;
      bucket.set(id, addTotals(bucket.get(id) ?? emptyTotals(), row.totals));

      // Same rule the nudge uses — judged on measured activity, not on the
      // merged total which already contains whatever they typed.
      if (row.dayKey >= recentFrom) {
        const worked = row.measured.booked > 0 || row.measured.taken > 0;
        if (worked && !row.confirmed) {
          missedEod.set(id, (missedEod.get(id) ?? 0) + 1);
        }
      }
    }

    // ---- outstanding balances per rep ----
    const balances = new Map<string, { count: number; total: number }>();
    for (const c of calls) {
      if (c.outcome !== "closed") continue;
      if (c.balanceSettledAt || c.balanceWrittenOffAt) continue;
      const owed = (c.contractValue ?? 0) - (c.cashCollected ?? 0);
      if (owed <= 0) continue;
      const id = String(c.closerId);
      if (!nameById.has(id)) continue;
      const b = balances.get(id) ?? { count: 0, total: 0 };
      b.count += 1;
      b.total += owed;
      balances.set(id, b);
    }

    const cards = active.map((c) => {
      const id = String(c._id);
      const r = recent.get(id) ?? emptyTotals();
      const p = prior.get(id) ?? emptyTotals();
      const rRates = computeRates(r);
      const pRates = computeRates(p);

      const suggestions: Suggestion[] = [
        ...buildRateSuggestions(
          { ...rRates, taken: r.taken },
          { ...pRates, taken: p.taken },
        ),
      ];

      const eod = buildEodSuggestion(missedEod.get(id) ?? 0);
      if (eod) suggestions.push(eod);

      const bal = balances.get(id);
      if (bal) {
        const s = buildBalanceSuggestion(bal.count, bal.total);
        if (s) suggestions.push(s);
      }

      return {
        closerId: c._id,
        name: nameById.get(id),
        taken: r.taken,
        offers: r.offers,
        closes: r.closes,
        cash: r.cash,
        showPct: rRates.showPct,
        offerClosePct: rRates.offerClosePct,
        closePct: rRates.closePct,
        // Null rather than 0 when there's nothing to compare — "no data" and
        // "no change" are different, and a 0 would read as the latter.
        priorShowPct: p.taken >= 5 ? pRates.showPct : null,
        priorOfferClosePct: p.taken >= 5 ? pRates.offerClosePct : null,
        priorClosePct: p.taken >= 5 ? pRates.closePct : null,
        suggestions: rankSuggestions(suggestions),
      };
    });

    // Whoever needs the manager most, first. A rep with nothing flagged sinks
    // to the bottom rather than disappearing — "nothing to raise" is useful.
    cards.sort((a, b) => {
      const w = (s: any[]) =>
        s.reduce((n, x) => n + (x.severity === "high" ? 3 : x.severity === "medium" ? 2 : 1), 0);
      return w(b.suggestions) - w(a.suggestions) || b.cash - a.cash;
    });

    return { windowDays: WINDOW_DAYS, cards };
  },
});
