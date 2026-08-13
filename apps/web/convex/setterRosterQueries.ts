// ============================================================================
// Small read used by the roster's name-resolution action.
//
// Separate file because setterRosterResolve.ts runs in Node (it makes HTTP
// calls) and this has to run in the normal query runtime.
// ============================================================================

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const LOOKBACK_DAYS = 90;

/**
 * The user ids doing work on this manager's team that we can't put a name to.
 *
 * Derived server-side from observed activity rather than accepted from the
 * client, so a caller can never point the lookup at ids that aren't theirs.
 */
export const unnamedActorsForUser = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return { ok: false, reason: "Not authorised." };
    if (user.role !== "admin" && user.role !== "manager") {
      return { ok: false, reason: "Only managers can do that." };
    }
    const teamId = user.teamId as Id<"teams">;
    const since = Date.now() - LOOKBACK_DAYS * 86_400_000;

    const reps = await ctx.db
      .query("setterReps")
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .take(500);
    const known = new Set(
      (reps as any[]).filter((r) => r.name).map((r) => r.ghlUserId),
    );

    const unnamed = new Set<string>();
    for (const eventType of ["dial_outbound", "sms_outbound"]) {
      const rows = await ctx.db
        .query("setterLeadEvents")
        .withIndex("by_team_and_type_and_time", (q: any) =>
          q.eq("teamId", teamId).eq("eventType", eventType).gte("occurredAt", since),
        )
        .take(12_000);
      for (const e of rows as any[]) {
        if (e.ghlUserId && !known.has(e.ghlUserId)) unnamed.add(e.ghlUserId);
      }
    }
    // Bounded: one HTTP call each, and a team with hundreds of unknown actors
    // has a bigger problem than naming them.
    return { ok: true, teamId, userIds: [...unnamed].slice(0, 40) };
  },
});

/**
 * One person's actual touches, with the leads and the timestamps.
 *
 * Exists because a manager looked at "1,174 touches" and said he wasn't sure it
 * was right — which is the correct response to a number with no evidence behind
 * it. This is the evidence: real prospects, real times, checkable against the
 * CRM in under a minute.
 */
export const touchesByUser = internalQuery({
  args: {
    teamId: v.id("teams"),
    crmUserId: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args): Promise<any> => {
    const out: any[] = [];
    const perDay = new Map<string, number>();
    /** Everyone's outbound touches in the window, needed to see who was first. */
    const allInWindow: Array<{ contactId: string; at: number; by: string | null }> = [];

    for (const eventType of ["dial_outbound", "sms_outbound"]) {
      const rows = await ctx.db
        .query("setterLeadEvents")
        .withIndex("by_team_and_type_and_time", (q: any) =>
          q
            .eq("teamId", args.teamId)
            .eq("eventType", eventType)
            .gte("occurredAt", args.rangeStart)
            .lte("occurredAt", args.rangeEnd),
        )
        .take(12_000);
      for (const e of rows as any[]) {
        allInWindow.push({
          contactId: e.ghlContactId,
          at: e.occurredAt,
          by: e.ghlUserId ?? null,
        });
        if (e.ghlUserId !== args.crmUserId) continue;
        const day = new Date(e.occurredAt).toISOString().slice(0, 10);
        perDay.set(day, (perDay.get(day) ?? 0) + 1);
        out.push({
          at: e.occurredAt,
          kind: eventType === "dial_outbound" ? "call" : "text",
          contactId: e.ghlContactId,
        });
      }
    }

    out.sort((a, b) => b.at - a.at);

    // Was this person the FIRST to contact the lead, or following someone in?
    //
    // The decisive setter-versus-closer signal, and far more reliable than
    // volume. A setter opens conversations; a closer joins ones already in
    // progress to confirm a meeting or chase a no-show. Someone doing 600
    // touches who is almost never first is not setting, whatever the total says.
    //
    // Computed from the events already in hand rather than one query per lead —
    // the first version did the latter and timed out on operation count, which
    // is precisely the scale failure this rebuild exists to stop repeating.
    //
    // Only conversations that STARTED inside the window are counted, since a
    // lead first touched before it began would look falsely like this person
    // opened it.
    const firstByLead = new Map<string, { at: number; by: string | null }>();
    for (const e of allInWindow) {
      const seen = firstByLead.get(e.contactId);
      if (!seen || e.at < seen.at) firstByLead.set(e.contactId, { at: e.at, by: e.by });
    }
    let wasFirst = 0;
    let joinedLater = 0;
    for (const contactId of new Set(out.map((t) => t.contactId))) {
      const first = firstByLead.get(contactId);
      if (!first) continue;
      if (first.by === args.crmUserId) wasFirst += 1;
      else joinedLater += 1;
    }

    const sample = [];
    for (const t of out.slice(0, 12)) {
      const lead = await ctx.db
        .query("setterLeads")
        .withIndex("by_team_and_ghl_contact_id", (q: any) =>
          q.eq("teamId", args.teamId).eq("ghlContactId", t.contactId),
        )
        .first();
      sample.push({
        ...t,
        lead: lead ? (lead as any).name || (lead as any).phone || (lead as any).email : null,
      });
    }

    const days = [...perDay.entries()].sort();
    return {
      total: out.length,
      activeDays: days.length,
      // A per-day breakdown is the quickest sanity check available: a real
      // setter's volume varies with the working week, while a number inflated
      // by double-counting tends to look implausibly flat or implausibly high.
      busiestDay: days.sort((a, b) => b[1] - a[1])[0] ?? null,
      perDayAverage: days.length ? Math.round(out.length / days.length) : 0,
      leadsTouched: new Set(out.map((t: any) => t.contactId)).size,
      openedTheConversation: wasFirst,
      joinedExisting: joinedLater,
      sample,
    };
  },
});

/**
 * What distinguishes the leads one person works from another's.
 *
 * Gianni's account of RemoteStack: some leads are filtered as bad, setters skip
 * them entirely, and a closer works them instead. If that is true then those
 * leads are sitting in the denominator of every setter metric — a contact rate
 * of 49% is meaningless when half the leads were never meant to be contacted by
 * a setter.
 *
 * This looks for the attribute that actually separates the two populations, so
 * the split can be expressed as a rule rather than as an anecdote.
 */
export const compareLeadPopulations = internalQuery({
  args: {
    teamId: v.id("teams"),
    userA: v.string(),
    userB: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args): Promise<any> => {
    const leadsOf = new Map<string, Set<string>>([
      [args.userA, new Set()],
      [args.userB, new Set()],
    ]);

    for (const eventType of ["dial_outbound", "sms_outbound"]) {
      const rows = await ctx.db
        .query("setterLeadEvents")
        .withIndex("by_team_and_type_and_time", (q: any) =>
          q
            .eq("teamId", args.teamId)
            .eq("eventType", eventType)
            .gte("occurredAt", args.rangeStart)
            .lte("occurredAt", args.rangeEnd),
        )
        .take(12_000);
      for (const e of rows as any[]) {
        const set = leadsOf.get(e.ghlUserId);
        if (set) set.add(e.ghlContactId);
      }
    }

    // Read the leads once and bucket them, rather than a lookup per contact —
    // the per-lead version of this timed out on operation count earlier today.
    const allLeads = await ctx.db
      .query("setterLeads")
      .withIndex("by_team_and_date_added", (q: any) =>
        q
          .eq("teamId", args.teamId)
          .gte("dateAdded", args.rangeStart - 90 * 86_400_000)
          .lte("dateAdded", args.rangeEnd),
      )
      .take(12_000);

    const profile = (userId: string) => {
      const ids = leadsOf.get(userId)!;
      const tags: Record<string, number> = {};
      const sources: Record<string, number> = {};
      let n = 0;
      for (const l of allLeads as any[]) {
        if (!ids.has(l.ghlContactId)) continue;
        n += 1;
        for (const t of l.tags ?? []) tags[t] = (tags[t] ?? 0) + 1;
        const s = l.source || "(none)";
        sources[s] = (sources[s] ?? 0) + 1;
      }
      const top = (r: Record<string, number>) =>
        Object.entries(r)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([k, v]) => ({ value: k, count: v, pct: n ? Math.round((100 * v) / n) : 0 }));
      return { leads: n, topTags: top(tags), topSources: top(sources) };
    };

    return {
      a: profile(args.userA),
      b: profile(args.userB),
      overlap: [...leadsOf.get(args.userA)!].filter((id) =>
        leadsOf.get(args.userB)!.has(id),
      ).length,
    };
  },
});
