// ============================================================================
// Manager-facing configuration for the Setters page: section labels, DM
// people, and the booking-link word lists. Everything a company needs to
// make the page its own lives here, not in code. Manager-only, flag-gated.
// ============================================================================

import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { addDaysKey } from "./dataHealthCore";
import { DEFAULT_CONNECT_SEC } from "./lib/dialAnswered";
import type { Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { teamHasSetterTeams } from "./setterTeamQueries";
import { DEFAULT_TEAM_LABELS, teamLabelsFor } from "./settersPageLabels";
import { DEFAULT_TOLERANCES, TOLERANCE_LIMITS, tolerancesFor } from "./lib/eodCrossCheck";

const LABEL_MAX = 40;
const NAME_MAX = 80;
const LINK_MIN = 2;
const LINK_MAX = 40;
const PEOPLE_MAX = 20;
const PATTERNS_MAX = 20;
const PATTERN_MAX = 40;

async function manager(ctx: { db: any }, clerkId: string): Promise<Id<"teams">> {
  const user = await resolveAuthUser(ctx, clerkId);
  if (!user?.teamId) throw new ConvexError("Not authorised");
  if (user.role !== "admin" && user.role !== "manager") throw new ConvexError("Only managers can do that");
  const team = await ctx.db.get(user.teamId as Id<"teams">);
  if (!team || !teamHasSetterTeams(team)) throw new ConvexError("The Setters page isn't switched on for this team");
  return user.teamId as Id<"teams">;
}

const LABELS = v.object({ dm: v.optional(v.string()), outbound: v.optional(v.string()), confirmation: v.optional(v.string()) });
const PERSON = v.object({ name: v.string(), linkName: v.string(), active: v.boolean() });

function cleanLabels(labels: { dm?: string; outbound?: string; confirmation?: string }) {
  const one = (s: string | undefined) => {
    const t = (s ?? "").trim();
    if (t.length > LABEL_MAX) throw new ConvexError(`Keep section names under ${LABEL_MAX} characters`);
    return t || undefined;
  };
  return { dm: one(labels.dm), outbound: one(labels.outbound), confirmation: one(labels.confirmation) };
}

export function cleanPeople(people: Array<{ name: string; linkName: string; active: boolean }>) {
  if (people.length > PEOPLE_MAX) throw new ConvexError(`At most ${PEOPLE_MAX} DM setters`);
  const seen = new Set<string>();
  return people.map((p) => {
    const name = p.name.trim().slice(0, NAME_MAX);
    const linkName = p.linkName.trim().toLowerCase();
    if (!name) throw new ConvexError("Every DM setter needs a name");
    if (linkName.length < LINK_MIN || linkName.length > LINK_MAX) throw new ConvexError(`The link name is the word inside the booking link, ${LINK_MIN}–${LINK_MAX} characters`);
    if (seen.has(linkName)) throw new ConvexError(`Two DM setters share the link name "${linkName}"`);
    seen.add(linkName);
    return { name, linkName, active: p.active };
  });
}

/** Word lists: lower-case, deduped, each 2–40 characters, at most 20. Same rule as the CLI setter. */
export function cleanPatterns(list: string[]): string[] {
  const out = Array.from(new Set(list.map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 2 && s.length <= PATTERN_MAX)));
  if (out.length > PATTERNS_MAX) throw new ConvexError(`At most ${PATTERNS_MAX} words per list`);
  return out;
}

export const getConfig = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return null;
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    if (!team || !teamHasSetterTeams(team)) return null;
    return {
      labels: teamLabelsFor(team.setterTeamLabels),
      defaults: DEFAULT_TEAM_LABELS,
      people: team.setterDmPeople ?? [],
      dmPatterns: team.setterDmEventNamePatterns ?? [],
      funnelPatterns: team.setterFunnelEventNamePatterns ?? [],
      tolerances: tolerancesFor(team.setterEodTolerances),
      toleranceDefaults: DEFAULT_TOLERANCES,
      connectSec: team.setterConnectionThresholdSec ?? DEFAULT_CONNECT_SEC,
      recountRequestedAt: team.setterRollupsRecountRequestedAt ?? null,
    };
  },
});

export const setTeamLabels = mutation({
  args: { clerkId: v.string(), labels: LABELS },
  handler: async (ctx, args) => {
    const teamId = await manager(ctx, args.clerkId);
    await ctx.db.patch(teamId, { setterTeamLabels: cleanLabels(args.labels) });
    return { ok: true };
  },
});

export const setDmPeople = mutation({
  args: { clerkId: v.string(), people: v.array(PERSON) },
  handler: async (ctx, args) => {
    const teamId = await manager(ctx, args.clerkId);
    await ctx.db.patch(teamId, { setterDmPeople: cleanPeople(args.people) });
    return { ok: true };
  },
});

export const updateLanePatterns = mutation({
  args: { clerkId: v.string(), dm: v.array(v.string()), funnel: v.array(v.string()) },
  handler: async (ctx, args) => {
    const teamId = await manager(ctx, args.clerkId);
    await ctx.db.patch(teamId, { setterDmEventNamePatterns: cleanPatterns(args.dm), setterFunnelEventNamePatterns: cleanPatterns(args.funnel) });
    return { ok: true };
  },
});

const TOLERANCES = v.object({ dialsPct: v.number(), pickUpsPct: v.number(), confirmationPct: v.number(), minGap: v.number() });

function cleanTolerances(t: { dialsPct: number; pickUpsPct: number; confirmationPct: number; minGap: number }) {
  const pct = (n: number, what: string) => {
    if (!Number.isFinite(n) || n < TOLERANCE_LIMITS.pctMin || n > TOLERANCE_LIMITS.pctMax) throw new ConvexError(`${what} must be ${TOLERANCE_LIMITS.pctMin}–${TOLERANCE_LIMITS.pctMax}%`);
    return Math.round(n);
  };
  if (!Number.isFinite(t.minGap) || t.minGap < TOLERANCE_LIMITS.minGapMin || t.minGap > TOLERANCE_LIMITS.minGapMax) {
    throw new ConvexError(`The smallest flagged gap must be ${TOLERANCE_LIMITS.minGapMin}–${TOLERANCE_LIMITS.minGapMax}`);
  }
  return { dialsPct: pct(t.dialsPct, "Dials"), pickUpsPct: pct(t.pickUpsPct, "Pick-ups"), confirmationPct: pct(t.confirmationPct, "Confirmation"), minGap: Math.round(t.minGap) };
}

/** How far a filed EOD number may sit from what Close / the calendar measured before it is flagged. */
export const setTolerances = mutation({
  args: { clerkId: v.string(), tolerances: TOLERANCES },
  handler: async (ctx, args) => {
    const teamId = await manager(ctx, args.clerkId);
    await ctx.db.patch(teamId, { setterEodTolerances: cleanTolerances(args.tolerances) });
    return { ok: true };
  },
});

const RECOUNT_DAYS = 14;
const RECOUNT_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * The team's connect threshold, from the Setters page. The ladder, the
 * drawer and the flags read raw Close events and move at once; the cards'
 * Connects for whole past days come from the daily rollups, so one recount
 * of the last two weeks is kicked here — never a second chain while one may
 * still be running (recountRange reschedules itself a day at a time).
 */
export const setConnectThreshold = mutation({
  args: { clerkId: v.string(), thresholdSec: v.number() },
  handler: async (ctx, args) => {
    const teamId = await manager(ctx, args.clerkId);
    if (!Number.isInteger(args.thresholdSec) || args.thresholdSec < 10 || args.thresholdSec > 600) {
      throw new ConvexError("The threshold must be a whole number of seconds between 10 and 600");
    }
    const team = await ctx.db.get(teamId);
    if (!team) throw new ConvexError("Team not found");
    const nowMs = Date.now();
    const unchanged = (team.setterConnectionThresholdSec ?? DEFAULT_CONNECT_SEC) === args.thresholdSec;
    await ctx.db.patch(teamId, { setterConnectionThresholdSec: args.thresholdSec });
    if (unchanged) return { ok: true, recount: "none" as const };
    // One chain at a time. A recount reads the threshold when it runs, so a
    // change made while one is running just needs another run after it.
    const requestedAt = team.setterRollupsRecountRequestedAt ?? 0;
    if (requestedAt > nowMs) return { ok: true, recount: "queued" as const }; // a deferred run is already waiting
    const tz = (team as { timezone?: string }).timezone || DEFAULT_TIMEZONE;
    const runAt = requestedAt > nowMs - RECOUNT_COOLDOWN_MS ? requestedAt + RECOUNT_COOLDOWN_MS : nowMs;
    const endDayKey = dayKeyInTz(runAt, tz);
    await ctx.db.patch(teamId, { setterRollupsRecountRequestedAt: runAt });
    await ctx.scheduler.runAfter(Math.max(0, runAt - nowMs), internal.setterRollups.recountRange, { teamId, startDayKey: addDaysKey(endDayKey, -RECOUNT_DAYS), endDayKey });
    return { ok: true, recount: runAt > nowMs ? ("queued" as const) : ("started" as const) };
  },
});

/** CLI twin for setup: npx convex run settersPageConfig:setDmPeopleForTeam '{"teamId":"…","people":[{"name":"Davud","linkName":"davud","active":true}]}' --prod */
export const setDmPeopleForTeam = internalMutation({
  args: { teamId: v.id("teams"), people: v.array(PERSON) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, { setterDmPeople: cleanPeople(args.people) });
    return { ok: true, people: cleanPeople(args.people) };
  },
});
