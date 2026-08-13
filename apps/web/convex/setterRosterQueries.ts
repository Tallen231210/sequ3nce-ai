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

/** Distinct meeting titles and URLs, to see whether booking links differ. */
export const bookingLinkShapes = internalQuery({
  args: { teamId: v.id("teams"), rangeStart: v.number(), rangeEnd: v.number() },
  handler: async (ctx, args): Promise<any> => {
    const rows = await ctx.db
      .query("calendarEvents")
      .withIndex("by_team_and_time", (q: any) =>
        q
          .eq("teamId", args.teamId)
          .gte("startTime", args.rangeStart)
          .lt("startTime", args.rangeEnd),
      )
      .take(4000);

    const titles: Record<string, number> = {};
    const hosts: Record<string, number> = {};
    for (const e of rows as any[]) {
      // Strip the prospect's name so booking types collapse together —
      // "Strategy Call - Jane" and "Strategy Call - Bob" are one link.
      const t = String(e.title ?? "(none)")
        .replace(/\s*[-–|]\s*.*$/, "")
        .trim()
        .slice(0, 60);
      titles[t] = (titles[t] ?? 0) + 1;
      const url = String(e.meetingUrl ?? "");
      const host = url ? (url.split("/")[2] ?? "(none)") : "(no url)";
      hosts[host] = (hosts[host] ?? 0) + 1;
    }
    const top = (r: Record<string, number>) =>
      Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 12);
    return { events: rows.length, titles: top(titles), hosts: top(hosts) };
  },
});

/** Do the event descriptions carry booking-form metadata we could key on? */
export const bookingDescriptionSample = internalQuery({
  args: { teamId: v.id("teams"), rangeStart: v.number(), rangeEnd: v.number() },
  handler: async (ctx, args): Promise<any> => {
    const rows = await ctx.db
      .query("calendarEvents")
      .withIndex("by_team_and_time", (q: any) =>
        q.eq("teamId", args.teamId).gte("startTime", args.rangeStart).lt("startTime", args.rangeEnd),
      )
      .take(2000);
    const withDesc = (rows as any[]).filter(
      (e) => e.description && String(e.description).length > 40,
    );
    return {
      total: rows.length,
      withDescription: withDesc.length,
      samples: withDesc.slice(0, 4).map((e) => ({
        title: e.title,
        description: String(e.description).slice(0, 400),
      })),
    };
  },
});

/**
 * The booking types a team actually uses, read out of the event description.
 *
 * RemoteStack routes leads to DIFFERENT booking links depending on how they
 * answer the qualifying questions on their form — good answers get one link,
 * poor answers another. That routing is the "bad lead" flag their setters work
 * around, and it is invisible in tags, source and lead fields.
 *
 * It is not invisible in the calendar. Whatever creates the event writes
 * "Event Name" into the description, and the different links carry different
 * names. So the distinction we could not find anywhere else has been sitting in
 * a field we sync and never read.
 */
export const bookingTypes = internalQuery({
  args: { teamId: v.id("teams"), rangeStart: v.number(), rangeEnd: v.number() },
  handler: async (ctx, args): Promise<any> => {
    const rows = await ctx.db
      .query("calendarEvents")
      .withIndex("by_team_and_time", (q: any) =>
        q.eq("teamId", args.teamId).gte("startTime", args.rangeStart).lt("startTime", args.rangeEnd),
      )
      .take(4000);

    const byType: Record<string, { count: number; hosts: Record<string, number> }> = {};
    let noEventName = 0;
    for (const e of rows as any[]) {
      const desc = String(e.description ?? "");
      // "Event Name" then the type on the following line.
      const m = desc.match(/Event Name\s*[\r\n]+\s*(.+)/);
      if (!m) {
        noEventName += 1;
        continue;
      }
      const type = m[1].trim().slice(0, 70);
      const row = (byType[type] ??= { count: 0, hosts: {} });
      row.count += 1;
      // Who the meeting is with, which is how we can tell whether a booking
      // type belongs to the closers or the setters.
      const withWhom = String(e.title ?? "").split(/ and /i).pop()?.trim() ?? "?";
      row.hosts[withWhom] = (row.hosts[withWhom] ?? 0) + 1;
    }

    return {
      events: rows.length,
      withoutEventName: noEventName,
      types: Object.entries(byType)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 12)
        .map(([type, v]) => ({
          type,
          count: v.count,
          topHosts: Object.entries(v.hosts).sort((a, b) => b[1] - a[1]).slice(0, 3),
        })),
    };
  },
});

/**
 * Search every booking type across a window, newest first, without truncating.
 *
 * The first pass at this took 4,000 events off a start-time index, which
 * returns the OLDEST 4,000 — so a booking type introduced recently was invisible.
 * Gianni named a "T4" calendar that simply wasn't in the results, which is the
 * tell. Same mistake as the events read earlier today: a bounded take on an
 * ordered index is a sample, and which end of the range it samples matters.
 */
export const findBookingType = internalQuery({
  args: {
    teamId: v.id("teams"),
    rangeStart: v.number(),
    rangeEnd: v.number(),
    contains: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const byType: Record<string, number> = {};
    let scanned = 0;
    let matched = 0;
    const examples: any[] = [];

    // Page backwards from the end of the window so recent bookings are seen
    // first, and keep going rather than stopping at an arbitrary cap.
    let cursor = args.rangeEnd;
    for (let page = 0; page < 12; page++) {
      const rows = await ctx.db
        .query("calendarEvents")
        .withIndex("by_team_and_time", (q: any) =>
          q.eq("teamId", args.teamId).gte("startTime", args.rangeStart).lt("startTime", cursor),
        )
        .order("desc")
        .take(1000);
      if (rows.length === 0) break;
      scanned += rows.length;
      for (const e of rows as any[]) {
        const m = String(e.description ?? "").match(/Event Name\s*[\r\n]+\s*(.+)/);
        if (!m) continue;
        const type = m[1].trim().slice(0, 70);
        byType[type] = (byType[type] ?? 0) + 1;
        if (args.contains && type.toLowerCase().includes(args.contains.toLowerCase())) {
          matched += 1;
          if (examples.length < 5) {
            examples.push({ type, title: e.title, startTime: e.startTime });
          }
        }
      }
      cursor = (rows as any[])[rows.length - 1].startTime;
      if (rows.length < 1000) break;
    }

    return {
      scanned,
      matched,
      examples,
      types: Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 20),
    };
  },
});

/**
 * Does any lead attribute predict which booking link they were routed to?
 *
 * Gianni thinks there's no tag marking a bad lead but isn't certain, and
 * "probably not" is not an answer worth building on. This checks every tag and
 * source against the qualification implied by the booking type, so the answer
 * is measured rather than remembered.
 *
 * A tag that appears on 90% of Minus leads and 5% of Plus leads is the flag. A
 * tag that appears equally on both is noise. The point is to be able to say
 * which, with a number.
 */
export const qualificationSignals = internalQuery({
  args: { teamId: v.id("teams"), rangeStart: v.number(), rangeEnd: v.number() },
  handler: async (ctx, args): Promise<any> => {
    // Booking type per contact, paged backwards so recent bookings are included
    // — a forward take returns the oldest and hides anything new.
    const tierByContact = new Map<string, "plus" | "minus">();
    let cursor = args.rangeEnd;
    for (let page = 0; page < 12; page++) {
      const rows = await ctx.db
        .query("calendarEvents")
        .withIndex("by_team_and_time", (q: any) =>
          q.eq("teamId", args.teamId).gte("startTime", args.rangeStart).lt("startTime", cursor),
        )
        .order("desc")
        .take(1000);
      if (rows.length === 0) break;
      for (const e of rows as any[]) {
        const m = String(e.description ?? "").match(/Event Name\s*[\r\n]+\s*(.+)/);
        if (!m) continue;
        const type = m[1].trim();
        const tier = /minus/i.test(type) ? "minus" : /\+/.test(type) ? "plus" : null;
        if (!tier) continue;
        // Match the booking to a lead by the prospect name on the event.
        const who = String(e.title ?? "").split(/ and /i)[0].trim().toLowerCase();
        if (who) tierByContact.set(who, tier);
      }
      cursor = (rows as any[])[rows.length - 1].startTime;
      if (rows.length < 1000) break;
    }

    const leads = await ctx.db
      .query("setterLeads")
      .withIndex("by_team_and_date_added", (q: any) =>
        q.eq("teamId", args.teamId).gte("dateAdded", args.rangeStart).lte("dateAdded", args.rangeEnd),
      )
      .take(12_000);

    const counts: Record<string, { plus: number; minus: number }> = {};
    let plusTotal = 0;
    let minusTotal = 0;
    for (const l of leads as any[]) {
      const tier = tierByContact.get(String(l.name ?? "").toLowerCase());
      if (!tier) continue;
      if (tier === "plus") plusTotal += 1;
      else minusTotal += 1;
      const attrs = [
        ...(l.tags ?? []).map((t: string) => `tag:${t}`),
        `source:${l.source || "(none)"}`,
      ];
      for (const a of attrs) {
        const row = (counts[a] ??= { plus: 0, minus: 0 });
        row[tier] += 1;
      }
    }

    // Rank by how lopsided each attribute is. A real flag is near-exclusive to
    // one side; anything close to the base rate is telling us nothing.
    const signals = Object.entries(counts)
      .filter(([, v]) => v.plus + v.minus >= 5)
      .map(([attr, v]) => {
        const pPlus = plusTotal ? v.plus / plusTotal : 0;
        const pMinus = minusTotal ? v.minus / minusTotal : 0;
        return {
          attr,
          plus: v.plus,
          minus: v.minus,
          skew: Math.abs(pPlus - pMinus),
        };
      })
      .sort((a, b) => b.skew - a.skew)
      .slice(0, 15);

    return { matchedLeads: plusTotal + minusTotal, plusTotal, minusTotal, signals };
  },
});
