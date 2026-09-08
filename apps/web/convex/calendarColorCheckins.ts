// ============================================================================
// Calendar check-ins — the manager card beside "EOD check-ins".
//
// E2 runs a calendar color rulebook: after every call the closer recolors the
// booking to what happened. This is where Zion sees who did and who didn't,
// the way the EOD card shows who filed. Today is "calls already over today";
// yesterday names the bookings still not recolored. Statistics only.
//
// Gated per team by the calendar_color_tracking beta flag: the query returns
// null and the card renders nothing for everyone else.
// ============================================================================

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { getLocalDateRangeUtc } from "./setterDataNotifications";
import { needsRecolor, type RecolorState } from "./lib/calendarColorRules";
import {
  collectRecolorStates,
  teamHasColorTracking,
  type BookingRecolor,
} from "./calendarColorCheckinsCore";

export interface PendingBooking {
  title: string;
  startTime: number;
  state: RecolorState;
  label: string;
}

export interface DayCheckins {
  /** Bookings whose call is over (plus grace). */
  due: number;
  /** Recolored after the call — we watched it happen. */
  done: number;
  /** Post-call color, but set before we started watching; not a miss. */
  unverified: number;
  /** The misses, in start-time order. */
  pending: PendingBooking[];
}

export interface CloserCheckins {
  closerId: string;
  name: string;
  yesterday: DayCheckins;
  today: DayCheckins;
}

function emptyDay(): DayCheckins {
  return { due: 0, done: 0, unverified: 0, pending: [] };
}

function addToDay(day: DayCheckins, b: BookingRecolor): void {
  if (b.state === "not_due") return;
  day.due += 1;
  if (b.state === "done") day.done += 1;
  else if (b.state === "unverified") day.unverified += 1;
  if (needsRecolor(b.state)) {
    day.pending.push({
      title: b.title,
      startTime: b.startTime,
      state: b.state,
      label: b.label,
    });
  }
}

export const getCalendarCheckins = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);
    if (!teamHasColorTracking(team)) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;
    const now = Date.now();
    const todayKey = dayKeyInTz(now, tz);
    const yesterdayKey = dayKeyInTz(now - 86_400_000, tz);
    const { startMs } = getLocalDateRangeUtc(yesterdayKey, tz);
    const { endMs } = getLocalDateRangeUtc(todayKey, tz);

    const [bookings, closers] = await Promise.all([
      collectRecolorStates(ctx, teamId, startMs, endMs, now),
      ctx.db
        .query("closers")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .take(500),
    ]);

    const rows = new Map<string, CloserCheckins>();
    for (const c of closers) {
      if (c.status === "deactivated") continue;
      rows.set(String(c._id), {
        closerId: String(c._id),
        name: c.name ?? "Unnamed",
        yesterday: emptyDay(),
        today: emptyDay(),
      });
    }
    for (const b of bookings) {
      const row = rows.get(b.closerId);
      if (!row) continue; // departed closer's calendar still syncing
      const day = dayKeyInTz(b.startTime, tz);
      if (day === todayKey) addToDay(row.today, b);
      else if (day === yesterdayKey) addToDay(row.yesterday, b);
    }

    const list = Array.from(rows.values())
      .filter((r) => r.yesterday.due > 0 || r.today.due > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    return { todayKey, yesterdayKey, closers: list };
  },
});
