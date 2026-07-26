import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getLocalDateRangeUtc } from "./setterDataNotifications";
import { DEFAULT_TIMEZONE } from "./closerPerformance";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// DEMO DATA — development aid, not product code.
//
// Seeds a team with realistic bookings, blocks and completed calls so the
// Team Performance board can be reviewed on localhost. Exists because our own
// test account is empty, impersonation only works against production, and a
// dashboard cannot be judged against no data.
//
// It seeds RAW calls and calendarEvents, then runs the ordinary recount —
// never closerDailyStats directly. Writing the rollup by hand would produce
// numbers no code path can reproduce, and the next sweep would delete them.
// This way the demo exercises the real pipeline and behaves like a real team.
//
// Everything it writes is tagged and removable:
//   calendarEvents.uid       starts with DEMO_PREFIX
//   calls.prospectEmail      ends with DEMO_EMAIL_DOMAIN
// clearDemo() removes exactly those and nothing else, so a team's genuine
// data is never at risk.
// ============================================================================

const DEMO_PREFIX = "seeddemo_";
const DEMO_EMAIL_DOMAIN = "@seed.demo";

/** Deterministic PRNG so re-seeding a day reproduces the same day. */
function rngFor(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}

const FIRST = ["James","Maria","Devon","Priya","Marcus","Chloe","Andre","Nina","Otis","Sasha","Ben","Lucia","Theo","Ruth","Kai","Mona"];
const LAST = ["Bailey","Nguyen","Okafor","Rossi","Sharma","Dixon","Alvarez","Kowalski","Byrne","Ferreira","Novak","Haddad"];

function weekdayOf(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const seedDemoDay = internalMutation({
  args: { teamId: v.id("teams"), dayKey: v.string() },
  handler: async (ctx, args): Promise<{ events: number; calls: number }> => {
    const team = (await ctx.db.get(args.teamId)) as Doc<"teams"> | null;
    if (!team) return { events: 0, calls: 0 };
    const tz = team.timezone || DEFAULT_TIMEZONE;

    const weekday = weekdayOf(args.dayKey);
    // Weekends stay empty. A board that shows Saturday activity for a Mon-Fri
    // floor is a worse demo than one with honest gaps.
    if (weekday === 0 || weekday === 6) return { events: 0, calls: 0 };

    const closers = (await ctx.db
      .query("closers")
      .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
      .take(50)) as Doc<"closers">[];
    const active = closers.filter((c) => c.status !== "deactivated");
    if (active.length === 0) return { events: 0, calls: 0 };

    const subs = (await ctx.db
      .query("closerCalendarSubscriptions")
      .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
      .take(100)) as Doc<"closerCalendarSubscriptions">[];
    const subByCloser = new Map(subs.map((s) => [String(s.closerId), s._id]));

    const { startMs } = getLocalDateRangeUtc(args.dayKey, tz);
    const H = 3_600_000;
    const now = Date.now();

    let eventCount = 0;
    let callCount = 0;

    for (const closer of active) {
      const rnd = rngFor(`${args.dayKey}|${String(closer._id)}`);
      const subscriptionId = subByCloser.get(String(closer._id));

      // Blocks either side of the working day. These are what make capacity
      // measurable at all — without enough declared-unavailable time the
      // board correctly refuses to quote Booked%.
      const blocks: Array<[number, number, string]> = [
        [0, 8.5, "Personal"],
        [18.5, 24, "Personal"],
        [12, 12.75, "Lunch"],
      ];
      for (const [from, to, title] of blocks) {
        await ctx.db.insert("calendarEvents", {
          closerId: closer._id,
          teamId: args.teamId,
          uid: `${DEMO_PREFIX}blk_${args.dayKey}_${String(closer._id)}_${from}`,
          title,
          startTime: startMs + from * H,
          endTime: startMs + to * H,
          fetchedAt: now,
          ...(subscriptionId ? { subscriptionId } : {}),
        });
        eventCount++;
      }

      // 4-8 bookings across the working day, on the hour from 09:00.
      const bookings = 4 + Math.floor(rnd() * 5);
      for (let i = 0; i < bookings; i++) {
        const hour = 9 + i;
        if (hour >= 18) break;
        const start = startMs + hour * H;
        const end = start + 45 * 60_000;
        const prospect = `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`;
        const email = `${prospect.split(" ")[0].toLowerCase()}${Math.floor(rnd() * 900 + 100)}${DEMO_EMAIL_DOMAIN}`;

        await ctx.db.insert("calendarEvents", {
          closerId: closer._id,
          teamId: args.teamId,
          uid: `${DEMO_PREFIX}bk_${args.dayKey}_${String(closer._id)}_${i}`,
          // Matches the "Prospect and Rep" convention real schedulers write,
          // so title attribution is exercised too.
          title: `${prospect} and ${closer.name}`,
          startTime: start,
          endTime: end,
          fetchedAt: now,
          attendees: [{ email, name: prospect, isOrganizer: false }],
          ...(subscriptionId ? { subscriptionId } : {}),
        });
        eventCount++;

        // ~70% show rate.
        if (rnd() > 0.7) continue;

        const roll = rnd();
        let outcome: string | undefined;
        let cashCollected: number | undefined;
        let contractValue: number | undefined;

        if (roll < 0.05) {
          // A few calls with no outcome logged — real teams always have some,
          // and it keeps the coverage warning honest rather than decorative.
          outcome = undefined;
        } else if (roll < 0.32) {
          outcome = "closed";
          contractValue = [4000, 6000, 8000, 12000, 15000][Math.floor(rnd() * 5)];
          cashCollected = rnd() > 0.45 ? contractValue : Math.round(contractValue / 2);
        } else if (roll < 0.78) {
          outcome = "lost";
          contractValue = [4000, 6000, 8000, 12000][Math.floor(rnd() * 4)];
        } else {
          outcome = "follow_up";
          contractValue = [6000, 8000, 12000][Math.floor(rnd() * 3)];
        }

        await ctx.db.insert("calls", {
          closerId: closer._id,
          teamId: args.teamId,
          status: "completed",
          speakerCount: 2,
          createdAt: start,
          startedAt: start,
          endedAt: end,
          duration: 45 * 60,
          prospectName: prospect,
          prospectEmail: email,
          ...(outcome ? { outcome, completedAt: end } : {}),
          ...(cashCollected !== undefined ? { cashCollected } : {}),
          ...(contractValue !== undefined ? { contractValue } : {}),
        });
        callCount++;
      }
    }

    return { events: eventCount, calls: callCount };
  },
});

export const seedDemo = internalAction({
  args: { teamId: v.id("teams"), days: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ days: number; events: number; calls: number }> => {
    const days = Math.max(1, Math.min(args.days ?? 60, 180));
    const tzInfo = await ctx.runQuery(
      internal.closerPerformanceSweep.getTeamTimezone,
      { teamId: args.teamId },
    );
    if (!tzInfo) return { days: 0, events: 0, calls: 0 };

    let events = 0;
    let calls = 0;
    const dayKeys: string[] = [];
    const today = Date.now();
    for (let i = 1; i <= days; i++) {
      const d = new Date(today - i * 86_400_000);
      dayKeys.push(d.toISOString().slice(0, 10));
    }

    for (const dayKey of dayKeys) {
      const r = await ctx.runMutation(internal._demoSeed.seedDemoDay, {
        teamId: args.teamId,
        dayKey,
      });
      events += r.events;
      calls += r.calls;
      // Derive immediately so the board reflects the seed without waiting for
      // the hourly sweep.
      await ctx.runMutation(internal.closerPerformance.recountCloserDay, {
        teamId: args.teamId,
        dayKey,
      });
    }

    return { days: dayKeys.length, events, calls };
  },
});

/** Removes ONLY seeded rows. Genuine data is matched by neither tag. */
export const clearDemoChunk = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ deleted: number; more: boolean }> => {
    let deleted = 0;

    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_team_and_time", (q: any) => q.eq("teamId", args.teamId))
      .take(3000);
    for (const e of events) {
      if (!e.uid?.startsWith(DEMO_PREFIX)) continue;
      await ctx.db.delete(e._id);
      deleted++;
      if (deleted >= 400) return { deleted, more: true };
    }

    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q: any) => q.eq("teamId", args.teamId))
      .take(3000);
    for (const c of calls) {
      if (!c.prospectEmail?.endsWith(DEMO_EMAIL_DOMAIN)) continue;
      await ctx.db.delete(c._id);
      deleted++;
      if (deleted >= 400) return { deleted, more: true };
    }

    return { deleted, more: false };
  },
});

export const clearDemo = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ deleted: number }> => {
    let total = 0;
    for (let i = 0; i < 50; i++) {
      const r = await ctx.runMutation(internal._demoSeed.clearDemoChunk, {
        teamId: args.teamId,
      });
      total += r.deleted;
      if (!r.more) break;
    }
    // Recompute so the board reflects the removal rather than keeping rollup
    // rows derived from data that no longer exists.
    await ctx.runAction(internal.closerPerformanceSweep.backfillTeam, {
      teamId: args.teamId,
      days: 90,
    });
    return { deleted: total };
  },
});
