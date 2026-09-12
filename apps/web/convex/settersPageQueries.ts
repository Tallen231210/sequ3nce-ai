// ============================================================================
// The Setters page: one page per team on the attribution engine, in three
// subscriptions so no single query can pass Convex's read budget —
// bookings (by call date), sets (by booked date) and Close activity — plus
// two on-demand reads for the per-setter drawer. Every number has one source;
// see settersPageLabels for what each word means.
// ============================================================================

import { v } from "convex/values";
import { describeWindow } from "./lib/workingWindow";
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
/** How far back / forward a booking's call may sit and still be in the sets cohort — with the 14-day range, inside the collector's 60-day span. */
const SETS_LOOKBACK_MS = 7 * DAY_MS;
const SETS_LOOKAHEAD_MS = 39 * DAY_MS;
const RANGE_ARGS = { clerkId: v.string(), rangeStart: v.number(), rangeEnd: v.number() };

async function hoursFor(ctx: Parameters<typeof activeFunnelFor>[0], access: SettersPageAccess): Promise<Hours> {
  const funnel = await activeFunnelFor(ctx, access.teamId);
  return workingHoursFor(funnel, access.team);
}

function basisOf(hours: Hours): string {
  return `${hours.startHour}:00–${hours.endHour}:00, ${hours.days.length} days a week, ${hours.timezone}`;
}

/**
 * The window to judge one setter's speed by: a manager's pin, else the one
 * derived nightly from their own calls, else the team's. Returned with a label
 * so the card can say which it used rather than implying we know their shift.
 */
function hoursForRoster(row: Doc<"setterRoster">, teamHours: Hours): { hours: Hours; basis: string; source: "override" | "derived" | "team" } {
  const own = row.hoursOverride ?? row.derivedHours;
  if (!own) return { hours: teamHours, basis: `team hours, ${basisOf(teamHours)}`, source: "team" };
  const hours: Hours = { timezone: teamHours.timezone, days: own.days, startHour: own.startHour, endHour: own.endHour };
  const source = row.hoursOverride ? "override" : "derived";
  const how = source === "override" ? "set by a manager" : `from their own calls`;
  return { hours, basis: `their hours (${how}), ${describeWindow(own)}`, source };
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
  if (dropped > 0) truncated.push(`${dropped} ${dropped === 1 ? "booking" : "bookings"} for calls more than 39 days out or 7 days back (not counted as sets)`);
  // Calls are point reads per event here; the sales-booking test needs them.
  const data = await collectTeamBookings(ctx, access.teamId, from, to, access.nowMs, { eventRows: inWindow });
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
    // Each setter's own window, so this row agrees with the card's median
    // (which comes from getSettersSets) rather than quietly using team hours.
    const rosterDocs = await ctx.db.query("setterRoster").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(200);
    const rosterDocById = new Map(rosterDocs.map((r) => [String(r._id), r]));
    const confirmation = confirmationRows(view.confirmation, data.records, data.rosters).map((row) => {
      const doc = rosterDocById.get(row.rosterId);
      const own = doc ? hoursForRoster(doc, hours) : { hours, basis: `team hours, ${basisOf(hours)}` };
      const { median } = percentiles(responseTimes(data.records, row.rosterId, own.hours));
      return { ...row, responseMedianWorkingMs: median, hoursBasis: own.basis };
    });
    const coverage = [
      "Leads per setter, and sets per lead: the CRM doesn't tell us who owns a lead, so we can't split leads by setter.",
      "Where a lead came from, pipeline stages, ad spend and pre-call questionnaires: this CRM doesn't give us any of them.",
      "Replies to texts: the cards count answered calls only. Replies are listed per lead inside a setter's card.",
    ];
    if (access.rangeClampedToDays) coverage.push(`Showing the last ${access.rangeClampedToDays} days of the range you picked.`);
    return {
      range: { startMs, endMs, timezone: data.timezone },
      rangeClampedToDays: access.rangeClampedToDays,
      truncated: data.truncated,
      labels,
      basis: rosterDocs.some((r) => r.derivedHours || r.hoursOverride)
        ? "each setter's own, worked out from their calls"
        : basisOf(hours),
      strip: teamStrip(view.comparison, data.records, labels, view.funnel),
      outbound: outboundRows(view.outbound, data.records, data.rosters),
      dm: dmRows(view.dm, data.records, team.setterDmPeople ?? []),
      confirmation,
      selfBookedUncontacted: view.selfBookedUncontacted,
      unattributed: view.unattributed,
      followUpsExcluded: view.followUpsExcluded,
      records: view.records,
      notASet: data.notASet,
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
    // Her own window, same as the outbound setters get. This is the median the
    // card actually renders — the copy on getSettersBookings.confirmation is
    // read by nothing.
    const setsRosterDocs = await ctx.db.query("setterRoster").withIndex("by_team", (q) => q.eq("teamId", access.teamId)).take(200);
    const setsRosterById = new Map(setsRosterDocs.map((r) => [String(r._id), r]));
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
        const contacted = selfBooks.filter(
          (b) => hers(b).length > 0 || ((b.classification.attributedBy === "tag" || b.classification.attributedBy === "claim") && b.classification.creditRosterIds.includes(r.rosterId)),
        );
        const herDoc = setsRosterById.get(r.rosterId);
        const herHours = herDoc ? hoursForRoster(herDoc, hours).hours : hours;
        const { median } = percentiles(confirmationSpeedRows(records, r.rosterId, r.name, herHours).flatMap((row) => (row.workingMs === null ? [] : [row.workingMs])));
        // Every self-book is in her denominator (covering them is the job) and
        // lands in exactly ONE bucket below, so the breakdown adds up to the
        // total above it. These used to be independent filters that overlapped
        // — a booking with no lead in the CRM was counted twice — and the
        // leftover was clamped at zero to hide the negative that produced.
        const contactedSet = new Set(contacted.map((b) => b.key));
        let workedByOutbound = 0;
        let contactedByOthers = 0;
        let leadMissing = 0;
        let nobody = 0;
        for (const b of selfBooks) {
          // 1. She worked it. That is the job, and it is provable.
          if (contactedSet.has(b.key)) continue;
          // 2. Another setter worked it instead — those sit in Unlabeled.
          if (b.touches.some((t) => t.rosterId !== null && t.rosterId !== r.rosterId)) {
            workedByOutbound += 1;
            continue;
          }
          // 3. Somebody touched it who isn't on the setter roster: a closer or the owner.
          if (b.touches.length > 0) {
            contactedByOthers += 1;
            continue;
          }
          // 4. No lead in the CRM, so "nobody called them" would be a claim we can't make.
          if (!b.leadContactId) {
            leadMissing += 1;
            continue;
          }
          // 5. In the CRM, and nobody went near it.
          nobody += 1;
        }
        return {
          rosterId: r.rosterId,
          newSelfBooks: selfBooks.length,
          contacted: contacted.length,
          reached: contacted.filter((b) => hers(b).some((t) => t.reached)).length,
          coveragePct: selfBooks.length > 0 ? Math.round((contacted.length / selfBooks.length) * 100) : null,
          workedByOutbound,
          contactedByOthers,
          nobody,
          leadMissing,
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
    const ownerOfCrm = new Map<string, { rosterId: string; name: string }>();
    const duplicates: string[] = [];
    for (const r of rosters) {
      if (!r.crmUserId) continue;
      const owner = ownerOfCrm.get(r.crmUserId);
      if (owner) duplicates.push(`${r.name} shares a Close user with ${owner.name}; their dials are counted under ${owner.name}`);
      else ownerOfCrm.set(r.crmUserId, { rosterId: r.rosterId, name: r.name });
    }
    const connectsKnown = activity.uncountedDays.length === 0;
    const byRoster = rosters.map((r) => {
      const owns = !!r.crmUserId && ownerOfCrm.get(r.crmUserId)?.rosterId === r.rosterId;
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
    if (!activity.rollupsReady) coverage.push("Dials for this team are counted call by call rather than from a daily total, so a very busy day can come up short.");
    if (activity.uncountedDays.length > 0) {
      const n = activity.uncountedDays.length;
      coverage.push(`Pick-ups and texts on ${n} ${n === 1 ? "day" : "days"} in this range (${activity.uncountedDays[0]} to ${activity.uncountedDays[n - 1]}): those days are older than the counters, so they show as blank rather than zero.`);
    }
    if (unattributedDials > 0) coverage.push(`${unattributedDials} dials in this range have nobody's name on them in the CRM, so they aren't counted for any setter.`);
    if (otherUsersDials > 0) coverage.push(`${otherUsersDials} dials in this range were made by people who aren't on the setter roster — closers, admins, or people who have left.`);
    const truncated = [...activity.truncated, ...filed.truncated];
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
    const hours = await hoursFor(ctx, access);
    const rowById = new Map(rosterRows.map((r) => [String(r._id), r]));
    const setters: SetterRef[] = rosterRefsOf(rosterRows)
      .filter((r) => r.role !== "confirmation" && r.crmUserId)
      .map((r) => ({ rosterId: r.rosterId, name: r.name, crmUserId: r.crmUserId as string, hours: hoursForRoster(rowById.get(r.rosterId)!, hours).hours }));
    const speed = await outboundSpeed(ctx, teamId, setters, hours, startMs, endMs, nowMs, access.team.setterConnectionThresholdSec ?? DEFAULT_CONNECT_SEC);
    const byId = speedBySetter(speed, setters);
    const all = speed.rows;
    return {
      range: { startMs, endMs },
      basis: basisOf(hours),
      truncated: speed.truncated,
      bySetter: setters.map((s) => ({
        rosterId: s.rosterId,
        ...byId.get(s.rosterId)!,
        // Which window judged them, so the card never implies we know a shift we guessed.
        hoursBasis: hoursForRoster(rowById.get(s.rosterId)!, hours).basis,
      })),
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
    const drawerRowById = new Map(rosterRows.map((r) => [String(r._id), r]));
    const setters: SetterRef[] = rosterRefsOf(rosterRows)
      .filter((r) => r.role !== "confirmation" && r.crmUserId)
      .map((r) => ({ rosterId: r.rosterId, name: r.name, crmUserId: r.crmUserId as string, hours: hoursForRoster(drawerRowById.get(r.rosterId)!, hours).hours }));
    const own = hoursForRoster(roster, hours);
    const speed = await outboundSpeed(ctx, access.teamId, setters, hours, access.startMs, access.endMs, access.nowMs, access.team.setterConnectionThresholdSec ?? DEFAULT_CONNECT_SEC);
    return { kind: "outbound" as const, basis: own.basis, truncated: speed.truncated, ...speedDaysFor(speed, String(roster._id), access.timezone, slowest) };
  },
});
