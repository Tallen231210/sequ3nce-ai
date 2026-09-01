import { v } from "convex/values";
import { isFollowUpTitle } from "./lib/followUpTitle";
import { classifyMatchedCall } from "./setterDataMetrics";
import { isSalesBooking, groupBookingCopies } from "./calendarBookings";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  formatInTimeZone,
  getLocalDateRangeUtc,
  pad2,
} from "./setterDataNotifications";
import {
  MIN_BLOCKED_MS_FOR_CAPACITY,
  attributeBooking,
  isOwnCapacityCalendar,
  unionMs,
  type CalendarEvent,
  type Interval,
} from "./closerPerformanceAttribution";

// Re-exported so callers keep one obvious import site and existing importers
// don't need to know the file was split.
export {
  attributeBooking,
  classifyEvent,
  isOwnCapacityCalendar,
  repNameFromTitle,
  unionMs,
  MIN_BLOCKED_MS_FOR_CAPACITY,
} from "./closerPerformanceAttribution";
export type { CalendarEvent, Interval } from "./closerPerformanceAttribution";

// ============================================================================
// Team Performance Sheet — closer-side daily rollups.
//
// Funnel: Slots -> Booked -> Taken -> Offers -> Closes -> Cash
//
// Everything here is DERIVED from data we already measure:
//   Taken   = completed calls carrying an outcome
//   Offers  = calls where a price was actually pitched (contractValue > 0 —
//             the post-call form REQUIRES an amount on Closed/Lost/Follow-Up
//             and asks for none on No Show, so this is enforced at entry)
//   Closes  = outcome === "closed"
//   Cash    = sum of cashCollected
//   Booked  = calendar events classified as sales calls (see classifyEvent)
//   Slots   = booked + time the closer left unblocked / typical call length
//
// Recounts write ABSOLUTE values and are idempotent, so a row may be
// recomputed any time. Manual corrections live in `closerDailyOverrides`
// and are applied at read time — a recount can never erase them.
// ============================================================================

export const DEFAULT_TIMEZONE = "America/New_York";
export const DEFAULT_CALL_LENGTH_MIN = 45;

/** Team-local "YYYY-MM-DD" for a UTC instant. */
export function dayKeyInTz(ms: number, tz: string): string {
  const z = formatInTimeZone(new Date(ms), tz);
  return `${z.year}-${pad2(z.month)}-${pad2(z.day)}`;
}

/** Team-local "YYYY-MM" for a UTC instant. */
export function monthKeyInTz(ms: number, tz: string): string {
  const z = formatInTimeZone(new Date(ms), tz);
  return `${z.year}-${pad2(z.month)}`;
}


export interface CloserDayTotals {
  slots: number;
  booked: number;
  taken: number;
  offers: number;
  closes: number;
  cash: number;
  contractValue: number;
  missingOutcomes: number;
  /** False when we had no calendar of this closer's own to read that day. */
  capacityKnown: boolean;
  /** Capacity inputs, surfaced so a low Booked% can be interpreted. */
  blockedMinutes: number;
  openMinutes: number;
  /** Follow-ups measured from the title convention (lib/followUpTitle.ts). */
  fuBooked: number;
  fuShown: number;
}

/** Local part of an email/calendar address, lowercased. */
async function recountDayImpl(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  teamId: Id<"teams">,
  dayKey: string,
): Promise<{ closers: number; bookedUnattributed: number }> {
  const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
  if (!team) return { closers: 0, bookedUnattributed: 0 };
  const tz = team.timezone || DEFAULT_TIMEZONE;
  const { startMs, endMs } = getLocalDateRangeUtc(dayKey, tz);

  const closers = (await ctx.db
    .query("closers")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
    .take(500)) as Doc<"closers">[];
  const activeClosers = closers.filter((c) => c.status !== "deactivated");
  // DEACTIVATED closers still tally: a closer leaving the team must not
  // erase the month's history from the board (recounting a day used to
  // delete their rows as "stale" — real revenue vanished with them,
  // found live on E2 2026-09-01). They are excluded from CAPACITY below,
  // so a departed closer's still-syncing calendar can't add phantom slots;
  // days where they have no concrete activity still prune via isEmpty.
  const tallyClosers = closers;
  if (activeClosers.length === 0 && closers.length === 0) {
    return { closers: 0, bookedUnattributed: 0 };
  }

  // --- Calls for the day (team-local), bucketed by closer ------------------
  const calls = (await ctx.db
    .query("calls")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team_and_date", (q: any) =>
      q.eq("teamId", teamId).gte("createdAt", startMs).lt("createdAt", endMs),
    )
    .take(5000)) as Doc<"calls">[];

  // Calendar events that produced a real call — the provider-agnostic
  // "this was a sales call" signal, and the strongest attribution source.
  const closerIdByEventId = new Map<string, string>();
  // Full call by event, for follow-up "shown" evidence (prospectJoined).
  const callByEventId = new Map<string, Doc<"calls">>();
  for (const c of calls) {
    if (c.calendarEventId) {
      closerIdByEventId.set(String(c.calendarEventId), String(c.closerId));
      callByEventId.set(String(c.calendarEventId), c);
    }
  }

  const byCloser = new Map<string, CloserDayTotals>();
  const blank = (): CloserDayTotals => ({
    slots: 0, booked: 0, taken: 0, offers: 0, closes: 0, cash: 0,
    contractValue: 0, missingOutcomes: 0, capacityKnown: false,
    blockedMinutes: 0, openMinutes: 0, fuBooked: 0, fuShown: 0,
  });
  for (const c of tallyClosers) byCloser.set(String(c._id), blank());

  for (const call of calls) {
    const row = byCloser.get(String(call.closerId));
    if (!row) continue; // closer not on this team's roster at all
    // "Taken" = a call actually happened, which we know because we recorded
    // it. Deliberately NOT gated on the post-call form: form completion
    // ranges 6-100% across teams, and a call is no less taken because
    // nobody logged its outcome.
    if (call.status !== "completed") continue;
    row.taken += 1;
    if (call.outcome == null) {
      row.missingOutcomes += 1;
      continue; // nothing recorded → no offer/close/cash signal to read
    }
    // An AI-read call still counts as unconfirmed.
    //
    // `missingOutcomes` feeds the coverage warning, which exists so the board
    // can't present "0 closes" as fact when it means "nobody logged anything".
    // Once extraction fills every outcome, counting those as logged would take
    // coverage to 100% while the numbers became LESS human-confirmed, not more
    // — quietly disabling the one safeguard against the board overstating what
    // it knows. So coverage now measures what a HUMAN confirmed. The figures
    // themselves are still read below; only the confidence signal changes.
    if (call.outcomeSource === "ai") {
      row.missingOutcomes += 1;
    }
    // A pitched amount means a price was actually presented on the call.
    if ((call.contractValue ?? 0) > 0) row.offers += 1;
    if (call.outcome === "closed") {
      row.closes += 1;
      row.cash += call.cashCollected ?? 0;
    }
    row.contractValue += call.contractValue ?? 0;
  }

  // --- Calendar: booked calls + remaining capacity -------------------------
  const events = (await ctx.db
    .query("calendarEvents")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team_and_time", (q: any) =>
      q.eq("teamId", teamId).gte("startTime", startMs).lt("startTime", endMs),
    )
    .take(5000)) as CalendarEvent[];

  // Capacity is bounded by the whole local day, NOT by assumed office hours.
  // These teams don't work one timezone: a closer may run a late shift into
  // 9pm Eastern to reach a Pacific prospect at dinner time. A fixed 9-5 window
  // counted those calls as booked while never counting the time they occupied,
  // which drove Booked% toward a meaningless 100%. Availability is instead
  // whatever the closer did NOT mark off — which is how they actually set it.
  const dayStartMs = startMs;
  const dayEndMs = endMs;
  const callLenMs =
    (team.closerTypicalCallLengthMin ?? DEFAULT_CALL_LENGTH_MIN) * 60_000;
  // Over-booking teams fit more than one prospect in a slot; 1 for everyone else.
  const bookingsPerSlot = Math.max(
    1,
    Math.min(5, team.closerBookingsPerSlot ?? 1),
  );

  // --- Which calendars represent each closer's own availability -----------
  const subs = (await ctx.db
    .query("closerCalendarSubscriptions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
    .take(1000)) as Doc<"closerCalendarSubscriptions">[];

  const emailByCloser = new Map(
    activeClosers.map((c) => [String(c._id), c.email]),
  );
  /** Subscription ids that carry their subscriber's own availability. */
  const ownSubIds = new Set<string>();
  /** Closers who have at least one readable calendar of their own. */
  const closersWithOwnCalendar = new Set<string>();
  /** Closers who subscribe to any calendar at all. */
  const closersWithAnySub = new Set<string>();
  for (const sub of subs) {
    if (sub.enabled === false) continue;
    const owner = String(sub.closerId);
    closersWithAnySub.add(owner);
    if (!isOwnCapacityCalendar(sub, emailByCloser.get(owner))) continue;
    ownSubIds.add(String(sub._id));
    closersWithOwnCalendar.add(owner);
  }

  /**
   * An event counts against `closerKey`'s capacity only if it arrived on a
   * calendar they own. Events with no subscription came through the closer's
   * direct calendar connection, so they are theirs by definition.
   */
  const isOwnCapacitySource = (ev: CalendarEvent, closerKey: string) => {
    if (String(ev.closerId) !== closerKey) return false;
    if (!ev.subscriptionId) return true;
    return ownSubIds.has(String(ev.subscriptionId));
  };

  // Intervals rather than running totals: overlapping blocks are normal, and
  // summing them double-counts. Unioned once the day's events are collected.
  const blockedIntervals = new Map<string, Interval[]>();
  const bookedIntervals = new Map<string, Interval[]>();
  const pushInterval = (
    map: Map<string, Interval[]>,
    key: string,
    start: number,
    end: number,
  ) => {
    // Clamp to the local day so an overnight event can't consume more than
    // the day it lands in.
    const s = Math.max(start, dayStartMs);
    const e = Math.min(end, dayEndMs);
    if (e <= s) return;
    const list = map.get(key) ?? [];
    list.push([s, e]);
    map.set(key, list);
  };
  let bookedUnattributed = 0;
  // Reps named on bookings who hold no Sequ3nce seat, e.g. a closer the team
  // never onboarded. Surfaced so the gap reads as a fact about the roster
  // rather than as a defect in the numbers.
  const unknownRepCounts = new Map<string, number>();

  // Collapse duplicate copies of the same meeting FIRST. See
  // groupBookingCopies for why — one appointment can land on several closers'
  // calendars and counting each copy doubled a real team's bookings.
  const copiesByUid = groupBookingCopies(events);

  const closerNames = tallyClosers.map((c) => ({
    id: String(c._id),
    name: c.name ?? "",
  }));

  for (const [, copies] of copiesByUid) {
    const ev = copies[0];
    const linkedCloser =
      copies
        .map((c) => closerIdByEventId.get(String(c._id)))
        .find((x): x is string => !!x) ?? null;
    // Shared with the job that turns bookings into calls on the Overview tier.
    // Two copies of this rule would eventually disagree, and a board showing
    // more booked calls than the queue asks about reads as broken numbers.
    const isCall = isSalesBooking(copies, {
      producedARecordedCall: !!linkedCloser,
    });

    // An all-day event (OOO, a holiday) covers the entire day.
    const evStart = ev.isAllDay ? dayStartMs : ev.startTime;
    const evEnd = ev.isAllDay ? dayEndMs : ev.endTime;

    if (isCall) {
      const { closerId: ownerId, unknownRep } = attributeBooking(
        copies,
        linkedCloser,
        closerNames,
      );
      if (ownerId && byCloser.has(ownerId)) {
        byCloser.get(ownerId)!.booked += 1;
        // A call occupies the closer who took it, whichever calendar it
        // synced through.
        pushInterval(bookedIntervals, ownerId, evStart, evEnd);
        if (isFollowUpTitle(ev.title)) {
          const row = byCloser.get(ownerId)!;
          row.fuBooked += 1;
          // "FU shown" uses the platform's own show-classifier on the
          // recorded call linked to this booking — same evidence rules as
          // the attendance system (outcome beats presence beats duration),
          // so a call the closer logged as closed counts as shown even if
          // speaker verification never ran. No call = not shown.
          const linkedCall =
            copies
              .map((c) => callByEventId.get(String(c._id)))
              .find((x): x is Doc<"calls"> => !!x) ?? null;
          if (linkedCall && classifyMatchedCall(linkedCall) === "showed") {
            row.fuShown += 1;
          }
        }
      } else {
        // Not ours to credit — counts for the team, not for any rep.
        bookedUnattributed += 1;
        if (unknownRep) {
          unknownRepCounts.set(
            unknownRep,
            (unknownRepCounts.get(unknownRep) ?? 0) + 1,
          );
        }
      }
    } else {
      // A block removes capacity only from a calendar the closer actually
      // owns. Without this test, a teammate's block arriving through a
      // subscription eats capacity from everyone subscribed to it.
      const charged = new Set<string>();
      for (const copy of copies) {
        const key = String(copy.closerId);
        if (!byCloser.has(key) || charged.has(key)) continue;
        if (!isOwnCapacitySource(copy, key)) continue;
        charged.add(key);
        pushInterval(blockedIntervals, key, evStart, evEnd);
      }
    }
  }

  // Slots are inferred from what a calendar says is free. With no calendar
  // connected there is nothing to infer from, so claiming a full working day
  // of capacity would be inventing the Booked% denominator — and would show
  // every not-yet-onboarded team a red 0% against capacity we made up.
  // No calendar means no capacity signal: slots fall back to actual bookings.
  // Capacity is inferred from a calendar's free time, so it can only be
  // computed for a closer whose own calendar we can read.
  //
  // Order matters: once a closer has subscriptions, those decide it — a
  // manager who marks every calendar as "not my availability" is telling us
  // capacity is unmeasurable, and a stale OAuth token on the closer record
  // must not silently overrule them. The credential fallback applies only to
  // closers with no subscriptions at all, whose events arrive directly.
  const hasCalendar = new Map(
    activeClosers.map((c) => {
      const id = String(c._id);
      if (closersWithAnySub.has(id)) return [id, closersWithOwnCalendar.has(id)];
      return [
        id,
        !!(c.googleCalendarRefreshToken || c.icsUrl || c.calendarProvider),
      ];
    }),
  );

  // Capacity = the time a closer left open on their own calendar.
  //
  //   available = day − union(their blocks ∪ their booked calls)
  //   slots     = booked + available / typical call length
  //
  // No assumed office hours: the closer's blocks ARE the statement of when
  // they're unavailable, which is how they actually set availability, and it
  // travels across timezones and late shifts without configuration.
  const dayMs = Math.max(0, dayEndMs - dayStartMs);
  for (const [closerKey, row] of byCloser) {
    const blocks = blockedIntervals.get(closerKey) ?? [];
    const booked = bookedIntervals.get(closerKey) ?? [];
    const blockedMs = unionMs(blocks);

    // Two ways capacity is unknowable: no calendar of theirs to read, or a
    // calendar so sparsely blocked it isn't declaring availability at all.
    // Treating either as "fully available" would invent the denominator, so
    // slots fall back to bookings and the board suppresses Booked%.
    const capacityReadable =
      !!hasCalendar.get(closerKey) && blockedMs >= MIN_BLOCKED_MS_FOR_CAPACITY;

    row.blockedMinutes = Math.round(blockedMs / 60_000);

    if (!capacityReadable) {
      row.slots = row.booked;
      row.capacityKnown = false;
      row.openMinutes = 0;
      continue;
    }

    // Union blocks and calls together — a call scheduled inside a blocked
    // period must not subtract its time twice.
    const busyMs = unionMs([...blocks, ...booked]);
    const openMs = Math.max(0, dayMs - busyMs);
    row.slots =
      row.booked + Math.floor(openMs / callLenMs) * bookingsPerSlot;
    row.openMinutes = Math.round(openMs / 60_000);
    row.capacityKnown = true;
  }

  // --- Persist absolute values --------------------------------------------
  const existing = (await ctx.db
    .query("closerDailyStats")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team_and_day", (q: any) =>
      q.eq("teamId", teamId).eq("dayKey", dayKey),
    )
    .collect()) as Doc<"closerDailyStats">[];
  const existingByCloser = new Map(existing.map((r) => [String(r.closerId), r]));
  const now = Date.now();

  for (const [closerKey, totals] of byCloser) {
    const prior = existingByCloser.get(closerKey);
    const isEmpty =
      totals.slots === 0 && totals.booked === 0 && totals.taken === 0 &&
      totals.closes === 0 && totals.cash === 0;
    if (prior) {
      existingByCloser.delete(closerKey);
      if (isEmpty) {
        await ctx.db.delete(prior._id); // nothing happened; don't keep noise
      } else {
        await ctx.db.patch(prior._id, { ...totals, recountedAt: now });
      }
    } else if (!isEmpty) {
      await ctx.db.insert("closerDailyStats", {
        teamId,
        dayKey,
        closerId: closerKey as Id<"closers">,
        ...totals,
        recountedAt: now,
      });
    }
  }
  // Rows for closers who no longer have any activity that day.
  for (const [, stale] of existingByCloser) await ctx.db.delete(stale._id);

  // Team-level bookings that couldn't be attributed to one rep.
  const teamRow = (await ctx.db
    .query("closerDailyTeamStats")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team_and_day", (q: any) =>
      q.eq("teamId", teamId).eq("dayKey", dayKey),
    )
    .first()) as Doc<"closerDailyTeamStats"> | null;
  const unknownReps = Array.from(unknownRepCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  if (teamRow) {
    if (bookedUnattributed === 0) await ctx.db.delete(teamRow._id);
    else
      await ctx.db.patch(teamRow._id, {
        bookedUnattributed,
        unknownReps,
        recountedAt: now,
      });
  } else if (bookedUnattributed > 0) {
    await ctx.db.insert("closerDailyTeamStats", {
      teamId,
      dayKey,
      bookedUnattributed,
      unknownReps,
      recountedAt: now,
    });
  }

  return { closers: byCloser.size, bookedUnattributed };
}

export const recountCloserDay = internalMutation({
  args: { teamId: v.id("teams"), dayKey: v.string() },
  handler: async (ctx, args) => recountDayImpl(ctx, args.teamId, args.dayKey),
});

/**
 * Recount the team-local day containing `atMs`. Called after a call is
 * completed or edited so the scoreboard reflects it immediately (call
 * outcomes are frequently edited after the fact).
 */
export const recountCloserDayForInstant = internalMutation({
  args: { teamId: v.id("teams"), atMs: v.number() },
  handler: async (ctx, args) => {
    const team = (await ctx.db.get(args.teamId)) as Doc<"teams"> | null;
    if (!team) return { closers: 0, bookedUnattributed: 0 };
    const tz = team.timezone || DEFAULT_TIMEZONE;
    return recountDayImpl(ctx, args.teamId, dayKeyInTz(args.atMs, tz));
  },
});

/** Raw derived rows for a team-local day range (inclusive dayKeys). */
export const readDailyStatsRange = internalQuery({
  args: {
    teamId: v.id("teams"),
    startDayKey: v.string(),
    endDayKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("closerDailyStats")
      .withIndex("by_team_and_day", (q) =>
        q
          .eq("teamId", args.teamId)
          .gte("dayKey", args.startDayKey)
          .lte("dayKey", args.endDayKey),
      )
      .collect();
  },
});
