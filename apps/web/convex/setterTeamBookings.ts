// ============================================================================
// One pass over a team's calendar: every sales booking in a window, with the
// facts the attribution and verdict rules need — the booking link, the title
// tag, the guest's Close lead, who touched that lead before the call, the
// linked recording, and the closer's own-calendar colour.
//
// Reads: two range scans, five small team-scoped lists, one point read per
// unique guest email and one per matched lead (its Close activity). The
// point reads are capped so the operation count stays under Convex's 4,096
// per transaction, and every scan is capped so the documents stay under 32k;
// each cap is reported as `truncated` rather than hidden.
// ============================================================================

import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { groupBookingCopies, isSalesBooking } from "./calendarBookings";
import { buildOwnCopySelector, pickBestOwnCopy } from "./calendarColorCheckinsCore";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { classifyExcludedTitle, isExcludedBookingTitle } from "./lib/bookingExclusions";
import { recolorState, type RecolorState } from "./lib/calendarColorRules";
import { DESCRIPTION_SYNC_SINCE_MS, parseEventName } from "./lib/eventName";
import { isFollowUpTitle } from "./lib/followUpTitle";
import {
  classifyBooking,
  showVerdictFor,
  type CallEvidence,
  type Classification,
  type RosterRef,
  type Touch,
  type Verdict,
} from "./lib/setterTeamAttribution";
import { extractSetterToken, matchToken, stripSetterToken } from "./lib/setterTitleMatch";
import {
  carriesEvidence,
  extractTrailingSetterToken,
  guestEmailOf,
  loadCallsForEvents,
  matchTokenExact,
  mergeImportedCopies,
  rosterNamesOf,
  rosterRefsOf,
} from "./setterTeamBookingHelpers";
import { lookupLeadsByEmailNorm } from "./setterLeadLookup";
import { loadLeadTouches } from "./setterTeamTouches";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_TEAM_RANGE_DAYS = 14;
export const MAX_TEAM_RANGE_MS = MAX_TEAM_RANGE_DAYS * DAY_MS;
/** A lead is usually worked in the week before the call; older touches belong to an earlier booking. */
const TOUCH_LOOKBACK_MS = 7 * DAY_MS;
/** Calls can be created a little after the booking's start; widen the read. */
const CALL_LOOKAHEAD_MS = 3 * 60 * 60 * 1000;
/** Widest window a caller handing in its own rows may ask for (the confirmation prefill's far-out bookings). */
const MAX_SPAN_MS = 60 * DAY_MS;
/** A dial counts as reached at this many seconds on the line unless the team set its own threshold. */
const DEFAULT_CONNECT_SEC = 60;
/** Row key for a booking with no copy on any connected closer's own calendar. */
export const UNKNOWN_CLOSER = "no-calendar-owner";
// Budget: 8k + 3k events/calls, ≤1.5k lead point reads, ≤12k lead-event rows,
// plus the five small lists — under 32k documents and 4,096 operations.
const EVENT_TAKE = 8_000;
const CALL_TAKE = 3_000;
const LEAD_CAP = 1_500;

export interface BookingRecord {
  key: string;
  eventIds: string[];
  closerId: string;
  closerName: string;
  title: string;
  /** Title without the setter token, for display. */
  displayTitle: string;
  eventName: string | null;
  descriptionTrusted: boolean;
  startTime: number;
  endTime: number;
  dayKey: string;
  bookedAt: number | null;
  bookedAtInferred: boolean;
  bookedDayKey: string | null;
  guestEmailNorm: string | null;
  leadContactId: string | null;
  token: string | null;
  taggedRosterIds: string[];
  touches: Touch[];
  anyoneTouchedBefore: boolean | null;
  classification: Classification;
  verdict: Verdict;
  recolor: RecolorState;
  colorId: string | null;
  isFollowUp: boolean;
}

export interface TeamBookings {
  records: BookingRecord[];
  rosters: RosterRef[];
  timezone: string;
  startMs: number;
  endMs: number;
  /** Which reads hit their cap — the numbers are then partial, and say so. */
  truncated: string[];
  leadsLookedUp: number;
  /** Cancelled copies seen (not bookings). */
  cancelled: number;
  /** CRM user id → name, for touches by people who aren't on the EOD roster. */
  crmUserNames: Record<string, string>;
}

export interface CollectOptions {
  /**
   * Use these calendar rows instead of scanning the window by start time.
   * The confirmation prefill hands in the copies booked on one day and the
   * copies starting on it; their calls are then read per event.
   */
  eventRows?: Doc<"calendarEvents">[];
}

export async function collectTeamBookings(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  startMs: number,
  endMs: number,
  nowMs: number,
  opts: CollectOptions = {},
): Promise<TeamBookings> {
  const truncated: string[] = [];
  // Safety net under the callers' own clamps: one transaction has to stay
  // inside Convex's read budget whatever window was asked for.
  const maxSpan = opts.eventRows ? MAX_SPAN_MS : MAX_TEAM_RANGE_MS;
  if (endMs - startMs > maxSpan) {
    endMs = startMs + maxSpan;
    truncated.push("range");
  }
  const [team, rosterRows, closers, subs, reps, events] = await Promise.all([
    ctx.db.get(teamId),
    ctx.db.query("setterRoster").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(200),
    ctx.db.query("closers").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(500),
    ctx.db.query("closerCalendarSubscriptions").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(1000),
    ctx.db.query("setterReps").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(500),
    opts.eventRows
      ? Promise.resolve(opts.eventRows.filter((e) => e.startTime >= startMs && e.startTime < endMs))
      : ctx.db
          .query("calendarEvents")
          .withIndex("by_team_and_time", (q) => q.eq("teamId", teamId).gte("startTime", startMs).lt("startTime", endMs))
          // Newest first, so a cap drops the oldest days rather than the ones being looked at.
          .order("desc")
          .take(EVENT_TAKE),
  ]);
  if (!opts.eventRows && events.length >= EVENT_TAKE) truncated.push("events");
  const calls = opts.eventRows
    ? await loadCallsForEvents(ctx, events)
    : await ctx.db
        .query("calls")
        .withIndex("by_team_and_date", (q) =>
          q.eq("teamId", teamId).gte("createdAt", startMs).lt("createdAt", endMs + CALL_LOOKAHEAD_MS),
        )
        .order("desc")
        .take(CALL_TAKE);
  if (!opts.eventRows && calls.length >= CALL_TAKE) truncated.push("calls");

  const tz = (team as { timezone?: string } | null)?.timezone || DEFAULT_TIMEZONE;
  const teamWords = team?.closerExcludedBookingTitles;
  const connectSec = team?.setterConnectionThresholdSec ?? DEFAULT_CONNECT_SEC;
  const rosters = rosterRefsOf(rosterRows);
  const rosterNames = rosterNamesOf(rosters);
  const rosterByCrm = new Map(rosters.filter((r) => r.crmUserId).map((r) => [r.crmUserId as string, r]));
  const closerName = new Map(closers.map((c) => [String(c._id), c.name ?? c.email ?? "closer"]));
  const crmUserNames: Record<string, string> = {};
  for (const rep of reps) crmUserNames[rep.ghlUserId] = rep.name;
  const isOwnCopy = buildOwnCopySelector(closers, subs);

  const callByEventId = new Map<string, Doc<"calls">>();
  for (const c of calls) {
    if (c.calendarEventId) callByEventId.set(String(c.calendarEventId), c);
  }
  const excludedTitle = (title: string | undefined) => isExcludedBookingTitle(title, teamWords);

  // First pass: keep the sales bookings and collect the guests worth a lead
  // lookup — cancelled and non-sales groups must not spend the cap.
  const kept: Array<{ copies: Doc<"calendarEvents">[]; recorded: Doc<"calls"> | null }> = [];
  const guestEmails: string[] = [];
  let cancelled = 0;
  for (const copies of mergeImportedCopies(groupBookingCopies(events))) {
    if (copies.some((c) => classifyExcludedTitle(c.title, teamWords) === "cancelled")) {
      cancelled += 1;
      continue;
    }
    const recorded = copies.map((c) => callByEventId.get(String(c._id))).find((c): c is Doc<"calls"> => !!c) ?? null;
    if (!isSalesBooking(copies, { producedARecordedCall: !!recorded, excludedTitle })) continue;
    kept.push({ copies, recorded });
    const g = guestEmailOf(copies);
    if (g) guestEmails.push(g);
  }
  const lookup = await lookupLeadsByEmailNorm(ctx, teamId, guestEmails, LEAD_CAP);
  if (lookup.capped) truncated.push("leads");
  const touchData = await loadLeadTouches(
    ctx,
    teamId,
    Array.from(lookup.leads.values()).map((l) => l.ghlContactId),
    startMs - TOUCH_LOOKBACK_MS,
    endMs,
  );
  truncated.push(...touchData.truncated);

  const records: BookingRecord[] = [];
  for (const { copies, recorded } of kept) {
    const title = copies[0]?.title ?? "";
    const own = copies.filter(isOwnCopy);
    const best = pickBestOwnCopy(own, nowMs);
    // Without a copy on the closer's own calendar the row comes from a
    // teammate's subscription: fine for the facts of the booking, not for
    // who owns it or for its colour — nobody recolours someone else's copy.
    const anchor = best?.ev ?? copies[0];
    const recolor = best ? best.state : recolorState(anchor, nowMs);
    const closerIds = new Set(copies.map((c) => String(c.closerId)));
    const closerId = best || closerIds.size === 1 ? String(anchor.closerId) : UNKNOWN_CLOSER;
    const colorId = best ? anchor.eventColorId ?? null : null;

    const eventName = copies.map((c) => parseEventName(c.description)).find((n) => n !== null) ?? null;
    const descriptionTrusted = copies.some((c) => c.fetchedAt >= DESCRIPTION_SYNC_SINCE_MS);
    const bookedAts = copies.map((c) => c.bookedAt).filter((b): b is number => typeof b === "number");
    const bookedAt = bookedAts.length > 0 ? Math.min(...bookedAts) : null;
    const bookedAtInferred = bookedAt === null;
    const bookedBasis = bookedAt ?? Math.min(...copies.map((c) => c._creationTime));

    const guestEmailNorm = guestEmailOf(copies);
    const lead = guestEmailNorm ? lookup.leads.get(guestEmailNorm) ?? null : null;
    // E2 writes the initials at the front ("(e) Tim and Karl") and sometimes
    // at the end ("Mark and Karl (e)"). A leading token follows the setter
    // app's matcher; a trailing one collides with ordinary suffixes — "(FU)",
    // "(PM)" — so it only counts on an exact tag or exact initials.
    const cleanTitle = title.replace(/^["'“”\s]+/, "");
    const leading = extractSetterToken(cleanTitle);
    const trailing = leading ? null : extractTrailingSetterToken(cleanTitle);
    const token = leading ?? trailing;
    const taggedRosterIds = leading ? matchToken(leading, rosterNames) : trailing ? matchTokenExact(trailing, rosterNames) : [];

    // Attribution reads the week before the call: an outbound setter who
    // worked the lead and then watched them self-book still drove the set.
    // Touches after the booking are flagged — that is the confirmation job.
    const touches: Touch[] = [];
    const leadTouches = lead ? touchData.byContact.get(lead.ghlContactId) : undefined;
    if (lead && leadTouches) {
      const windowStart = anchor.startTime - TOUCH_LOOKBACK_MS;
      for (const t of leadTouches.touches) {
        if (t.at < windowStart || t.at >= anchor.startTime) continue;
        const reached =
          t.kind === "dial"
            ? t.durationSec !== null && t.durationSec >= connectSec
            : leadTouches.inboundAt.some((at) => at > t.at && at < anchor.startTime);
        touches.push({
          rosterId: rosterByCrm.get(t.crmUserId)?.rosterId ?? null,
          crmUserId: t.crmUserId,
          kind: t.kind,
          at: t.at,
          reached,
          afterBooking: t.at >= bookedBasis,
        });
      }
    }
    const anyoneTouchedBefore = lead
      ? (lead.firstDialAt ?? Infinity) < anchor.startTime || (lead.firstSmsOutboundAt ?? Infinity) < anchor.startTime
      : null;

    const classification = classifyBooking({
      eventName,
      descriptionTrusted,
      taggedRosterIds,
      touches,
      leadInClose: lead !== null,
      anyoneTouchedBefore,
      rosters,
      dmPatterns: team?.setterDmEventNamePatterns,
      funnelPatterns: team?.setterFunnelEventNamePatterns,
    });

    // A row the booking poller made from the calendar is not evidence on its
    // own — unless the closer answered the post-call form on it. A call a
    // manager marked "not a sales call" never is.
    const evidence: CallEvidence | null =
      recorded && recorded.countsTowardStats !== false && carriesEvidence(recorded) ? recorded : null;
    const verdict = showVerdictFor({ call: evidence, recolor, colorId, endTime: anchor.endTime, nowMs });

    records.push({
      key: `${anchor.uid}|${anchor.startTime}`,
      eventIds: copies.map((c) => String(c._id)),
      closerId,
      closerName: closerName.get(closerId) ?? (closerId === UNKNOWN_CLOSER ? "no calendar owner" : "closer"),
      title,
      displayTitle: stripSetterToken(title),
      eventName,
      descriptionTrusted,
      startTime: anchor.startTime,
      endTime: anchor.endTime,
      dayKey: dayKeyInTz(anchor.startTime, tz),
      bookedAt,
      bookedAtInferred,
      bookedDayKey: dayKeyInTz(bookedBasis, tz),
      guestEmailNorm,
      leadContactId: lead?.ghlContactId ?? null,
      token,
      taggedRosterIds,
      touches,
      anyoneTouchedBefore,
      classification,
      verdict,
      recolor,
      colorId,
      isFollowUp: isFollowUpTitle(title),
    });
  }
  records.sort((a, b) => a.startTime - b.startTime);
  return {
    records,
    rosters,
    timezone: tz,
    startMs,
    endMs,
    truncated,
    leadsLookedUp: lookup.lookedUp,
    cancelled,
    crmUserNames,
  };
}
