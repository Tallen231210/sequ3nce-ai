// ============================================================================
// The Setters page: one page per team on the attribution engine, in three
// subscriptions so no single query can pass Convex's read budget —
// bookings (by call date), sets (by booked date) and Close activity — plus
// two on-demand reads for the per-setter drawer. Every number has one source;
// see settersPageLabels for what each word means.
// ============================================================================

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { dayKeyInTz } from "./closerPerformance";
import { addDaysKey } from "./dataHealthCore";
import { activeFunnelFor } from "./setterFunnels";
import { workingHoursFor } from "./setterFunnelResolve";
import { collectTeamBookings, type BookingRecord } from "./setterTeamBookings";
import { rosterRefsOf } from "./setterTeamBookingHelpers";
import { buildSetterTeamsView } from "./setterTeamLanes";
import { loadActivity, loadFiled, loadUserDays } from "./settersPageActivity";
import { resolveSettersPageAccess, type SettersPageAccess } from "./settersPageGate";
import { teamLabelsFor } from "./settersPageLabels";
import { confirmationRows, dmRows, outboundRows, percentiles, responseTimes, teamStrip, type Hours } from "./settersPageTeams";
import { confirmationSpeedDays, confirmationSpeedRows, outboundSpeed, speedBySetter, speedDaysFor, type SetterRef } from "./settersPageSpeed";
import { loadCadence, nameLeads } from "./settersPageCadence";

const BOOKED_TAKE = 8_000;
const RANGE_ARGS = { clerkId: v.string(), rangeStart: v.number(), rangeEnd: v.number() };

async function hoursFor(ctx: Parameters<typeof activeFunnelFor>[0], access: SettersPageAccess): Promise<Hours> {
  const funnel = await activeFunnelFor(ctx, access.teamId);
  return workingHoursFor(funnel, access.team);
}

function basisOf(hours: Hours): string {
  return `${hours.startHour}:00–${hours.endHour}:00, ${hours.days.length} days a week, ${hours.timezone}`;
}

/** Bookings MADE in the range, through the same collector — the "sets" cohort. */
async function collectBookedInRange(ctx: Parameters<typeof collectTeamBookings>[0], access: SettersPageAccess) {
  const rows = await ctx.db
    .query("calendarEvents")
    .withIndex("by_team_and_booked_at", (q) => q.eq("teamId", access.teamId).gte("bookedAt", access.startMs).lt("bookedAt", access.endMs))
    .take(BOOKED_TAKE);
  const truncated = rows.length >= BOOKED_TAKE ? ["booked events"] : [];
  if (rows.length === 0) return { records: [] as BookingRecord[], rosters: rosterRefsOf([]), truncated, crmUserNames: {} };
  const starts = rows.map((e) => e.startTime);
  const data = await collectTeamBookings(ctx, access.teamId, Math.min(access.startMs, ...starts), Math.max(...starts) + 1, access.nowMs, {
    eventRows: rows,
    skipCalls: true,
  });
  return { records: data.records, rosters: data.rosters, truncated: [...truncated, ...data.truncated], crmUserNames: data.crmUserNames };
}

function isSelfBook(r: BookingRecord): boolean {
  return !r.isFollowUp && r.classification.isFunnel && r.classification.lane !== "outbound" && r.classification.lane !== "dm";
}

/** Bookings by call date: the team strip, per-person rows with money, drill records. */
export const getSettersBookings = query({
  args: RANGE_ARGS,
  handler: async (ctx, args) => {
    const access = await resolveSettersPageAccess(ctx, args.clerkId, args.rangeStart, args.rangeEnd);
    if (!access) return null;
    const { team, teamId, startMs, endMs, nowMs } = access;
    const data = await collectTeamBookings(ctx, teamId, startMs, endMs, nowMs);
    const view = buildSetterTeamsView(data.records, data.rosters, data.crmUserNames);
    const labels = teamLabelsFor(team.setterTeamLabels);
    const hours = await hoursFor(ctx, access);
    const confirmation = confirmationRows(view.confirmation, data.records, data.rosters).map((row) => {
      const { median } = percentiles(responseTimes(data.records, row.rosterId, hours));
      return { ...row, responseMedianWorkingMs: median };
    });
    const coverage = [
      "Leads per setter and set rate per lead aren't shown: Close doesn't sync a lead owner.",
      "Funnel by source, pipeline stages, ad attribution and pre-call qualification aren't available for this CRM.",
      "Text replies count per lead, in the drawer — the cards count answered calls only.",
    ];
    if (access.rangeClampedToDays) coverage.push(`Showing the last ${access.rangeClampedToDays} days of the range.`);
    if (data.truncated.length > 0) coverage.push(`Partial: some reads hit their cap (${data.truncated.join(", ")}).`);
    return {
      range: { startMs, endMs, timezone: data.timezone },
      rangeClampedToDays: access.rangeClampedToDays,
      truncated: data.truncated,
      labels,
      basis: basisOf(hours),
      strip: teamStrip(view.comparison, data.records, labels, view.funnel),
      outbound: outboundRows(view.outbound, data.records, data.rosters),
      dm: dmRows(view.dm, data.records, team.setterDmPeople ?? []),
      confirmation,
      selfBookedUncontacted: view.selfBookedUncontacted,
      unattributed: view.unattributed,
      followUpsExcluded: view.followUpsExcluded,
      records: view.records,
      coverage,
    };
  },
});

/** Bookings by booked date: sets per setter, the confirmation setter's workload and response time. */
export const getSettersSets = query({
  args: RANGE_ARGS,
  handler: async (ctx, args) => {
    const access = await resolveSettersPageAccess(ctx, args.clerkId, args.rangeStart, args.rangeEnd);
    if (!access) return null;
    const { records, rosters, truncated } = await collectBookedInRange(ctx, access);
    const hours = await hoursFor(ctx, access);
    const outbound = rosters
      .filter((r) => r.role !== "confirmation")
      .map((r) => {
        const mine = records.filter((b) => !b.isFollowUp && b.classification.lane === "outbound" && b.classification.creditRosterIds.includes(r.rosterId));
        return {
          rosterId: r.rosterId,
          sets: mine.length,
          tagged: mine.filter((b) => b.classification.attributedBy === "tag").length,
          crmOnly: mine.filter((b) => b.classification.attributedBy === "crm_activity").length,
        };
      });
    const selfBooks = records.filter(isSelfBook);
    const confirmation = rosters
      .filter((r) => r.role === "confirmation")
      .map((r) => {
        const hers = (b: BookingRecord) => b.touches.filter((t) => t.rosterId === r.rosterId && t.afterBooking);
        const contacted = selfBooks.filter((b) => hers(b).length > 0 || (b.classification.attributedBy === "tag" && b.classification.creditRosterIds.includes(r.rosterId)));
        const { median } = percentiles(confirmationSpeedRows(records, r.rosterId, r.name, hours).flatMap((row) => (row.workingMs === null ? [] : [row.workingMs])));
        return {
          rosterId: r.rosterId,
          newSelfBooks: selfBooks.length,
          contacted: contacted.length,
          reached: contacted.filter((b) => hers(b).some((t) => t.reached)).length,
          coveragePct: selfBooks.length > 0 ? Math.round((contacted.length / selfBooks.length) * 100) : null,
          responseMedianWorkingMs: median,
        };
      });
    const dm = new Map<string, number>();
    for (const b of records) {
      if (b.isFollowUp || b.classification.lane !== "dm") continue;
      const link = (b.classification.dmPerson ?? "no name on the link").toLowerCase();
      dm.set(link, (dm.get(link) ?? 0) + 1);
    }
    return {
      range: { startMs: access.startMs, endMs: access.endMs },
      truncated,
      outbound,
      confirmation,
      dm: Array.from(dm.entries()).map(([linkName, sets]) => ({ linkName, sets })),
      cohort: records.filter((b) => !b.isFollowUp).length,
    };
  },
});

/** Close activity by user, the filed EOD numbers, and outbound speed medians. */
export const getSettersActivity = query({
  args: RANGE_ARGS,
  handler: async (ctx, args) => {
    const access = await resolveSettersPageAccess(ctx, args.clerkId, args.rangeStart, args.rangeEnd);
    if (!access) return null;
    const { team, teamId, startMs, endMs, timezone } = access;
    const rosterRows = (await ctx.db.query("setterRoster").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(200)).filter((r) => r.active);
    const rosters = rosterRefsOf(rosterRows);
    const [activity, filed] = await Promise.all([loadActivity(ctx, team, startMs, endMs), loadFiled(ctx, teamId, startMs, endMs, timezone)]);
    const byRoster = rosters.map((r) => {
      const counts = r.crmUserId ? activity.byUser.get(r.crmUserId) ?? { dials: 0, answered: 0, texts: 0 } : null;
      return {
        rosterId: r.rosterId,
        name: r.name,
        role: r.role,
        linked: !!r.crmUserId,
        dials: counts ? counts.dials : null,
        answered: counts ? counts.answered : null,
        texts: counts ? counts.texts : null,
        filed: filed.byRoster.get(r.rosterId) ?? null,
      };
    });
    const unattributedDials = activity.byUser.get("")?.dials ?? 0;
    // Dials by Close users who aren't on the roster (closers, admins,
    // departed setters): counted here so the page never silently loses them.
    const rosterCrm = new Set(rosters.map((r) => r.crmUserId).filter((id): id is string => !!id));
    let otherUsersDials = 0;
    for (const [user, counts] of activity.byUser) if (user !== "" && !rosterCrm.has(user)) otherUsersDials += counts.dials;
    const coverage: string[] = [];
    if (!activity.rollupsReady) coverage.push("Daily rollups aren't built for this team yet, so dials are read from raw events and may be partial.");
    if (unattributedDials > 0) coverage.push(`${unattributedDials} dials in the range carry no Close user and aren't credited to anyone.`);
    if (otherUsersDials > 0) coverage.push(`${otherUsersDials} dials in the range were made by Close users who aren't on the setter roster (closers, admins, people who left).`);
    const truncated = [...activity.truncated, ...filed.truncated];
    if (truncated.length > 0) coverage.push(`Partial: some reads hit their cap (${truncated.join(", ")}).`);
    return {
      range: { startMs, endMs, timezone },
      rollupsReady: activity.rollupsReady,
      byRoster,
      unattributedDials,
      otherUsersDials,
      truncated,
      coverage,
    };
  },
});

/** Outbound speed to lead per setter — its own read so the activity query stays light. */
export const getSettersSpeed = query({
  args: RANGE_ARGS,
  handler: async (ctx, args) => {
    const access = await resolveSettersPageAccess(ctx, args.clerkId, args.rangeStart, args.rangeEnd);
    if (!access) return null;
    const { teamId, startMs, endMs, nowMs } = access;
    const rosterRows = (await ctx.db.query("setterRoster").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(200)).filter((r) => r.active);
    const setters: SetterRef[] = rosterRefsOf(rosterRows)
      .filter((r) => r.role !== "confirmation" && r.crmUserId)
      .map((r) => ({ rosterId: r.rosterId, name: r.name, crmUserId: r.crmUserId as string }));
    const hours = await hoursFor(ctx, access);
    const speed = await outboundSpeed(ctx, teamId, setters, hours, startMs, endMs, nowMs);
    const byId = speedBySetter(speed, setters);
    const all = speed.rows;
    return {
      range: { startMs, endMs },
      basis: basisOf(hours),
      truncated: speed.truncated,
      bySetter: setters.map((s) => ({ rosterId: s.rosterId, ...byId.get(s.rosterId)! })),
      team: {
        leads: all.length,
        selfBooked: all.filter((r) => r.note === "self-booked").length,
        neverContacted: all.filter((r) => r.note === "never contacted").length,
        noArrival: all.filter((r) => r.note === "no arrival time" || r.note === "touched before arrival").length,
        unread: speed.unread + speed.clipped,
      },
    };
  },
});

/** Cadence per outbound setter: dials per lead, three-plus attempts, days pursued. Own read per setter. */
export const getSettersCadence = query({
  args: RANGE_ARGS,
  handler: async (ctx, args) => {
    const access = await resolveSettersPageAccess(ctx, args.clerkId, args.rangeStart, args.rangeEnd);
    if (!access) return null;
    const { teamId, startMs, endMs } = access;
    const rosterRows = (await ctx.db.query("setterRoster").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(200)).filter((r) => r.active);
    const setters = rosterRefsOf(rosterRows).filter((r) => r.role !== "confirmation" && r.crmUserId);
    const bySetter = [];
    for (const r of setters) {
      const { summary } = await loadCadence(ctx, teamId, r.crmUserId as string, startMs, endMs);
      bySetter.push({ rosterId: r.rosterId, ...summary });
    }
    return { range: { startMs, endMs }, bySetter, truncated: bySetter.some((s) => s.truncated) ? ["dials"] : [] };
  },
});

/** One setter's leads by attempts — the drawer's cadence tab. */
export const getCadenceRows = query({
  args: { ...RANGE_ARGS, rosterId: v.string() },
  handler: async (ctx, args) => {
    const access = await resolveSettersPageAccess(ctx, args.clerkId, args.rangeStart, args.rangeEnd);
    if (!access) return null;
    const roster = await rosterForAccess(ctx, access, args.rosterId);
    if (!roster || !roster.crmUserId) return null;
    const { leads, summary } = await loadCadence(ctx, access.teamId, roster.crmUserId, access.startMs, access.endMs);
    return { summary, leads: await nameLeads(ctx, access.teamId, leads), listed: Math.min(leads.length, 300) };
  },
});

async function rosterForAccess(ctx: Parameters<typeof collectTeamBookings>[0], access: SettersPageAccess, rosterId: string): Promise<Doc<"setterRoster"> | null> {
  const row = await ctx.db.get(rosterId as Id<"setterRoster">);
  return row && row.teamId === access.teamId ? row : null;
}

/** One setter's days: filed EOD numbers beside what Close measured, per team-local day. */
export const getSetterDrawer = query({
  args: { ...RANGE_ARGS, rosterId: v.string() },
  handler: async (ctx, args) => {
    const access = await resolveSettersPageAccess(ctx, args.clerkId, args.rangeStart, args.rangeEnd);
    if (!access) return null;
    const roster = await rosterForAccess(ctx, access, args.rosterId);
    if (!roster) return null;
    const { teamId, startMs, endMs, timezone } = access;
    const measured = roster.crmUserId ? await loadUserDays(ctx, teamId, roster.crmUserId, startMs, endMs, timezone) : null;
    const rows: Array<{ dayKey: string; filed: Doc<"setterEodEntries"> | null; measured: { dials: number; answered: number; texts: number } | null }> = [];
    const lastKey = dayKeyInTz(endMs - 1, timezone);
    for (let key = dayKeyInTz(startMs, timezone); key <= lastKey; key = addDaysKey(key, 1)) {
      const filed = await ctx.db
        .query("setterEodEntries")
        .withIndex("by_roster_and_day", (q) => q.eq("rosterId", roster._id).eq("dayKey", key))
        .first();
      rows.push({ dayKey: key, filed, measured: measured ? measured.byDay.get(key) ?? { dials: 0, answered: 0, texts: 0 } : null });
    }
    return { rosterId: args.rosterId, name: roster.name, role: roster.role ?? "booking", linked: !!roster.crmUserId, rows, truncated: measured?.truncated ? ["events"] : [] };
  },
});

/** One setter's speed to lead, per lead, grouped by arrival day. */
export const getSpeedByDay = query({
  args: { ...RANGE_ARGS, rosterId: v.string(), slowestFirst: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const access = await resolveSettersPageAccess(ctx, args.clerkId, args.rangeStart, args.rangeEnd);
    if (!access) return null;
    const roster = await rosterForAccess(ctx, access, args.rosterId);
    if (!roster) return null;
    const hours = await hoursFor(ctx, access);
    const slowest = args.slowestFirst === true;
    if (roster.role === "confirmation") {
      const { records, truncated } = await collectBookedInRange(ctx, access);
      const rows = confirmationSpeedRows(records, String(roster._id), roster.name, hours);
      return { kind: "confirmation" as const, basis: basisOf(hours), truncated, ...confirmationSpeedDays(rows, access.timezone, slowest) };
    }
    const rosterRows = (await ctx.db.query("setterRoster").withIndex("by_team", (q) => q.eq("teamId", access.teamId)).take(200)).filter((r) => r.active);
    const setters: SetterRef[] = rosterRefsOf(rosterRows)
      .filter((r) => r.role !== "confirmation" && r.crmUserId)
      .map((r) => ({ rosterId: r.rosterId, name: r.name, crmUserId: r.crmUserId as string }));
    const speed = await outboundSpeed(ctx, access.teamId, setters, hours, access.startMs, access.endMs, access.nowMs);
    return { kind: "outbound" as const, basis: basisOf(hours), truncated: speed.truncated, ...speedDaysFor(speed, String(roster._id), access.timezone, slowest) };
  },
});
