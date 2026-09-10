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
import { activeFunnelFor } from "./setterFunnels";
import { workingHoursFor } from "./setterFunnelResolve";
import { collectTeamBookings, type BookingRecord } from "./setterTeamBookings";
import { rosterRefsOf } from "./setterTeamBookingHelpers";
import { buildSetterTeamsView } from "./setterTeamLanes";
import { loadActivity, loadFiled } from "./settersPageActivity";
import { resolveSettersPageAccess, type SettersPageAccess } from "./settersPageGate";
import { teamLabelsFor } from "./settersPageLabels";
import { confirmationRows, dmRows, outboundRows, percentiles, responseTimes, teamStrip, type Hours } from "./settersPageTeams";
import { confirmationSpeedDays, confirmationSpeedRows, outboundSpeed, speedBySetter, speedDaysFor, type SetterRef } from "./settersPageSpeed";
import { CADENCE_BUDGET, loadCadence, nameLeads, type CadenceSummary } from "./settersPageCadence";
import { DEFAULT_CONNECT_SEC } from "./lib/dialAnswered";

const BOOKED_TAKE = 8_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back / forward a booking's call may sit and still be in the sets cohort — bounds the collector's window whatever one stray row says. */
const SETS_LOOKBACK_MS = 30 * DAY_MS;
const SETS_LOOKAHEAD_MS = 60 * DAY_MS;
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
  // The collector's window is bounded by the range, not by the stray row:
  // one event logged for a call weeks ago must not squeeze this week's sets
  // for calls far out past the collector's span cap.
  const from = Math.max(Math.min(access.startMs, ...rows.map((e) => e.startTime)), access.startMs - SETS_LOOKBACK_MS);
  const to = Math.min(Math.max(...rows.map((e) => e.startTime)) + 1, access.endMs + SETS_LOOKAHEAD_MS);
  const inWindow = rows.filter((e) => e.startTime >= from && e.startTime < to);
  const dropped = rows.length - inWindow.length;
  if (dropped > 0) truncated.push(`${dropped} ${dropped === 1 ? "booking" : "bookings"} for calls more than 60 days out or 30 days back (not counted as sets)`);
  const data = await collectTeamBookings(ctx, access.teamId, from, to, access.nowMs, {
    eventRows: inWindow,
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
          claimed: mine.filter((b) => b.classification.attributedBy === "claim").length,
        };
      });
    const selfBooks = records.filter(isSelfBook);
    const confirmation = rosters
      .filter((r) => r.role === "confirmation")
      .map((r) => {
        const hers = (b: BookingRecord) => b.touches.filter((t) => t.rosterId === r.rosterId && t.afterBooking);
        const contacted = selfBooks.filter((b) => hers(b).length > 0 || (b.classification.attributedBy === "tag" && b.classification.creditRosterIds.includes(r.rosterId)));
        const { median } = percentiles(confirmationSpeedRows(records, r.rosterId, r.name, hours).flatMap((row) => (row.workingMs === null ? [] : [row.workingMs])));
        // Every self-book is in her denominator (covering them is the job);
        // the ones an outbound setter worked instead sit in Unlabeled and
        // are named here so the two numbers explain each other.
        const workedByOutbound = selfBooks.filter((b) => b.classification.lane === "unattributed" && b.touches.some((t) => t.rosterId !== null && t.rosterId !== r.rosterId)).length;
        const nobody = selfBooks.filter((b) => b.classification.lane === "self_booked_uncontacted").length;
        return {
          rosterId: r.rosterId,
          newSelfBooks: selfBooks.length,
          contacted: contacted.length,
          reached: contacted.filter((b) => hers(b).some((t) => t.reached)).length,
          coveragePct: selfBooks.length > 0 ? Math.round((contacted.length / selfBooks.length) * 100) : null,
          workedByOutbound,
          nobody,
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
    const connectSec = activity.connectSec;
    // One roster row per Close user: a second row on the same user would
    // show the same dials twice. The first row keeps them; the rest are named.
    const ownerOfCrm = new Map<string, string>();
    const duplicates: string[] = [];
    for (const r of rosters) {
      if (!r.crmUserId) continue;
      const owner = ownerOfCrm.get(r.crmUserId);
      if (owner) duplicates.push(`${r.name} shares a Close user with ${owner}; their dials are counted under ${owner}`);
      else ownerOfCrm.set(r.crmUserId, r.name);
    }
    const connectsKnown = activity.uncountedDays.length === 0;
    const byRoster = rosters.map((r) => {
      const owns = !!r.crmUserId && ownerOfCrm.get(r.crmUserId) === r.name;
      const counts = owns ? activity.byUser.get(r.crmUserId as string) ?? { dials: 0, answered: 0, texts: 0 } : null;
      return {
        rosterId: r.rosterId,
        name: r.name,
        role: r.role,
        linked: !!r.crmUserId,
        dials: counts ? counts.dials : null,
        // Counted only where every rollup day in the range carries the counters.
        answered: counts && connectsKnown ? counts.answered : null,
        texts: counts && connectsKnown ? counts.texts : null,
        filed: filed.byRoster.get(r.rosterId) ?? null,
      };
    });
    const unattributedDials = activity.byUser.get("")?.dials ?? 0;
    // Dials by Close users who aren't on the roster (closers, admins,
    // departed setters): counted here so the page never silently loses them.
    const rosterCrm = new Set(rosters.map((r) => r.crmUserId).filter((id): id is string => !!id));
    let otherUsersDials = 0;
    for (const [user, counts] of activity.byUser) if (user !== "" && !rosterCrm.has(user)) otherUsersDials += counts.dials;
    const coverage: string[] = [...duplicates];
    if (!activity.rollupsReady) coverage.push("Daily rollups aren't built for this team yet, so dials are read from raw events and may be partial.");
    if (activity.uncountedDays.length > 0) {
      const n = activity.uncountedDays.length;
      coverage.push(`Connects and texts aren't shown: ${n} ${n === 1 ? "day" : "days"} in this range (${activity.uncountedDays[0]} to ${activity.uncountedDays[n - 1]}) predate the connect and text counters. A recount fills them in.`);
    }
    if (unattributedDials > 0) coverage.push(`${unattributedDials} dials in the range carry no Close user and aren't credited to anyone.`);
    if (otherUsersDials > 0) coverage.push(`${otherUsersDials} dials in the range were made by Close users who aren't on the setter roster (closers, admins, people who left).`);
    const truncated = [...activity.truncated, ...filed.truncated];
    if (truncated.length > 0) coverage.push(`Partial: some reads hit their cap (${truncated.join(", ")}).`);
    return {
      range: { startMs, endMs, timezone },
      rollupsReady: activity.rollupsReady,
      connectSec,
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
    const speed = await outboundSpeed(ctx, teamId, setters, hours, startMs, endMs, nowMs, access.team.setterConnectionThresholdSec ?? DEFAULT_CONNECT_SEC);
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
    const connectSec = access.team.setterConnectionThresholdSec ?? DEFAULT_CONNECT_SEC;
    const bySetter: Array<{ rosterId: string } & CadenceSummary> = [];
    const budget = { left: CADENCE_BUDGET };
    for (const r of setters) {
      const { summary } = await loadCadence(ctx, teamId, r.crmUserId as string, startMs, endMs, connectSec, budget);
      bySetter.push({ rosterId: r.rosterId, ...summary });
    }
    const unread = setters.filter((_, i) => bySetter[i].truncated).map((r) => r.name);
    return { range: { startMs, endMs }, connectSec, bySetter, truncated: unread.length > 0 ? [`cadence dials (${unread.join(", ")})`] : [] };
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
    const { leads, summary } = await loadCadence(ctx, access.teamId, roster.crmUserId, access.startMs, access.endMs, access.team.setterConnectionThresholdSec ?? DEFAULT_CONNECT_SEC);
    return { summary, leads: await nameLeads(ctx, access.teamId, leads), listed: Math.min(leads.length, 300) };
  },
});

async function rosterForAccess(ctx: Parameters<typeof collectTeamBookings>[0], access: SettersPageAccess, rosterId: string): Promise<Doc<"setterRoster"> | null> {
  // A client string: a malformed id, or one from another table, is "nothing", never an error.
  const id = ctx.db.normalizeId("setterRoster", rosterId);
  if (!id) return null;
  const row = await ctx.db.get(id);
  return row && row.teamId === access.teamId ? row : null;
}

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
    const speed = await outboundSpeed(ctx, access.teamId, setters, hours, access.startMs, access.endMs, access.nowMs, access.team.setterConnectionThresholdSec ?? DEFAULT_CONNECT_SEC);
    return { kind: "outbound" as const, basis: basisOf(hours), truncated: speed.truncated, ...speedDaysFor(speed, String(roster._id), access.timezone, slowest) };
  },
});
