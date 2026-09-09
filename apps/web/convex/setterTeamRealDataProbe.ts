// ============================================================================
// Real-data rehearsal for the setter-team pass, on the DEV deployment.
//
// Loads copies of a real team's calendar rows (with booking links, colours
// and guests), its EOD roster, its CRM users, the guests' Close leads and
// their Close activity — all pulled read-only from production beforehand —
// under a throwaway team on dev, runs collectTeamBookings over them, and
// tears everything down. Driven from a script (scratchpad/close/rehearsal.py).
//
// Never point this at production.
// ============================================================================

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { collectTeamBookings } from "./setterTeamBookings";
import { buildSetterTeamsView } from "./setterTeamLanes";

const P = "st-"; // fixture uid / event-key prefix

export const seedTeam = internalMutation({
  args: {
    name: v.string(),
    timezone: v.string(),
    dmPatterns: v.array(v.string()),
    funnelPatterns: v.array(v.string()),
    excludedTitles: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await ctx.db.insert("teams", {
      name: args.name,
      plan: "active",
      createdAt: Date.now(),
      timezone: args.timezone,
      betaFeatures: ["setter_teams", "calendar_color_tracking"],
      setterDmEventNamePatterns: args.dmPatterns,
      setterFunnelEventNamePatterns: args.funnelPatterns,
      closerExcludedBookingTitles: args.excludedTitles,
    });
    return { teamId };
  },
});

export const seedRoster = internalMutation({
  args: {
    teamId: v.id("teams"),
    rows: v.array(
      v.object({
        name: v.string(),
        role: v.optional(v.union(v.literal("booking"), v.literal("confirmation"))),
        tag: v.optional(v.string()),
        crmUserId: v.optional(v.string()),
        active: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids: string[] = [];
    for (const [i, r] of args.rows.entries()) {
      ids.push(
        await ctx.db.insert("setterRoster", {
          teamId: args.teamId,
          name: r.name,
          token: `${P}${now}-${i}`,
          tag: r.tag,
          active: r.active,
          role: r.role,
          crmUserId: r.crmUserId,
          createdAt: now,
        }),
      );
    }
    return { inserted: ids.length };
  },
});

export const seedReps = internalMutation({
  args: { teamId: v.id("teams"), rows: v.array(v.object({ ghlUserId: v.string(), name: v.string() })) },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const r of args.rows) {
      await ctx.db.insert("setterReps", {
        teamId: args.teamId,
        ghlUserId: r.ghlUserId,
        name: r.name,
        isActive: true,
        lastSeenInSyncAt: now,
      });
    }
    return { inserted: args.rows.length };
  },
});

export const seedLeads = internalMutation({
  args: {
    teamId: v.id("teams"),
    rows: v.array(
      v.object({
        ghlContactId: v.string(),
        email: v.optional(v.string()),
        dateAdded: v.number(),
        firstDialAt: v.optional(v.number()),
        firstSmsOutboundAt: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const r of args.rows) {
      await ctx.db.insert("setterLeads", {
        teamId: args.teamId,
        ghlContactId: r.ghlContactId,
        email: r.email,
        emailNorm: r.email ? r.email.trim().toLowerCase() : undefined,
        dateAdded: r.dateAdded,
        firstDialAt: r.firstDialAt,
        firstSmsOutboundAt: r.firstSmsOutboundAt,
        dialCount: 0,
        smsOutboundCount: 0,
        smsInboundCount: 0,
        smsStatus: "none",
        isConnected: false,
        appointmentCount: 0,
        showedCount: 0,
        noShowCount: 0,
        lastSyncedAt: now,
      });
    }
    return { inserted: args.rows.length };
  },
});

export const seedLeadEvents = internalMutation({
  args: {
    teamId: v.id("teams"),
    rows: v.array(
      v.object({
        ghlContactId: v.string(),
        eventType: v.string(),
        occurredAt: v.number(),
        ghlUserId: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    for (const [i, r] of args.rows.entries()) {
      const eventType = r.eventType as "dial_outbound" | "sms_outbound" | "sms_inbound" | "connected" | "call_inbound";
      if (!["dial_outbound", "sms_outbound", "sms_inbound", "connected", "call_inbound"].includes(eventType)) continue;
      await ctx.db.insert("setterLeadEvents", {
        teamId: args.teamId,
        ghlContactId: r.ghlContactId,
        eventType,
        occurredAt: r.occurredAt,
        ghlUserId: r.ghlUserId,
        ghlEventKey: `${P}${r.ghlContactId}:${r.occurredAt}:${i}`,
      });
      inserted += 1;
    }
    return { inserted };
  },
});

export const seedEvents = internalMutation({
  args: {
    teamId: v.id("teams"),
    rows: v.array(
      v.object({
        closerId: v.id("closers"),
        subscriptionId: v.id("closerCalendarSubscriptions"),
        uid: v.string(),
        title: v.string(),
        description: v.optional(v.string()),
        startTime: v.number(),
        endTime: v.number(),
        bookedAt: v.optional(v.number()),
        eventColorId: v.optional(v.string()),
        googleUpdatedAt: v.optional(v.number()),
        attendees: v.array(v.object({ email: v.string(), isOrganizer: v.optional(v.boolean()) })),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const r of args.rows) {
      await ctx.db.insert("calendarEvents", {
        closerId: r.closerId,
        teamId: args.teamId,
        uid: P + r.uid,
        title: r.title,
        description: r.description,
        startTime: r.startTime,
        endTime: r.endTime,
        bookedAt: r.bookedAt,
        eventColorId: r.eventColorId,
        googleUpdatedAt: r.googleUpdatedAt,
        // The snapshot carries no colour history: first sighting = now, so
        // post-call colours read as "unverified", never as recolored.
        colorFirstObservedAt: r.eventColorId ? now : undefined,
        attendees: r.attendees,
        subscriptionId: r.subscriptionId,
        calendarLabel: "Primary",
        fetchedAt: now,
      });
    }
    return { inserted: args.rows.length };
  },
});

export const probe = internalQuery({
  args: { teamId: v.id("teams"), startMs: v.number(), endMs: v.number(), nowMs: v.number() },
  handler: async (ctx, args) => {
    const data = await collectTeamBookings(ctx, args.teamId, args.startMs, args.endMs, args.nowMs);
    const view = buildSetterTeamsView(data.records, data.rosters);
    const nameOf = new Map(data.rosters.map((r) => [r.rosterId, r.name]));
    return {
      bookings: data.records.length,
      cancelled: data.cancelled,
      truncated: data.truncated,
      leadsLookedUp: data.leadsLookedUp,
      comparison: view.comparison,
      outbound: view.outbound,
      confirmation: view.confirmation,
      dm: view.dm,
      selfBookedUncontacted: view.selfBookedUncontacted,
      unattributed: view.unattributed,
      funnel: view.funnel,
      followUpsExcluded: view.followUpsExcluded,
      noLinkSample: data.records
        .filter((r) => r.eventName === null && r.classification.lane === "unattributed")
        .slice(0, 12)
        .map((r) => ({ closer: r.closerName, title: r.title.slice(0, 40), hasDescription: r.eventIds.length, touches: r.touches.length, lead: r.leadContactId !== null })),
      // Every funnel booking with no tag: the hand-counted set.
      untaggedFunnel: data.records
        .filter((r) => r.classification.isFunnel && r.token === null && !r.isFollowUp)
        .map((r) => ({
          day: r.dayKey,
          closer: r.closerName,
          title: r.displayTitle.slice(0, 28),
          lane: r.classification.lane,
          by: r.classification.attributedBy,
          credit: r.classification.creditRosterIds.map((id) => nameOf.get(id) ?? id),
          touches: r.touches.length,
          leadInClose: r.leadContactId !== null,
          verdict: r.verdict.result,
        })),
    };
  },
});

export const teardown = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const teamId = args.teamId as Id<"teams">;
    const counts: Record<string, number> = {};
    const wipe = async (table: string, rows: Array<{ _id: Id<any> }>) => {
      for (const r of rows) await ctx.db.delete(r._id);
      counts[table] = (counts[table] ?? 0) + rows.length;
    };
    await wipe(
      "calendarEvents",
      await ctx.db.query("calendarEvents").withIndex("by_team_and_time", (q) => q.eq("teamId", teamId)).take(10_000),
    );
    for (const t of ["dial_outbound", "sms_outbound", "sms_inbound", "connected", "call_inbound"] as const) {
      await wipe(
        "setterLeadEvents",
        await ctx.db
          .query("setterLeadEvents")
          .withIndex("by_team_and_type_and_time", (q) => q.eq("teamId", teamId).eq("eventType", t))
          .take(10_000),
      );
    }
    await wipe("setterLeads", await ctx.db.query("setterLeads").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(10_000));
    await wipe("setterRoster", await ctx.db.query("setterRoster").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(1000));
    await wipe("setterReps", await ctx.db.query("setterReps").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(1000));
    await wipe(
      "closerCalendarSubscriptions",
      await ctx.db.query("closerCalendarSubscriptions").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(1000),
    );
    await wipe("closers", await ctx.db.query("closers").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(1000));
    await ctx.db.delete(teamId);
    return counts;
  },
});
