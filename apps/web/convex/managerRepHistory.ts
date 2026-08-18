import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import {
  addTotals,
  emptyTotals,
  mergeDailyRows,
} from "./closerPerformanceMetrics";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// One rep, over time: every one-to-one, and what was agreed at each.
//
// The verdict on an agreement is the whole point of Manager Mode, and it is
// deliberately narrow. We answer HELD or NOT HELD only where a record settles
// it. Everything else is returned as "unknown" and shown without a verdict —
// never as a hedge, never as a guess.
//
// Claiming to know whether someone "used the new objection handling" is the
// failure mode this feature was scoped to avoid.
// ============================================================================

/** Codes we can genuinely settle, and how. Anything not here is unknown. */
type Verdict = "held" | "not_held" | "unknown";

function shiftDay(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

/**
 * Does this agreement look like a promise to file end-of-day reports?
 *
 * Matched on the words a person actually uses. Deliberately conservative —
 * a missed match shows no verdict, which is fine; a wrong match tells a
 * manager their rep broke a promise they never made, which is not.
 */
function isEodPromise(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /(end[- ]of[- ]day|eod|daily (report|number)s?)/.test(t) &&
    !/stop|skip|don't|dont/.test(t)
  );
}

export const getRepHistory = query({
  args: { clerkId: v.string(), closerId: v.id("closers") },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;

    const closer = await ctx.db.get(args.closerId);
    if (!closer || String(closer.teamId) !== String(user.teamId)) return null;

    const team = await ctx.db.get(user.teamId as Id<"teams">);
    const tz = team?.timezone || DEFAULT_TIMEZONE;
    const today = dayKeyInTz(Date.now(), tz);

    // This manager's meetings, most recent first. Scoped to them, so one
    // manager's coaching history is never visible to another.
    const meetings = await ctx.db
      .query("managerMeetings")
      .withIndex("by_user_and_created", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(60);

    const timeline: any[] = [];

    for (const m of meetings) {
      if (!m.calendarEventId) continue;
      const ev = await ctx.db.get(m.calendarEventId);
      const evRep = ev?.taggedCloserId ?? ev?.matchedCloserId ?? null;
      if (!evRep || String(evRep) !== String(args.closerId)) continue;

      const analysis = await ctx.db
        .query("managerMeetingAnalysis")
        .withIndex("by_meeting", (q) => q.eq("meetingId", m._id))
        .first();

      const metAt = m.startedAt ?? m.createdAt;

      // Evidence window: the day after the meeting up to today. A promise
      // can't be broken before it was made.
      const fromDay = shiftDay(dayKeyInTz(metAt, tz), 1);

      const agreements: any[] = [];
      for (const a of analysis?.agreements ?? []) {
        let verdict: Verdict = "unknown";
        let evidence: string | null = null;

        if (a.measurable && isEodPromise(a.what) && fromDay <= today) {
          const [stats, overrides, entries] = await Promise.all([
            ctx.db
              .query("closerDailyStats")
              .withIndex("by_team_and_day", (q: any) =>
                q.eq("teamId", closer.teamId).gte("dayKey", fromDay).lte("dayKey", today),
              )
              .collect(),
            ctx.db
              .query("closerDailyOverrides")
              .withIndex("by_team_and_day", (q: any) =>
                q.eq("teamId", closer.teamId).gte("dayKey", fromDay).lte("dayKey", today),
              )
              .collect(),
            ctx.db
              .query("closerDailyEntries")
              .withIndex("by_team_and_day", (q: any) =>
                q.eq("teamId", closer.teamId).gte("dayKey", fromDay).lte("dayKey", today),
              )
              .collect(),
          ]);

          let worked = 0;
          let filed = 0;
          for (const row of mergeDailyRows(stats, overrides, entries)) {
            if (String(row.closerId) !== String(args.closerId)) continue;
            // Worked judged on MEASURED activity — the merged total contains
            // whatever they typed, so using it would ask "did they report?"
            // to decide whether they reported.
            if (row.measured.booked === 0 && row.measured.taken === 0) continue;
            worked++;
            if (row.confirmed) filed++;
          }

          if (worked > 0) {
            // Not a pass/fail on one day. Someone who filed 12 of 14 kept the
            // promise; someone who filed 2 of 14 did not.
            verdict = filed / worked >= 0.8 ? "held" : "not_held";
            evidence = `filed ${filed} of ${worked} working days since`;
          }
        }

        agreements.push({
          what: a.what,
          who: a.who,
          measurable: a.measurable,
          verdict,
          evidence,
        });
      }

      timeline.push({
        meetingId: m._id,
        title: m.title,
        metAt,
        duration: m.duration ?? null,
        kind: analysis?.kind ?? null,
        summary: analysis?.summary ?? null,
        agreements,
      });
    }

    return {
      closerId: closer._id,
      name: closer.name ?? "Unknown",
      meetingCount: timeline.length,
      timeline,
    };
  },
});
