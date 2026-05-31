// ============================================================================
// Setter ↔ Closer matcher service.
//
// Joins setter-side data (GHL setterLeads) with closer-side data (our calls
// table) by prospect identity. Used by:
//   - Dashboard Phase 2 closer-side show-rate: did this lead show?
//   - Future transcripts-roadmap P2/P3 briefing panels (the reverse direction:
//     given an upcoming closer call, find the qualifying setter transcript).
//
// Match key: normalized email OR normalized phone. Both are computed at
// call-create time (forward) and via backfillCallProspectIdentity (historical).
// For calls predating backfill, this module falls back to the
// calendarEvents.attendees[].email and scheduledCalls.prospectEmail joins.
//
// Lives in V8 runtime so any query can reuse it without a runtime switch.
// ============================================================================

import type { Doc, Id } from "./_generated/dataModel";

export function normalizeEmail(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length < 3 || !trimmed.includes("@")) return null;
  return trimmed;
}

export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Strip leading "1" if 11-digit US number. Documented limitation:
  // non-US numbers with country-code variation may not normalize
  // identically across GHL/Desktop sources. Email join compensates.
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/**
 * In-memory index built once per query, looked up many times.
 * Each map value is a list of all matching call rows — a single lead
 * may match multiple closer calls (e.g., qualifying call + follow-up).
 */
export interface MatcherIndex {
  callsByEmail: Map<string, Doc<"calls">[]>;
  callsByPhone: Map<string, Doc<"calls">[]>;
  totalCalls: number;
  callsWithIdentity: number;
  callsWithoutIdentity: number;
}

interface BuildMatcherOptions {
  /** Max calls to fetch. Default 5000. */
  take?: number;
}

/**
 * Build the matcher index for a team's calls in a date range. The range
 * applies to `calls.startedAt`. Falls back to joining calendarEvents +
 * scheduledCalls for calls whose denormalized prospect identity isn't
 * populated yet (graceful degrade during the backfill rollout).
 */
export async function buildMatcherIndex(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  teamId: Id<"teams">,
  rangeStart: number,
  rangeEnd: number,
  opts: BuildMatcherOptions = {},
): Promise<MatcherIndex> {
  const take = opts.take ?? 5000;

  const calls = (await ctx.db
    .query("calls")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team_and_date", (q: any) =>
      q
        .eq("teamId", teamId)
        .gte("createdAt", rangeStart)
        .lt("createdAt", rangeEnd),
    )
    .take(take)) as Doc<"calls">[];

  const callsByEmail = new Map<string, Doc<"calls">[]>();
  const callsByPhone = new Map<string, Doc<"calls">[]>();
  let callsWithIdentity = 0;
  let callsWithoutIdentity = 0;

  for (const call of calls) {
    let emailKey = normalizeEmail(call.prospectEmail);
    let phoneKey = normalizePhone(call.prospectPhone);

    // Fallback for calls predating the backfill: join through scheduledCalls
    // or calendarEvents. One extra DB read per pre-backfill call; bounded by
    // the take limit. Once backfill completes, this branch becomes cold.
    if (!emailKey && !phoneKey) {
      const fallbackEmail = await fallbackProspectEmail(ctx, call);
      emailKey = normalizeEmail(fallbackEmail);
    }

    if (emailKey) {
      const existing = callsByEmail.get(emailKey);
      if (existing) existing.push(call);
      else callsByEmail.set(emailKey, [call]);
    }
    if (phoneKey) {
      const existing = callsByPhone.get(phoneKey);
      if (existing) existing.push(call);
      else callsByPhone.set(phoneKey, [call]);
    }
    if (emailKey || phoneKey) callsWithIdentity += 1;
    else callsWithoutIdentity += 1;
  }

  return {
    callsByEmail,
    callsByPhone,
    totalCalls: calls.length,
    callsWithIdentity,
    callsWithoutIdentity,
  };
}

/**
 * Find all closer calls in the index matching this lead's email/phone.
 * Deduplicates when email AND phone both match the same call.
 */
export function findCallsForLead(
  index: MatcherIndex,
  lead: { email?: string; phone?: string },
): Doc<"calls">[] {
  const out: Doc<"calls">[] = [];
  const seen = new Set<string>();

  const email = normalizeEmail(lead.email);
  if (email) {
    for (const c of index.callsByEmail.get(email) ?? []) {
      const key = String(c._id);
      if (!seen.has(key)) {
        out.push(c);
        seen.add(key);
      }
    }
  }
  const phone = normalizePhone(lead.phone);
  if (phone) {
    for (const c of index.callsByPhone.get(phone) ?? []) {
      const key = String(c._id);
      if (!seen.has(key)) {
        out.push(c);
        seen.add(key);
      }
    }
  }
  return out;
}

/**
 * Reverse direction — given a call, return the normalized email/phone
 * we'd use to look up a matching setter lead. For the future transcripts
 * roadmap P2/P3 work: given an upcoming closer appointment, find the
 * qualifying setter transcript.
 */
export function findSetterLeadKeysForCall(
  call: Doc<"calls">,
): { email: string | null; phone: string | null } {
  return {
    email: normalizeEmail(call.prospectEmail),
    phone: normalizePhone(call.prospectPhone),
  };
}

/**
 * Best-effort prospect-email lookup for calls whose denormalized field
 * isn't populated yet. Tries scheduledCalls first (most reliable —
 * Calendly/manual entries always include the booker's email), then
 * calendarEvents.attendees (Google Calendar with attendee data).
 */
async function fallbackProspectEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  call: Doc<"calls">,
): Promise<string | null> {
  if (call.scheduledCallId) {
    const sched = (await ctx.db.get(call.scheduledCallId)) as Doc<"scheduledCalls"> | null;
    if (sched?.prospectEmail) return sched.prospectEmail;
  }
  if (call.calendarEventId) {
    const evt = (await ctx.db.get(call.calendarEventId)) as Doc<"calendarEvents"> | null;
    if (evt?.attendees && evt.attendees.length > 0) {
      // Take the first non-organizer attendee (the prospect). If all are
      // organizers (rare — most calendar events have at least one external
      // attendee), fall back to the first attendee.
      const guest = evt.attendees.find((a) => a.isOrganizer !== true);
      return guest?.email ?? evt.attendees[0].email;
    }
  }
  return null;
}
