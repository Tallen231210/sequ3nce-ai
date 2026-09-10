// ============================================================================
// Small pure helpers for the setter-team collector: roster shapes, the
// guest email on a booking, the trailing title token and its strict matcher,
// which call rows count as evidence, and per-event call reads.
// ============================================================================

import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { RosterRef } from "./lib/setterTeamAttribution";
import { firstNameOf, lastNameOf, type RosterName } from "./lib/setterTitleMatch";
import { normalizeEmail } from "./setterCloserMatcher";
import { countsContractValue, isTakenCall } from "./closerPerformanceMetrics";

export interface BookingMoney {
  closed: boolean;
  cash: number;
  contractValue: number;
}

/**
 * The Team Performance rule for a booking's money, reused not redefined:
 * a taken call (isTakenCall) with outcome "closed"; cash only on closes; the
 * contract value only when the team counts AI-read figures or a human
 * confirmed it. Deliberately NOT the show-verdict evidence gate.
 */
export function moneyOf(call: Doc<"calls"> | null, countAiContractValue: boolean): BookingMoney {
  if (!call || !isTakenCall(call)) return { closed: false, cash: 0, contractValue: 0 };
  const closed = call.outcome === "closed";
  return {
    closed,
    cash: closed ? (call.cashCollected ?? 0) : 0,
    contractValue: closed && countsContractValue(call, countAiContractValue) ? (call.contractValue ?? 0) : 0,
  };
}

export function rosterRefsOf(rows: Doc<"setterRoster">[]): RosterRef[] {
  return rows.map((r) => ({
    rosterId: String(r._id),
    name: r.name,
    role: r.role === "confirmation" ? "confirmation" : "booking",
    tag: r.tag ? r.tag.toLowerCase() : null,
    crmUserId: r.crmUserId ?? null,
    active: r.active !== false,
  }));
}

export function rosterNamesOf(refs: RosterRef[]): RosterName[] {
  return refs.map((r) => ({
    rosterId: r.rosterId,
    firstName: firstNameOf(r.name),
    lastName: lastNameOf(r.name),
    tag: r.tag,
  }));
}

/** The recording or post-call form linked to each handed-in calendar row. */
export async function loadCallsForEvents(ctx: QueryCtx, events: Doc<"calendarEvents">[]): Promise<Doc<"calls">[]> {
  const out: Doc<"calls">[] = [];
  for (const ev of events) {
    const c = await ctx.db
      .query("calls")
      .withIndex("by_calendar_event", (q) => q.eq("calendarEventId", ev._id))
      .first();
    if (c) out.push(c);
  }
  return out;
}

/** A calendar-sourced row counts only once a human answered on it. */
export function carriesEvidence(c: Doc<"calls">): boolean {
  if (c.source !== "calendar") return true;
  return c.outcome != null || c.status === "no_show";
}

/** Trailing tokens: an explicit tag or exact first+last initials, nothing looser. */
export function matchTokenExact(token: string, roster: RosterName[]): string[] {
  const t = token.toLowerCase();
  const tagged = roster.filter((r) => (r.tag ?? "").toLowerCase() === t);
  if (tagged.length > 0) return tagged.map((r) => r.rosterId);
  return roster
    .filter((r) => r.lastName && (r.firstName[0] + r.lastName[0]).toLowerCase() === t)
    .map((r) => r.rosterId);
}

/** "Mark and Karl (e)" — the token at the END of the title. */
export function extractTrailingSetterToken(title: string): string | null {
  const m = /\(\s*([A-Za-z]{1,3})\s*\)\s*$/.exec(title);
  return m ? m[1].toLowerCase() : null;
}

/** The outsider on the booking, normalised. The sync already strips the closer and teammates. */
export function guestEmailOf(copies: Doc<"calendarEvents">[]): string | null {
  for (const c of copies) {
    for (const a of c.attendees ?? []) {
      if (a.isOrganizer === true) continue;
      const norm = normalizeEmail(a.email);
      if (norm) return norm;
    }
  }
  return null;
}

/**
 * Google gives a copy imported from another calendar a "_"-prefixed uid, so
 * the same booking can sit in two groups. Fold such a group into the one that
 * shares its start time and title, so one booking is counted once.
 */
export function mergeImportedCopies(groups: Map<string, Doc<"calendarEvents">[]>): Doc<"calendarEvents">[][] {
  const byStartTitle = new Map<string, Doc<"calendarEvents">[]>();
  const imported: Doc<"calendarEvents">[][] = [];
  const out: Doc<"calendarEvents">[][] = [];
  const keyOf = (c: Doc<"calendarEvents">) => `${c.startTime}|${(c.title ?? "").trim().toLowerCase()}`;
  for (const copies of groups.values()) {
    if (copies[0]?.uid?.startsWith("_")) {
      imported.push(copies);
      continue;
    }
    out.push(copies);
    byStartTitle.set(keyOf(copies[0]), copies);
  }
  for (const copies of imported) {
    const home = byStartTitle.get(keyOf(copies[0]));
    if (home) home.push(...copies);
    else out.push(copies);
  }
  return out;
}

