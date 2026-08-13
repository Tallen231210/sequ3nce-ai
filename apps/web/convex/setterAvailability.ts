// ============================================================================
// What we can see in this business's data, before anyone configures anything.
//
// This file is a session of manual detective work, written down. To understand
// one customer's funnel we had to find everyone who touches their leads,
// discover half of them weren't in our records, look each up individually, work
// out who opens conversations versus follows them in, hunt for a lead-quality
// signal through tags and sources, find it in an unparsed calendar field, and
// then notice a whole calendar we don't sync. Hours of our time and theirs.
//
// Every one of those steps is mechanical. The single thing that needed a human
// was interpretation — knowing that "Minus" meant a disqualified lead — and
// that shouldn't be automated, it should be ASKED.
//
// So the report is thorough, not clever. It surfaces what is there and what is
// missing; the setup conversation asks what it means. Neither has to guess,
// which is the whole point.
// ============================================================================

import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { scanRangeDesc } from "./lib/rangeScan";

/* eslint-disable @typescript-eslint/no-explicit-any */

const LOOKBACK_DAYS = 90;

export interface AvailabilityReport {
  windowDays: number;
  leads: { total: number; withOwner: number; ownerCoverage: number };
  activity: {
    calls: number;
    texts: number;
    byPerson: Array<{
      crmUserId: string;
      name: string | null;
      role: string | null;
      touches: number;
      opensConversations: number | null;
      knownToCrm: boolean;
    }>;
    automated: number;
  };
  bookings: {
    total: number;
    /** Distinct booking links, which is often how a business splits lead quality. */
    types: Array<{ name: string; count: number }>;
    withBookedAt: number;
    calendarsConnected: number;
    /** People doing sales work whose calendar we don't have. */
    missingCalendars: string[];
  };
  leadAttributes: {
    topTags: Array<{ value: string; count: number }>;
    topSources: Array<{ value: string; count: number }>;
    /** True when nearly every lead looks identical — no signal to segment on. */
    noUsefulSegmentation: boolean;
  };
  truncated: boolean;
}

async function buildReport(
  ctx: { db: any },
  teamId: Id<"teams">,
): Promise<AvailabilityReport> {
  const now = Date.now();
  const rangeStart = now - LOOKBACK_DAYS * 86_400_000;

  // ---- leads -------------------------------------------------------------
  const leadScan = await scanRangeDesc<Doc<"setterLeads">>(
    (before) =>
      ctx.db
        .query("setterLeads")
        .withIndex("by_team_and_date_added", (q: any) =>
          q.eq("teamId", teamId).gte("dateAdded", rangeStart).lt("dateAdded", before),
        ),
    (l) => l.dateAdded,
    { rangeEnd: now, maxRows: 15_000 },
  );
  const leads = leadScan.rows;
  const withOwner = leads.filter(
    (l) => l.assignedToGhlUserId || l.firstDialByUserId,
  ).length;

  // ---- who does the work -------------------------------------------------
  const perPerson = new Map<string, { calls: number; texts: number }>();
  const firstToucher = new Map<string, string | null>();
  let automated = 0;
  let calls = 0;
  let texts = 0;
  let truncated = leadScan.truncated;

  for (const eventType of ["dial_outbound", "sms_outbound"]) {
    const scan = await scanRangeDesc<Doc<"setterLeadEvents">>(
      (before) =>
        ctx.db
          .query("setterLeadEvents")
          .withIndex("by_team_and_type_and_time", (q: any) =>
            q
              .eq("teamId", teamId)
              .eq("eventType", eventType)
              .gte("occurredAt", rangeStart)
              .lt("occurredAt", before),
          ),
      (e) => e.occurredAt,
      { rangeEnd: now, maxRows: 15_000 },
    );
    truncated = truncated || scan.truncated;

    for (const e of scan.rows) {
      if (eventType === "dial_outbound") calls += 1;
      else texts += 1;
      if (!e.ghlUserId) {
        automated += 1;
      } else {
        const row = perPerson.get(e.ghlUserId) ?? { calls: 0, texts: 0 };
        if (eventType === "dial_outbound") row.calls += 1;
        else row.texts += 1;
        perPerson.set(e.ghlUserId, row);
      }
      // Earliest touch per lead, so we can tell openers from followers — the
      // signal that actually separates a setter from a closer confirming a Zoom.
      const seen = firstToucher.get(e.ghlContactId);
      if (seen === undefined) firstToucher.set(e.ghlContactId, e.ghlUserId ?? null);
    }
  }

  const reps = await ctx.db
    .query("setterReps")
    .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
    .take(500);
  const nameById = new Map<string, string>();
  for (const r of reps as any[]) if (r.ghlUserId) nameById.set(r.ghlUserId, r.name);

  const roles = await ctx.db
    .query("setterRoleAssignments")
    .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
    .take(500);
  const roleById = new Map<string, string>();
  for (const r of roles as any[]) roleById.set(r.crmUserId, r.role);

  const opensBy = new Map<string, number>();
  for (const who of firstToucher.values()) {
    if (who) opensBy.set(who, (opensBy.get(who) ?? 0) + 1);
  }

  const byPerson = [...perPerson.entries()]
    .map(([crmUserId, v]) => ({
      crmUserId,
      name: nameById.get(crmUserId) ?? null,
      role: roleById.get(crmUserId) ?? null,
      touches: v.calls + v.texts,
      opensConversations: opensBy.get(crmUserId) ?? 0,
      knownToCrm: nameById.has(crmUserId),
    }))
    .sort((a, b) => b.touches - a.touches);

  // ---- bookings ----------------------------------------------------------
  const bookingScan = await scanRangeDesc<Doc<"calendarEvents">>(
    (before) =>
      ctx.db
        .query("calendarEvents")
        .withIndex("by_team_and_time", (q: any) =>
          q.eq("teamId", teamId).gte("startTime", rangeStart).lt("startTime", before),
        ),
    (e) => e.startTime,
    { rangeEnd: now, maxRows: 15_000 },
  );
  truncated = truncated || bookingScan.truncated;

  const typeCounts: Record<string, number> = {};
  let withBookedAt = 0;
  const calendarOwners = new Set<string>();
  for (const e of bookingScan.rows) {
    if ((e as any).bookedAt) withBookedAt += 1;
    if (e.closerId) calendarOwners.add(String(e.closerId));
    // Booking links are named in the description, and different links are
    // frequently how a business separates good leads from poor ones. We have
    // synced this field for months and never read it.
    const m = String(e.description ?? "").match(/Event Name\s*[\r\n]+\s*(.+)/);
    if (!m) continue;
    const name = m[1].trim().slice(0, 70);
    typeCounts[name] = (typeCounts[name] ?? 0) + 1;
  }

  // Anyone doing sales work whose calendar we can't see. Their bookings are
  // real and simply invisible, which is how a whole booking type went missing.
  const missingCalendars = byPerson
    .filter((p) => p.touches > 50 && p.name && (p.role === "closer" || p.role === null))
    .map((p) => p.name!)
    .slice(0, 10);

  // ---- lead attributes ---------------------------------------------------
  const tagCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  for (const l of leads) {
    for (const t of l.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    const s = l.source || "(none)";
    sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
  }
  const top = (r: Record<string, number>) =>
    Object.entries(r)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => ({ value, count }));

  const topSource = top(sourceCounts)[0];
  return {
    windowDays: LOOKBACK_DAYS,
    leads: {
      total: leads.length,
      withOwner,
      ownerCoverage: leads.length ? withOwner / leads.length : 0,
    },
    activity: { calls, texts, byPerson, automated },
    bookings: {
      total: bookingScan.rows.length,
      types: Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([name, count]) => ({ name, count })),
      withBookedAt,
      calendarsConnected: calendarOwners.size,
      missingCalendars,
    },
    leadAttributes: {
      topTags: top(tagCounts),
      topSources: top(sourceCounts),
      // When almost every lead carries the same source — or, more often, none
      // at all — there is nothing to segment on. Worth saying outright rather
      // than letting someone design a funnel around a field that turns out to
      // be empty. A blank source counts as no segmentation however small its
      // share: the first version only checked the 90% threshold and reported
      // "segmentation available" on a team whose top source was literally
      // "(none)".
      noUsefulSegmentation:
        !topSource ||
        topSource.value === "(none)" ||
        (leads.length > 0 && topSource.count / leads.length > 0.9),
    },
    truncated,
  };
}

export const getAvailabilityReport = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<AvailabilityReport | null> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return null;
    return buildReport(ctx, user.teamId as Id<"teams">);
  },
});

/** Same report, addressable by team, for running it from the CLI. */
export const _reportForTeam = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<AvailabilityReport> =>
    buildReport(ctx, args.teamId),
});
