// ============================================================================
// The setter app's data surface. Every function takes a sessionToken and
// resolves WHO through setterAuth — never a client-supplied rosterId. A null
// session returns null/throws; the client redirects to login.
// ============================================================================

import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { resolveSetterSessionCtx } from "./setterAuth";
import { validateEodNumbers, buildEodDoc } from "./setterEodShared";

export const getSetterHome = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const me = await resolveSetterSessionCtx(ctx, args.sessionToken);
    if (!me) return null;

    const team = await ctx.db.get(me.teamId);
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;
    const today = dayKeyInTz(Date.now(), tz);

    const entry = await ctx.db
      .query("setterEodEntries")
      .withIndex("by_roster_and_day", (q) =>
        q.eq("rosterId", me.rosterId).eq("dayKey", today),
      )
      .first();

    return {
      name: me.name,
      pod: me.pod ?? null,
      teamName: (team as any)?.name ?? "your team",
      today,
      filedToday: !!entry,
      todayEntry: entry
        ? {
            dials: entry.dials,
            pickUps: entry.pickUps,
            sets: entry.sets,
            newLeadsHit: entry.newLeadsHit,
            followUps: entry.followUps,
            callsOnCalendar: entry.callsOnCalendar ?? null,
            callsShown: entry.callsShown ?? null,
            callsClosed: entry.callsClosed ?? null,
            note: entry.note ?? "",
            submittedAt: entry.submittedAt,
          }
        : null,
    };
  },
});

export const submitEod = mutation({
  args: {
    sessionToken: v.string(),
    dials: v.number(),
    pickUps: v.number(),
    sets: v.number(),
    newLeadsHit: v.number(),
    followUps: v.number(),
    callsOnCalendar: v.optional(v.number()),
    callsShown: v.optional(v.number()),
    callsClosed: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await resolveSetterSessionCtx(ctx, args.sessionToken);
    if (!me) throw new ConvexError("Signed out — log in again");

    validateEodNumbers(args);

    const team = await ctx.db.get(me.teamId);
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;
    const today = dayKeyInTz(Date.now(), tz);

    const existing = await ctx.db
      .query("setterEodEntries")
      .withIndex("by_roster_and_day", (q) =>
        q.eq("rosterId", me.rosterId).eq("dayKey", today),
      )
      .first();

    const doc = buildEodDoc(me.teamId, me.rosterId, today, args, args.note);
    if (existing) {
      await ctx.db.replace(existing._id, doc);
    } else {
      await ctx.db.insert("setterEodEntries", doc);
    }
    return { ok: true, dayKey: today };
  },
});
