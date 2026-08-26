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
import { stripSetterToken } from "./lib/setterTitleMatch";
import { getContentForCallTx } from "./callContent";

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

// ============================================================================
// Calls You've Set — list, dismiss, detail. Every read verifies a match row
// for the session's rosterId; a setter can never load an arbitrary callId.
// ============================================================================

async function myMatchForCall(ctx: any, rosterId: string, callId: string) {
  const matches = await ctx.db
    .query("setterCallMatches")
    .withIndex("by_call", (q: any) => q.eq("callId", callId))
    .collect();
  return matches.find((m: any) => String(m.rosterId) === String(rosterId)) ?? null;
}

export const getMyCalls = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const me = await resolveSetterSessionCtx(ctx, args.sessionToken);
    if (!me) return null;

    const matches = await ctx.db
      .query("setterCallMatches")
      .withIndex("by_roster", (q) => q.eq("rosterId", me.rosterId))
      .order("desc")
      .take(200);

    const active: any[] = [];
    const dismissed: any[] = [];
    for (const m of matches) {
      const call = await ctx.db.get(m.callId);
      if (!call || call.status !== "completed") continue;
      const dismissal = await ctx.db
        .query("setterCallDismissals")
        .withIndex("by_roster_and_call", (q) =>
          q.eq("rosterId", me.rosterId).eq("callId", m.callId),
        )
        .first();
      const closer = await ctx.db.get(call.closerId);
      const row = {
        callId: m.callId,
        dateMs: (call as any).startedAt ?? call.createdAt,
        title: stripSetterToken((call as any).prospectName ?? "Call"),
        closerName: (closer as any)?.name ?? "—",
        durationSec: call.duration ?? null,
        outcome: call.outcome ?? null,
        classifiedAs: (call as any).classifiedAs ?? null,
        extractionFailed: (call as any).extractionFailed ?? null,
      };
      (dismissal ? dismissed : active).push(row);
    }
    return { active, dismissed };
  },
});

export const dismissCall = mutation({
  args: { sessionToken: v.string(), callId: v.id("calls"), undo: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const me = await resolveSetterSessionCtx(ctx, args.sessionToken);
    if (!me) throw new ConvexError("Signed out — log in again");
    const match = await myMatchForCall(ctx, String(me.rosterId), String(args.callId));
    if (!match) throw new ConvexError("That call isn't on your list");

    const existing = await ctx.db
      .query("setterCallDismissals")
      .withIndex("by_roster_and_call", (q) =>
        q.eq("rosterId", me.rosterId).eq("callId", args.callId),
      )
      .first();

    if (args.undo) {
      if (existing) await ctx.db.delete(existing._id);
    } else if (!existing) {
      await ctx.db.insert("setterCallDismissals", {
        rosterId: me.rosterId,
        callId: args.callId,
        createdAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

export const getMyCallDetail = query({
  args: { sessionToken: v.string(), callId: v.id("calls") },
  handler: async (ctx, args) => {
    const me = await resolveSetterSessionCtx(ctx, args.sessionToken);
    if (!me) return null;
    const match = await myMatchForCall(ctx, String(me.rosterId), String(args.callId));
    if (!match) return { forbidden: true as const };

    const call = await ctx.db.get(args.callId);
    if (!call) return null;
    const closer = await ctx.db.get(call.closerId);
    const content = await getContentForCallTx(ctx, args.callId);
    const ammo = await ctx.db
      .query("ammo")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
    const segments = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_call_and_time", (q) => q.eq("callId", args.callId))
      .collect();

    // Read-only by construction: the shape carries no ids the client could
    // feed into closer mutations, and no setter mutation writes call facts.
    return {
      title: stripSetterToken((call as any).prospectName ?? "Call"),
      closerName: (closer as any)?.name ?? "—",
      dateMs: (call as any).startedAt ?? call.createdAt,
      durationSec: call.duration ?? null,
      outcome: call.outcome ?? null,
      cashCollected: (call as any).cashCollected ?? null,
      contractValue: (call as any).contractValue ?? null,
      recordingUrl: (call as any).recordingUrl ?? null,
      externalShareUrl: (call as any).externalShareUrl ?? null,
      recordingType: (call as any).recordingType ?? null,
      summary: content?.summary ?? null,
      callAnalysis: content?.callAnalysis ?? null,
      transcriptText: content?.transcriptText ?? null,
      segments: segments.map((s: any) => ({
        speaker: s.speaker,
        text: s.text,
        timestamp: s.timestamp ?? null,
      })),
      ammo: ammo.map((a: any) => ({
        text: a.text,
        category: a.category ?? null,
        timestamp: a.timestamp ?? null,
      })),
    };
  },
});
