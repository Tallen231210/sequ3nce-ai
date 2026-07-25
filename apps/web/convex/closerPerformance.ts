import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  formatInTimeZone,
  getLocalDateRangeUtc,
  pad2,
} from "./setterDataNotifications";

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

type CalendarEvent = Doc<"calendarEvents">;

/**
 * Is this calendar event a sales call, or the closer blocking time out?
 *
 * This is what makes Slots real: closers create availability by blocking
 * their calendars, so we must tell "Gym"/"OOO" (capacity removed) from an
 * actual booked call (capacity consumed by a prospect).
 *
 *   1. The event produced a real recorded call  -> sales call.
 *      Works on EVERY calendar provider, because it's our own data.
 *   2. The event has an external attendee       -> sales call.
 *      Google-only: the ICS/Microsoft sync path never populates attendees.
 *   3. Otherwise                                -> personal block.
 */
export function classifyEvent(
  event: CalendarEvent,
  eventIdsWithCalls: Set<string>,
): "call" | "block" {
  if (eventIdsWithCalls.has(String(event._id))) return "call";
  const external = (event.attendees ?? []).some(
    (a) => a.isOrganizer !== true && !!a.email,
  );
  return external ? "call" : "block";
}

export type Interval = [start: number, end: number];

/**
 * Total time covered by these intervals, counting overlaps once.
 *
 * Summing durations instead would double-count: a real closer's calendar
 * carries overlapping blocks routinely (a 3-hour "Unavailable" sitting inside
 * an all-day "OOO"), and one live team summed to 36 hours of blocked time in
 * a 24-hour day.
 */
export function unionMs(intervals: Interval[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals]
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  if (sorted.length === 0) return 0;

  let total = 0;
  let [curStart, curEnd] = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s > curEnd) {
      total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  return total + (curEnd - curStart);
}

/**
 * Below this much declared-unavailable time in a day, we can't treat the
 * calendar as a statement of availability. A rep who blocks nothing would
 * otherwise appear to offer ~24 hours of capacity, making Booked% a fiction.
 * The board reports capacity as unmeasured instead — see computeCapacitySignal.
 */
export const MIN_BLOCKED_MS_FOR_CAPACITY = 8 * 60 * 60 * 1000;

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
}

/** Local part of an email/calendar address, lowercased. */
function localPart(address: string): string {
  return address.trim().toLowerCase().split("@")[0] ?? "";
}

/**
 * Does this subscribed calendar represent the subscriber's OWN availability?
 *
 * Teams routinely subscribe to each other's calendars, so a closer's feed
 * carries far more than their own diary — on one live team a single closer's
 * feed held 1,869 events in a month, most of them teammates'. Counting all of
 * it as "time blocked" consumed their entire working window and collapsed
 * their capacity to zero.
 *
 * `accessRole` cannot decide this: on a shared Google Workspace every
 * subscription reports "owner". The address can: it is either "primary" or
 * the calendar owner's email.
 *
 * An explicit `countsTowardCapacity` set by a manager always wins — inference
 * is a default, not a verdict.
 */
export function isOwnCapacityCalendar(
  sub: { googleCalendarId: string; countsTowardCapacity?: boolean },
  closerEmail: string | undefined,
): boolean {
  if (typeof sub.countsTowardCapacity === "boolean") {
    return sub.countsTowardCapacity;
  }
  const cal = sub.googleCalendarId.trim().toLowerCase();
  if (cal === "primary") return true;
  if (!closerEmail) return false;
  const mine = localPart(closerEmail);
  if (!mine) return false;
  const theirs = localPart(cal);
  // Reps commonly run a second calendar ("nick@" plus "nick2@"), so match the
  // local part with an optional numeric suffix rather than requiring equality.
  return theirs === mine || new RegExp(`^${escapeRe(mine)}\\d+$`).test(theirs);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Booking-title convention used by Calendly, GHL and Zoom scheduler:
 * "Prospect Name and Rep Name", sometimes prefixed with a status word.
 * Returns the rep half, or null when the title doesn't follow the pattern.
 */
export function repNameFromTitle(title: string | undefined): string | null {
  if (!title) return null;
  const cleaned = title
    .replace(/^\s*(canceled|cancelled|rescheduled|second call|follow[- ]?up)\s*:\s*/i, "")
    .trim();
  const m = cleaned.match(/\band\s+(.{2,60})$/i);
  if (!m) return null;
  // Drop trailing qualifiers ("Nick Rowe second call") so the name matches.
  return m[1]
    .replace(/\s+(second call|follow[- ]?up|call|meeting|discovery)\s*$/i, "")
    .trim() || null;
}

function nameMatchesCloser(repName: string, closerName: string): boolean {
  const rep = repName.toLowerCase();
  const full = closerName.trim().toLowerCase();
  if (full.length > 2 && (rep === full || rep.includes(full) || full.includes(rep))) {
    return true;
  }
  // Closers are often stored by first name only ("Nick" vs "Nick Rowe").
  const first = full.split(/\s+/)[0] ?? "";
  return first.length > 2 && rep.split(/\s+/)[0] === first;
}

export interface BookingAttribution {
  /** The closer who owns this booking, or null if we can't say. */
  closerId: string | null;
  /** Rep named in the title who isn't a Sequ3nce closer — surfaced to the
   *  manager rather than silently folded into an anonymous bucket. */
  unknownRep: string | null;
}

/**
 * Pick which closer owns a booking when the same meeting appears on several
 * calendars. Teams commonly subscribe to each other's calendars, so the
 * `closerId` on any single copy is not authoritative — verified on a live
 * team where 389 of 390 unique meetings appeared on multiple calendars.
 *
 * Priority:
 *  1. an actual recorded call — provider-agnostic and unambiguous;
 *  2. the rep named in the title. This outranks calendar ownership because
 *     the title states who is ON the call while the calendar only says whose
 *     subscription it synced through. A live team runs a fourth rep who
 *     isn't a Sequ3nce user; when their booking lands on a single teammate's
 *     calendar, trusting ownership credited the wrong person;
 *  3. only then, a single unambiguous copy.
 *
 * A title naming a non-closer STOPS attribution — we'd rather report "210
 * bookings belong to Callum B, who isn't on Sequ3nce" than credit them to
 * whoever happened to subscribe. Inventing an owner quietly corrupts every
 * per-rep rate on the leaderboard.
 */
export function attributeBooking(
  copies: CalendarEvent[],
  closerIdFromCall: string | null,
  closerNames: Array<{ id: string; name: string }>,
): BookingAttribution {
  if (closerIdFromCall) return { closerId: closerIdFromCall, unknownRep: null };

  const repName = repNameFromTitle(copies[0]?.title);
  if (repName) {
    const hits = closerNames.filter((c) => nameMatchesCloser(repName, c.name));
    if (hits.length === 1) return { closerId: hits[0].id, unknownRep: null };
    // Named a rep we don't recognise: attributable to a person, just not to
    // anyone with a seat. Report who, so the manager can act on it.
    if (hits.length === 0) return { closerId: null, unknownRep: repName };
    // Ambiguous name (two closers match) — fall through to calendar evidence.
  }

  const distinct = Array.from(new Set(copies.map((c) => String(c.closerId))));
  if (distinct.length === 1) return { closerId: distinct[0], unknownRep: null };

  return { closerId: null, unknownRep: null };
}

/**
 * Recompute one team-local day for every closer on the team, writing
 * absolute values. Idempotent — safe to re-run at any time.
 */
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
  if (activeClosers.length === 0) return { closers: 0, bookedUnattributed: 0 };

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
  for (const c of calls) {
    if (c.calendarEventId) {
      closerIdByEventId.set(String(c.calendarEventId), String(c.closerId));
    }
  }

  const byCloser = new Map<string, CloserDayTotals>();
  const blank = (): CloserDayTotals => ({
    slots: 0, booked: 0, taken: 0, offers: 0, closes: 0, cash: 0,
    contractValue: 0, missingOutcomes: 0, capacityKnown: false,
  });
  for (const c of activeClosers) byCloser.set(String(c._id), blank());

  for (const call of calls) {
    const row = byCloser.get(String(call.closerId));
    if (!row) continue; // call from a deactivated closer
    // "Taken" = a call actually happened, which we know because we recorded
    // it. Deliberately NOT gated on the post-call form: form completion
    // ranges 6-100% across teams, and a call is no less taken because
    // nobody logged its outcome.
    if (call.status !== "completed") continue;
    row.taken += 1;
    if (call.outcome == null) {
      row.missingOutcomes += 1;
      continue; // no form → no offer/close/cash signal to read
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

  // Collapse duplicate copies of the same meeting FIRST. Shared/subscribed
  // calendars mean one appointment can land on several closers' calendars —
  // counting each copy inflated a real team's bookings ~2x (854 rows for 390
  // real meetings). `uid` is the provider's stable event id, so it dedupes
  // reliably across subscriptions.
  const copiesByUid = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const key = ev.uid || `${ev.startTime}|${(ev.title ?? "").trim().toLowerCase()}`;
    const list = copiesByUid.get(key) ?? [];
    list.push(ev);
    copiesByUid.set(key, list);
  }

  const closerNames = activeClosers.map((c) => ({
    id: String(c._id),
    name: c.name ?? "",
  }));

  for (const [, copies] of copiesByUid) {
    const ev = copies[0];
    const linkedCloser =
      copies
        .map((c) => closerIdByEventId.get(String(c._id)))
        .find((x): x is string => !!x) ?? null;
    // A sales call if ANY copy proves it: it produced a recorded call, or it
    // carries a prospect attendee (the Google sync already strips the closer
    // and same-domain teammates, so an attendee here means an outsider).
    const hasExternalAttendee = copies.some((c) =>
      (c.attendees ?? []).some((a) => a.isOrganizer !== true && !!a.email),
    );
    const isCall = !!linkedCloser || hasExternalAttendee;

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

    if (!capacityReadable) {
      row.slots = row.booked;
      row.capacityKnown = false;
      continue;
    }

    // Union blocks and calls together — a call scheduled inside a blocked
    // period must not subtract its time twice.
    const busyMs = unionMs([...blocks, ...booked]);
    const openMs = Math.max(0, dayMs - busyMs);
    row.slots = row.booked + Math.floor(openMs / callLenMs);
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
