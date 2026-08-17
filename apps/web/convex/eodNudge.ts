import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { mergeDailyRows } from "./closerPerformanceMetrics";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Who hasn't filed their end-of-day.
//
// The Team Performance post only counts days a closer actually submitted, so a
// rep who skips the form vanishes from it entirely rather than showing a bad
// number. On a real Friday at ManyJobs that meant the post listed one closer
// out of three, and nothing on it said the other two were missing — a manager
// skimming it would conclude only Nick worked.
//
// This says the quiet part out loud, and nothing else.
// ============================================================================

export interface EodNudgeCloser {
  closerId: string;
  name: string;
  /** What we measured them doing that day — the evidence they were working. */
  booked: number;
  taken: number;
}

export const getEodNudgeData = internalQuery({
  args: {
    teamId: v.id("teams"),
    /** Team-local day being chased, "YYYY-MM-DD". */
    dayKey: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    dayKey: string;
    missing: EodNudgeCloser[];
    filed: number;
    /** Everyone who worked, filed or not — for "3 of 5" phrasing. */
    expected: number;
  }> => {
    const teamId = args.teamId as Id<"teams">;

    const [stats, overrides, entries, closers] = await Promise.all([
      ctx.db
        .query("closerDailyStats")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).eq("dayKey", args.dayKey),
        )
        .collect(),
      ctx.db
        .query("closerDailyOverrides")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).eq("dayKey", args.dayKey),
        )
        .collect(),
      ctx.db
        .query("closerDailyEntries")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).eq("dayKey", args.dayKey),
        )
        .collect(),
      ctx.db
        .query("closers")
        .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
        .take(500),
    ]);

    const byId = new Map(closers.map((c) => [String(c._id), c]));

    const missing: EodNudgeCloser[] = [];
    let filed = 0;
    let expected = 0;

    for (const row of mergeDailyRows(stats, overrides, entries)) {
      const closer = byId.get(row.closerId);
      // A closer removed from the team mid-day still has rows. Chasing someone
      // who no longer works here is the fastest way to get a channel muted.
      if (!closer || closer.status !== "active") continue;

      // Did they work? Judged on what we MEASURED, never on the merged total —
      // the merged value includes what they typed, so using it would ask
      // "did they report anything?" to decide whether to chase a missing
      // report, and nobody would ever be chased.
      const worked = row.measured.booked > 0 || row.measured.taken > 0;
      if (!worked) continue;

      expected += 1;
      if (row.confirmed) {
        filed += 1;
      } else {
        missing.push({
          closerId: row.closerId,
          name: closer.name ?? "Unknown",
          booked: row.measured.booked,
          taken: row.measured.taken,
        });
      }
    }

    // Most calls taken first: the biggest gap in the day's numbers is the one
    // a manager should chase first.
    missing.sort((a, b) => b.taken - a.taken || b.booked - a.booked);

    return { dayKey: args.dayKey, missing, filed, expected };
  },
});
