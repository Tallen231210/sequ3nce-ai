// ============================================================================
// Scorecard data: Sat–Sat weekly actuals off setterEodEntries, plus Zion's
// persisted baseline + CDPBC. Dual-auth — the manager mounts pass clerkId,
// the setter mounts pass sessionToken; both resolve to a teamId or nothing.
// ============================================================================

import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { resolveSetterSessionCtx } from "./setterAuth";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";

export interface ScorecardRow {
  rosterId: string;
  name: string;
  pod: string | null;
  dials: number;
  connects: number;
  sets: number;
  booked: number;
  showed: number;
  closed: number;
}

/** teamId + whether the caller may edit (manager) from either credential. */
async function resolveScorecardCaller(
  ctx: any,
  args: { clerkId?: string; sessionToken?: string },
): Promise<{ teamId: Id<"teams">; isManager: boolean; rosterId?: string } | null> {
  if (args.clerkId) {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    return { teamId: user.teamId as Id<"teams">, isManager: true };
  }
  if (args.sessionToken) {
    const me = await resolveSetterSessionCtx(ctx, args.sessionToken);
    if (!me) return null;
    return { teamId: me.teamId, isManager: false, rosterId: String(me.rosterId) };
  }
  return null;
}

/** The Saturday (team-local) that starts the week containing `ms`. */
function weekStartKey(ms: number, tz: string): string {
  // Walk back day by day (≤6 steps) until the local weekday is Saturday.
  for (let back = 0; back < 7; back++) {
    const t = ms - back * 86_400_000;
    const d = new Date(t);
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    }).format(d);
    if (weekday === "Sat") return dayKeyInTz(t, tz);
  }
  return dayKeyInTz(ms, tz);
}

function addDaysKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export const listScorecardWeeks = query({
  args: { clerkId: v.optional(v.string()), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const caller = await resolveScorecardCaller(ctx, args);
    if (!caller) return null;
    const team = await ctx.db.get(caller.teamId);
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;
    const current = weekStartKey(Date.now(), tz);
    const weeks: string[] = [];
    for (let i = 0; i < 12; i++) weeks.push(addDaysKey(current, -7 * i));
    return { weeks, currentWeek: current };
  },
});

export const getScorecardWeek = query({
  args: {
    clerkId: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
    weekStart: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await resolveScorecardCaller(ctx, args);
    if (!caller) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.weekStart)) {
      throw new ConvexError("Bad week key");
    }

    const roster = await ctx.db
      .query("setterRoster")
      .withIndex("by_team", (q) => q.eq("teamId", caller.teamId))
      .collect();
    const active = roster.filter((r) => r.active);

    const dayKeys: string[] = [];
    for (let i = 0; i < 7; i++) dayKeys.push(addDaysKey(args.weekStart, i));

    const byRoster = new Map<string, ScorecardRow>();
    for (const r of active) {
      byRoster.set(String(r._id), {
        rosterId: String(r._id),
        name: r.name,
        pod: r.pod ?? null,
        dials: 0,
        connects: 0,
        sets: 0,
        booked: 0,
        showed: 0,
        closed: 0,
      });
    }

    for (const dayKey of dayKeys) {
      const entries = await ctx.db
        .query("setterEodEntries")
        .withIndex("by_team_and_day", (q) =>
          q.eq("teamId", caller.teamId).eq("dayKey", dayKey),
        )
        .collect();
      for (const e of entries) {
        const row = byRoster.get(String(e.rosterId));
        if (!row) continue; // deactivated setter — absence is information
        row.dials += e.dials;
        row.connects += e.pickUps;
        row.sets += e.sets;
        row.booked += e.callsOnCalendar ?? 0;
        row.showed += e.callsShown ?? 0;
        row.closed += e.callsClosed ?? 0;
      }
    }

    const baseline = await ctx.db
      .query("scorecardBaselines")
      .withIndex("by_team_and_week", (q) =>
        q.eq("teamId", caller.teamId).eq("weekKey", args.weekStart),
      )
      .first();

    const rows = Array.from(byRoster.values()).sort((a, b) =>
      (a.pod ?? "z").localeCompare(b.pod ?? "z") || a.name.localeCompare(b.name),
    );

    return {
      weekStart: args.weekStart,
      rows,
      isManager: caller.isManager,
      ownRosterId: caller.rosterId ?? null,
      baseline: baseline
        ? {
            rows: baseline.rows ?? null,
            cdpbc: baseline.cdpbc ?? null,
            lockedAt: baseline.lockedAt,
          }
        : null,
    };
  },
});

/** Manager-only. rows omitted = save CDPBC alone; rows null = clear the lock. */
export const lockBaseline = mutation({
  args: {
    clerkId: v.string(),
    weekStart: v.string(),
    rows: v.optional(v.union(v.string(), v.null())),
    cdpbc: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Only managers can lock a baseline");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.weekStart)) {
      throw new ConvexError("Bad week key");
    }
    if (args.rows && args.rows.length > 100_000) {
      throw new ConvexError("Baseline too large");
    }
    if (
      args.cdpbc != null &&
      (!Number.isFinite(args.cdpbc) || args.cdpbc < 0 || args.cdpbc > 1_000_000)
    ) {
      throw new ConvexError("Check the CDPBC number");
    }

    const existing = await ctx.db
      .query("scorecardBaselines")
      .withIndex("by_team_and_week", (q) =>
        q.eq("teamId", user.teamId as Id<"teams">).eq("weekKey", args.weekStart),
      )
      .first();

    const patch: Record<string, unknown> = { lockedAt: Date.now() };
    if (args.rows !== undefined) patch.rows = args.rows ?? undefined;
    if (args.cdpbc !== undefined) patch.cdpbc = args.cdpbc ?? undefined;

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("scorecardBaselines", {
        teamId: user.teamId as Id<"teams">,
        weekKey: args.weekStart,
        rows: (args.rows ?? undefined) as string | undefined,
        cdpbc: (args.cdpbc ?? undefined) as number | undefined,
        lockedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});
