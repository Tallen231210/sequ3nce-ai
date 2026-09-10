// ============================================================================
// Who touched which lead, from Close activity: one point read per lead the
// range's bookings belong to (by_team_and_contact, newest first), trimmed to
// the window in memory. Reading per lead keeps the budget proportional to
// the bookings on screen rather than to the team's whole dialling volume —
// per-setter scans could pass Convex's 32k-document transaction limit on a
// busy floor. Every user's touches are kept (closers included); the
// attribution rules decide who gets credit.
// ============================================================================

import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** Lead-event rows one call may read in total; past it the remaining leads go unread and the result says so. */
const TOUCH_BUDGET = 12_000;
/** Rows per lead, newest first; a lead worked harder than this in one window is beyond any setter. */
const PER_LEAD_TAKE = 400;

export interface RawTouch {
  crmUserId: string;
  kind: "dial" | "sms";
  at: number;
  /** Seconds on the line for a dial; null for texts or when Close sent none. */
  durationSec: number | null;
}

export interface LeadTouches {
  /** Outbound dials and texts, oldest first. */
  touches: RawTouch[];
  /** Times the lead texted back. */
  inboundAt: number[];
}

export interface SetterTouches {
  byContact: Map<string, LeadTouches>;
  truncated: string[];
  /** Leads whose newest-first read hit the per-lead cap — their EARLIEST touches may be missing. */
  clipped: Set<string>;
  /** Leads not read at all because the total budget was spent. */
  unread: Set<string>;
}

export async function loadLeadTouches(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  contactIds: Iterable<string>,
  fromMs: number,
  toMs: number,
): Promise<SetterTouches> {
  const byContact = new Map<string, LeadTouches>();
  const truncated: string[] = [];
  const clippedIds = new Set<string>();
  const unreadIds = new Set<string>();
  let budget = TOUCH_BUDGET;
  let unread = 0;
  let clipped = 0;
  for (const contactId of new Set(contactIds)) {
    if (budget <= 0) {
      unread += 1;
      unreadIds.add(contactId);
      continue;
    }
    const rows = await ctx.db
      .query("setterLeadEvents")
      .withIndex("by_team_and_contact", (q) => q.eq("teamId", teamId).eq("ghlContactId", contactId))
      .order("desc")
      .take(Math.min(PER_LEAD_TAKE, budget));
    budget -= rows.length;
    if (rows.length >= PER_LEAD_TAKE) {
      clipped += 1;
      clippedIds.add(contactId);
    }
    const lead: LeadTouches = { touches: [], inboundAt: [] };
    for (const e of rows) {
      if (e.occurredAt < fromMs || e.occurredAt > toMs) continue;
      if (e.eventType === "dial_outbound" || e.eventType === "sms_outbound") {
        if (!e.ghlUserId) continue;
        const details = e.details as { callDurationSec?: unknown } | undefined;
        const durationSec = typeof details?.callDurationSec === "number" ? details.callDurationSec : null;
        lead.touches.push({
          crmUserId: e.ghlUserId,
          kind: e.eventType === "dial_outbound" ? "dial" : "sms",
          at: e.occurredAt,
          durationSec,
        });
      } else if (e.eventType === "sms_inbound") {
        lead.inboundAt.push(e.occurredAt);
      }
    }
    lead.touches.sort((a, b) => a.at - b.at);
    byContact.set(contactId, lead);
  }
  if (clipped > 0) truncated.push(`touches: ${clipped} lead${clipped === 1 ? "" : "s"} clipped`);
  if (unread > 0) truncated.push(`touches: ${unread} lead${unread === 1 ? "" : "s"} unread`);
  return { byContact, truncated, clipped: clippedIds, unread: unreadIds };
}
