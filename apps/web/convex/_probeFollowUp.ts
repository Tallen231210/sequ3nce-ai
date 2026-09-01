// Probe: end-to-end test of the recount's follow-up measurement (repo
// convention: internal probes run via `npx convex run --prod`, like
// _probeCalendarScope). Seeds one follow-up-titled calendar event with a
// linked completed call where the prospect appeared, so a recount should
// produce fuBooked=1 AND fuShown=1 for that closer-day. `cleanup` removes
// exactly what `seed` created (uid-prefixed) and the caller re-recounts.

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { DEFAULT_TIMEZONE, attributeBooking } from "./closerPerformance";
import { isFollowUpTitle } from "./lib/followUpTitle";
import { groupBookingCopies, isSalesBooking } from "./calendarBookings";
import { getLocalDateRangeUtc } from "./setterDataNotifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

const UID = "probe_fu_event";

export const seed = internalMutation({
  args: { closerId: v.id("closers"), dayKey: v.string() },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) throw new Error("closer not found");
    const teamId = (closer as any).teamId;
    const team = await ctx.db.get(teamId);
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;
    const { startMs } = getLocalDateRangeUtc(args.dayKey, tz);
    const start = startMs + 10 * 3_600_000; // 10am local
    const now = Date.now();

    const eventId = await ctx.db.insert("calendarEvents", {
      closerId: args.closerId,
      teamId,
      uid: UID,
      title: `Follow up - Probe Prospect and ${(closer as any).name ?? "Rep"}`,
      startTime: start,
      endTime: start + 45 * 60_000,
      fetchedAt: now,
    } as any);

    const callId = await ctx.db.insert("calls", {
      teamId,
      closerId: args.closerId,
      prospectName: "Probe Prospect",
      status: "completed",
      speakerCount: 2,
      outcome: "follow_up",
      outcomeSource: "closer",
      prospectJoined: true,
      calendarEventId: eventId,
      source: "manual",
      classifiedAs: "sales",
      classifiedBy: "closer",
      countsTowardStats: true,
      startedAt: start,
      completedAt: start + 40 * 60_000,
      createdAt: start,
    } as any);

    return { eventId, callId };
  },
});

/** Docs/screenshot fixtures: one AI-read unconfirmed call (teaches the
 *  Confirm button) on the given closer's today. CLI-only. */
export const seedStripDemo = internalMutation({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) throw new Error("closer not found");
    const now = Date.now();
    const callId = await ctx.db.insert("calls", {
      teamId: (closer as any).teamId,
      closerId: args.closerId,
      prospectName: "Alex Rivera",
      status: "completed",
      speakerCount: 2,
      outcome: "closed",
      outcomeSource: "ai",
      cashCollected: 2000,
      contractValue: 6800,
      prospectJoined: true,
      source: "manual",
      classifiedAs: "sales",
      classifiedBy: "closer",
      countsTowardStats: true,
      startedAt: now - 2 * 3_600_000,
      completedAt: now - 2 * 3_600_000 + 40 * 60_000,
      createdAt: now - 2 * 3_600_000,
    } as any);
    return { callId };
  },
});

/** Docs fixture: set/clear tier prices on a TEST team that has no manager
 *  users row (updateCloserScorecardSettings needs one). CLI-only. */
export const setTierPricesForDocs = internalMutation({
  args: {
    teamId: v.id("teams"),
    prices: v.union(v.array(v.number()), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      closerTierPrices: args.prices ?? undefined,
    } as any);
    return { set: args.prices };
  },
});

export const cleanupCall = internalMutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (call) {
      const stats = await ctx.db
        .query("callStats")
        .withIndex("by_call", (q: any) => q.eq("callId", args.callId))
        .collect();
      for (const s of stats) await ctx.db.delete(s._id);
      await ctx.db.delete(args.callId);
    }
    return { cleaned: true };
  },
});

export const cleanup = internalMutation({
  args: { eventId: v.id("calendarEvents"), callId: v.id("calls") },
  handler: async (ctx, args) => {
    const ev = await ctx.db.get(args.eventId);
    if (ev && (ev as any).uid === UID) await ctx.db.delete(args.eventId);
    const call = await ctx.db.get(args.callId);
    if (call && (call as any).prospectName === "Probe Prospect") {
      const stats = await ctx.db
        .query("callStats")
        .withIndex("by_call", (q: any) => q.eq("callId", args.callId))
        .collect();
      for (const s of stats) await ctx.db.delete(s._id);
      await ctx.db.delete(args.callId);
    }
    return { cleaned: true };
  },
});

/** Diagnostic: replay the recount's calendar-loop decisions for one
 *  team-day — which events match the FU title, which classify as calls,
 *  and who they attribute to. Read-only. */
export const dayDiag = internalQuery({
  args: { teamId: v.id("teams"), dayKey: v.string() },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;
    const { startMs, endMs } = getLocalDateRangeUtc(args.dayKey, tz);
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_team_and_time", (q: any) =>
        q.eq("teamId", args.teamId).gte("startTime", startMs).lt("startTime", endMs),
      )
      .take(5000);
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q: any) =>
        q.eq("teamId", args.teamId).gte("createdAt", startMs).lt("createdAt", endMs),
      )
      .take(5000);
    const callByEventId = new Map<string, any>();
    for (const c of calls as any[]) {
      if (c.calendarEventId) callByEventId.set(String(c.calendarEventId), c);
    }
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
      .take(500);
    const closerNames = closers
      .filter((c: any) => c.status !== "deactivated")
      .map((c: any) => ({ id: String(c._id), name: c.name ?? "" }));
    const copiesByUid = groupBookingCopies(events as any);
    const out: any[] = [];
    for (const [, copies] of copiesByUid) {
      const ev: any = copies[0];
      if (!isFollowUpTitle(ev.title)) continue;
      const linked = copies
        .map((c: any) => callByEventId.get(String(c._id)))
        .find((x: any) => !!x);
      const isCall = isSalesBooking(copies as any, {
        producedARecordedCall: !!linked,
      });
      const attr = attributeBooking(copies as any, linked ? String(linked.closerId) : null, closerNames);
      out.push({
        title: (ev.title ?? "").slice(0, 60),
        fuTitleMatch: true,
        isSalesBooking: isCall,
        ownerId: attr.closerId ? String(attr.closerId).slice(-6) : null,
        unknownRep: attr.unknownRep ?? null,
        hasLinkedCall: !!linked,
        prospectJoined: linked ? (linked.prospectJoined ?? null) : null,
        outcome: linked ? (linked.outcome ?? null) : null,
      });
    }
    return out;
  },
});
