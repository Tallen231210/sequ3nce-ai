// ============================================================================
// One pass over a team's calendar: every sales booking in a window, with the
// facts the attribution and verdict rules need — the booking link, the title
// tag, the guest's Close lead, who touched that lead before the call, the
// linked recording, and the closer's own-calendar colour.
//
// Reads: six range scans plus one point read per guest email. Never a
// per-booking lookup — that shape timed out on operation count once already
// (setterRosterQueries.touchesByUser records the lesson). Every read is
// capped and the caps are reported as `truncated` rather than hidden.
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
import {
  extractSetterToken,
  firstNameOf,
  lastNameOf,
  matchToken,
  stripSetterToken,
  type RosterName,
} from "./lib/setterTitleMatch";
import { normalizeEmail } from "./setterCloserMatcher";
import { lookupLeadsByEmailNorm } from "./setterLeadLookup";
import { loadSetterTouches } from "./setterTeamTouches";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_TEAM_RANGE_DAYS = 14;
export const MAX_TEAM_RANGE_MS = MAX_TEAM_RANGE_DAYS * DAY_MS;
/** A lead is usually worked in the week before the call; older touches belong to an earlier booking. */
const TOUCH_LOOKBACK_MS = 7 * DAY_MS;
/** Calls can be created a little after the booking's start; widen the read. */
const CALL_LOOKAHEAD_MS = 3 * 60 * 60 * 1000;
/** A connected call recorded within a minute before the dial event still belongs to it. */
const CONNECT_SLACK_MS = 60_000;
const EVENT_TAKE = 10_000;
const CALL_TAKE = 5_000;
const LEAD_CAP = 2_000;

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
  /** Cancelled copies seen (not bookings), and the guests they belonged to. */
  cancelled: number;
  cancelledGuests: string[];
}

export function rosterRefsOf(rows: Doc<"setterRoster">[]): RosterRef[] {
  return rows.map((r) => ({
    rosterId: String(r._id),
    name: r.name,
    role: r.role === "confirmation" ? "confirmation" : "booking",
    tag: r.tag ? r.tag.toLowerCase() : null,
    crmUserId: r.crmUserId ?? null,
  }));
}

function rosterNamesOf(refs: RosterRef[]): RosterName[] {
  return refs.map((r) => ({
    rosterId: r.rosterId,
    firstName: firstNameOf(r.name),
    lastName: lastNameOf(r.name),
    tag: r.tag,
  }));
}

export async function collectTeamBookings(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  startMs: number,
  endMs: number,
  nowMs: number,
): Promise<TeamBookings> {
  const truncated: string[] = [];
  const [team, rosterRows, closers, subs, events, calls] = await Promise.all([
    ctx.db.get(teamId),
    ctx.db.query("setterRoster").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(200),
    ctx.db.query("closers").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(500),
    ctx.db.query("closerCalendarSubscriptions").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(1000),
    ctx.db
      .query("calendarEvents")
      .withIndex("by_team_and_time", (q) => q.eq("teamId", teamId).gte("startTime", startMs).lt("startTime", endMs))
      .take(EVENT_TAKE),
    ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", teamId).gte("createdAt", startMs).lt("createdAt", endMs + CALL_LOOKAHEAD_MS),
      )
      .take(CALL_TAKE),
  ]);
  if (events.length >= EVENT_TAKE) truncated.push("events");
  if (calls.length >= CALL_TAKE) truncated.push("calls");
  const tz = (team as { timezone?: string } | null)?.timezone || DEFAULT_TIMEZONE;
  const teamWords = team?.closerExcludedBookingTitles;
  const rosters = rosterRefsOf(rosterRows);
  const rosterNames = rosterNamesOf(rosters);
  const rosterByCrm = new Map(rosters.filter((r) => r.crmUserId).map((r) => [r.crmUserId as string, r]));
  const closerName = new Map(closers.map((c) => [String(c._id), c.name ?? c.email ?? "closer"]));
  const isOwnCopy = buildOwnCopySelector(closers, subs);

  const touchData = await loadSetterTouches(ctx, teamId, rosters, startMs - TOUCH_LOOKBACK_MS, endMs);
  truncated.push(...touchData.truncated);
  const { touchesByContact, connectedByContactUser, inboundByContact } = touchData;

  const callByEventId = new Map<string, Doc<"calls">>();
  for (const c of calls) {
    if (c.calendarEventId) callByEventId.set(String(c.calendarEventId), c);
  }

  const groups = Array.from(groupBookingCopies(events).values());
  const guestEmails: string[] = [];
  for (const copies of groups) {
    const g = guestEmailOf(copies);
    if (g) guestEmails.push(g);
  }
  const lookup = await lookupLeadsByEmailNorm(ctx, teamId, guestEmails, LEAD_CAP);
  if (lookup.capped) truncated.push("leads");

  const excludedTitle = (title: string | undefined) => isExcludedBookingTitle(title, teamWords);
  const records: BookingRecord[] = [];
  let cancelled = 0;
  const cancelledGuests: string[] = [];

  for (const copies of groups) {
    const title = copies[0]?.title ?? "";
    if (copies.some((c) => classifyExcludedTitle(c.title, teamWords) === "cancelled")) {
      cancelled += 1;
      const g = guestEmailOf(copies);
      if (g) cancelledGuests.push(g);
      continue;
    }
    const recorded = copies.map((c) => callByEventId.get(String(c._id))).find((c): c is Doc<"calls"> => !!c) ?? null;
    if (!isSalesBooking(copies, { producedARecordedCall: !!recorded, excludedTitle })) continue;

    const own = copies.filter(isOwnCopy);
    const best = pickBestOwnCopy(own, nowMs);
    const anchor = best?.ev ?? copies[0];
    const recolor = best ? best.state : recolorState(anchor, nowMs);
    const closerId = String(anchor.closerId);

    const eventName = copies.map((c) => parseEventName(c.description)).find((n) => n !== null) ?? null;
    const descriptionTrusted = copies.some((c) => c.fetchedAt >= DESCRIPTION_SYNC_SINCE_MS);
    const bookedAts = copies.map((c) => c.bookedAt).filter((b): b is number => typeof b === "number");
    const bookedAt = bookedAts.length > 0 ? Math.min(...bookedAts) : null;
    const bookedAtInferred = bookedAt === null;
    const bookedBasis = bookedAt ?? Math.min(...copies.map((c) => c._creationTime));

    const guestEmailNorm = guestEmailOf(copies);
    const lead = guestEmailNorm ? lookup.leads.get(guestEmailNorm) ?? null : null;
    // E2 writes the initials at the front ("(e) Tim and Karl") and sometimes
    // at the end ("Mark and Karl (e)"); either is the same convention here.
    const cleanTitle = title.replace(/^["'“”\s]+/, "");
    const token = extractSetterToken(cleanTitle) ?? extractTrailingSetterToken(cleanTitle);
    const taggedRosterIds = token ? matchToken(token, rosterNames) : [];

    // Attribution reads the week before the call: an outbound setter who
    // worked the lead and then watched them self-book still drove the set.
    // Touches after the booking are flagged — that is the confirmation job.
    const touches: Touch[] = [];
    if (lead) {
      const windowStart = anchor.startTime - TOUCH_LOOKBACK_MS;
      for (const t of touchesByContact.get(lead.ghlContactId) ?? []) {
        if (t.at < windowStart || t.at >= anchor.startTime) continue;
        const reached =
          t.kind === "dial"
            ? (connectedByContactUser.get(`${lead.ghlContactId}|${t.crmUserId}`) ?? []).some(
                (at) => at >= t.at - CONNECT_SLACK_MS && at < anchor.startTime,
              )
            : (inboundByContact.get(lead.ghlContactId) ?? []).some((at) => at > t.at && at < anchor.startTime);
        touches.push({
          rosterId: rosterByCrm.get(t.crmUserId)?.rosterId ?? null,
          crmUserId: t.crmUserId,
          kind: t.kind,
          at: t.at,
          reached,
          afterBooking: t.at >= bookedBasis,
        });
      }
      touches.sort((a, b) => a.at - b.at);
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

    // A row the booking poller made from the calendar is not evidence that
    // anything happened; a call a manager marked "not a sales call" is not either.
    const evidence: CallEvidence | null =
      recorded && recorded.source !== "calendar" && recorded.countsTowardStats !== false ? recorded : null;
    const colorId = anchor.eventColorId ?? null;
    const verdict = showVerdictFor({ call: evidence, recolor, colorId, endTime: anchor.endTime, nowMs });

    records.push({
      key: `${anchor.uid}|${anchor.startTime}`,
      eventIds: copies.map((c) => String(c._id)),
      closerId,
      closerName: closerName.get(closerId) ?? "closer",
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
    cancelledGuests,
  };
}

/** "Mark and Karl (e)" — the token at the END of the title. */
function extractTrailingSetterToken(title: string): string | null {
  const m = /\(\s*([A-Za-z]{1,3})\s*\)\s*$/.exec(title);
  return m ? m[1].toLowerCase() : null;
}

/** The outsider on the booking, normalised. The sync already strips the closer and teammates. */
function guestEmailOf(copies: Doc<"calendarEvents">[]): string | null {
  for (const c of copies) {
    for (const a of c.attendees ?? []) {
      if (a.isOrganizer === true) continue;
      const norm = normalizeEmail(a.email);
      if (norm) return norm;
    }
  }
  return null;
}
