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
//   Slots   = booked + open working time / typical call length
//
// Recounts write ABSOLUTE values and are idempotent, so a row may be
// recomputed any time. Manual corrections live in `closerDailyOverrides`
// and are applied at read time — a recount can never erase them.
// ============================================================================

export const DEFAULT_TIMEZONE = "America/New_York";
export const DEFAULT_WORKDAY_START_MIN = 9 * 60;
export const DEFAULT_WORKDAY_END_MIN = 17 * 60;
export const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri
export const DEFAULT_CALL_LENGTH_MIN = 45;

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

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

/** 0=Sun..6=Sat for a team-local day key. */
function weekdayOfDayKey(dayKey: string, tz: string): number {
  const { startMs } = getLocalDateRangeUtc(dayKey, tz);
  // Probe midday to dodge DST edges.
  const z = formatInTimeZone(new Date(startMs + 12 * 60 * 60 * 1000), tz);
  return WEEKDAY_INDEX[z.weekday] ?? 1;
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

/** Overlap of [aStart,aEnd) and [bStart,bEnd) in ms. */
function overlapMs(aS: number, aE: number, bS: number, bE: number): number {
  return Math.max(0, Math.min(aE, bE) - Math.max(aS, bS));
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
    contractValue: 0, missingOutcomes: 0,
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

  const weekday = weekdayOfDayKey(dayKey, tz);
  const workdays = team.closerWorkdays ?? DEFAULT_WORKDAYS;
  const isWorkday = workdays.includes(weekday);
  const winStartMs =
    startMs + (team.closerWorkdayStartMin ?? DEFAULT_WORKDAY_START_MIN) * 60_000;
  const winEndMs =
    startMs + (team.closerWorkdayEndMin ?? DEFAULT_WORKDAY_END_MIN) * 60_000;
  const callLenMs =
    (team.closerTypicalCallLengthMin ?? DEFAULT_CALL_LENGTH_MIN) * 60_000;

  const blockedMsByCloser = new Map<string, number>();
  const bookedMsByCloser = new Map<string, number>();
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

    // All-day events (OOO, holidays) wipe the whole working window.
    const evStart = ev.isAllDay ? winStartMs : ev.startTime;
    const evEnd = ev.isAllDay ? winEndMs : ev.endTime;
    const inWindow = overlapMs(evStart, evEnd, winStartMs, winEndMs);

    if (isCall) {
      const { closerId: ownerId, unknownRep } = attributeBooking(
        copies,
        linkedCloser,
        closerNames,
      );
      if (ownerId && byCloser.has(ownerId)) {
        byCloser.get(ownerId)!.booked += 1;
        bookedMsByCloser.set(
          ownerId,
          (bookedMsByCloser.get(ownerId) ?? 0) + inWindow,
        );
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
      // A block only removes capacity from the calendars it actually sits on.
      for (const key of new Set(copies.map((c) => String(c.closerId)))) {
        if (!byCloser.has(key)) continue;
        blockedMsByCloser.set(key, (blockedMsByCloser.get(key) ?? 0) + inWindow);
      }
    }
  }

  // Slots are inferred from what a calendar says is free. With no calendar
  // connected there is nothing to infer from, so claiming a full working day
  // of capacity would be inventing the Booked% denominator — and would show
  // every not-yet-onboarded team a red 0% against capacity we made up.
  // No calendar means no capacity signal: slots fall back to actual bookings.
  // Credentials alone are too narrow a test: on a real team, two closers had
  // no token on their own record yet plainly had synced calendars, because
  // their events arrive through a teammate's subscription. Actual events for
  // that day are the direct evidence that a calendar is being read for them.
  const hasCalendar = new Map(
    activeClosers.map((c) => [
      String(c._id),
      !!(c.googleCalendarRefreshToken || c.icsUrl || c.calendarProvider),
    ]),
  );
  for (const ev of events) {
    const key = String(ev.closerId);
    if (hasCalendar.has(key)) hasCalendar.set(key, true);
  }

  const windowMs = Math.max(0, winEndMs - winStartMs);
  for (const [closerKey, row] of byCloser) {
    if (!isWorkday || !hasCalendar.get(closerKey)) {
      // Off-day, or no calendar to read: only actual booked calls count as
      // capacity, so Booked% can't be diluted by a weekend the team never
      // intended to work, or by capacity we assumed rather than observed.
      row.slots = row.booked;
      continue;
    }
    const blocked = blockedMsByCloser.get(closerKey) ?? 0;
    const bookedTime = bookedMsByCloser.get(closerKey) ?? 0;
    const openMs = Math.max(0, windowMs - blocked - bookedTime);
    row.slots = row.booked + Math.floor(openMs / callLenMs);
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
