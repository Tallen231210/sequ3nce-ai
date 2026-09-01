// ============================================================================
// The EOD confirm strip — per-call confirmation for closers.
//
// The Numbers tab lists the closer's recent recorded calls with what the AI
// extracted, and the closer either confirms them or fixes them right there
// (edits go through callFacts.updateOwnCallFacts, the existing correction
// path). Confirmation is a provenance tier, not a data change: an untouched
// AI call can be human-CONFIRMED without becoming closer-SOURCED.
//
// Also home to "add a call we missed" — a real `calls` row with
// source:"manual", so the daily recount folds it into the measured layer
// instead of us keeping parallel books.
// ============================================================================

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { syncCallStats } from "./callStats";
import { scheduleCloserRecount } from "./closerPerformanceSweep";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { getLocalDateRangeUtc } from "./setterDataNotifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** How far back the strip reaches. Overnight payments and skipped days are
 *  normal; strictly-today would lose them. */
const CONFIRM_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** Same ceiling the per-call editors use — a typo shouldn't become a
 *  million-pound deal. */
const IMPLAUSIBLE_AMOUNT = 5_000_000;

/** Same list the post-call form accepts. */
const MANUAL_OUTCOMES = ["closed", "follow_up", "lost", "no_show"];

/** How far back a manual call may be dated (in team-local days). Older
 *  corrections belong in a conversation with the manager. */
const MANUAL_BACKDATE_DAYS = 7;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The closer's completed calls from the catch-up window, for the strip.
 * Internal — reached only through the session-authenticated HTTP route.
 */
export const getCallsToConfirm = internalQuery({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const since = Date.now() - CONFIRM_WINDOW_MS;
    // Over-fetch, THEN filter — taking 60 raw rows first would let failed
    // joins and non-counting stubs crowd today's real calls out of the strip
    // on bot-heavy teams. Manual no-shows carry status "no_show", so they
    // stay visible here too.
    const rows = await ctx.db
      .query("calls")
      .withIndex("by_closer_and_startedAt", (q: any) =>
        q.eq("closerId", args.closerId).gte("startedAt", since),
      )
      .take(400);
    const calls = rows
      .filter(
        (c) =>
          (c.status === "completed" || c.status === "no_show") &&
          c.countsTowardStats !== false,
      )
      .map((c) => ({
        _id: c._id,
        prospectName: c.prospectName ?? "Unknown prospect",
        startedAt: c.startedAt ?? c.createdAt,
        duration: c.duration ?? null,
        outcome: c.outcome ?? null,
        cashCollected: c.cashCollected ?? null,
        contractValue: c.contractValue ?? null,
        outcomeSource: c.outcomeSource ?? null,
        factsConfirmedAt: c.factsConfirmedAt ?? null,
      }))
      .sort((a, b) => a.startedAt - b.startedAt) // oldest first — clear those out
      .slice(-60); // and if somehow over 60 real calls, keep the newest
    return { calls };
  },
});

/**
 * "These figures are right." Stamps confirmation without touching the data,
 * so an AI-read call stays marked AI-read — just AI-read-and-checked.
 */
export const confirmOwnCallFacts = internalMutation({
  args: { closerId: v.id("closers"), callId: v.id("calls") },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { success: false, error: "That call no longer exists." };
    if (String(call.closerId) !== String(args.closerId)) {
      return { success: false, error: "That isn't your call." };
    }
    await ctx.db.patch(args.callId, { factsConfirmedAt: Date.now() });
    return { success: true };
  },
});

/**
 * A call the bot never saw, entered by hand. A real `calls` row so every
 * downstream reader — recount, Collections, call history — sees it without
 * special cases. Marked source:"manual" and closer-sourced/confirmed from
 * birth; extraction never touches it (no transcript exists).
 */
export const addManualCall = internalMutation({
  args: {
    closerId: v.id("closers"),
    prospectName: v.string(),
    /** Team-local YYYY-MM-DD. The server picks the instant — the browser's
     *  clock/timezone must not decide which team-local day a call lands on. */
    dayKey: v.string(),
    outcome: v.string(),
    cashCollected: v.optional(v.number()),
    contractValue: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; error?: string; callId?: Id<"calls"> }> => {
    // teamId comes from the closer record, never from the caller.
    const closer = await ctx.db.get(args.closerId);
    if (!closer) return { success: false, error: "Closer not found." };
    if ((closer as any).status === "deactivated") {
      return { success: false, error: "This closer is deactivated." };
    }

    const name = args.prospectName.trim();
    if (name.length < 1 || name.length > 120) {
      return { success: false, error: "Give the prospect a name (up to 120 characters)." };
    }
    if (!MANUAL_OUTCOMES.includes(args.outcome)) {
      return { success: false, error: "That isn't a valid outcome." };
    }
    if (!DAY_KEY_RE.test(args.dayKey)) {
      return { success: false, error: "That isn't a valid date." };
    }
    const now = Date.now();
    const team = await ctx.db.get((closer as any).teamId);
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;
    const todayKey = dayKeyInTz(now, tz);
    if (args.dayKey > todayKey) {
      return { success: false, error: "That call is in the future." };
    }
    if (args.dayKey < dayKeyInTz(now - MANUAL_BACKDATE_DAYS * 86_400_000, tz)) {
      return { success: false, error: "Calls older than a week need a manager." };
    }
    // Today: the call just happened. A past day: noon team-local — squarely
    // inside that day no matter where the closer's browser sits.
    const { startMs } = getLocalDateRangeUtc(args.dayKey, tz);
    const startedAt = args.dayKey === todayKey ? now : startMs + 12 * 3_600_000;
    for (const value of [args.cashCollected, args.contractValue]) {
      if (value === undefined) continue;
      if (!Number.isFinite(value) || value < 0) {
        return { success: false, error: "Amounts can't be negative." };
      }
      if (value > IMPLAUSIBLE_AMOUNT) {
        return { success: false, error: "That amount looks like a typo." };
      }
    }

    const callId = await ctx.db.insert("calls", {
      teamId: (closer as any).teamId,
      closerId: args.closerId,
      prospectName: name,
      // A no-show never happened as a conversation — the recount counts
      // every completed call as "taken", which would inflate Show% for a
      // prospect who was never there. status "no_show" keeps it out.
      status: args.outcome === "no_show" ? "no_show" : "completed",
      speakerCount: args.outcome === "no_show" ? 1 : 2,
      outcome: args.outcome,
      cashCollected:
        args.cashCollected === undefined ? undefined : Math.round(args.cashCollected),
      contractValue:
        args.contractValue === undefined ? undefined : Math.round(args.contractValue),
      source: "manual",
      classifiedAs: "sales",
      classifiedBy: "closer",
      countsTowardStats: true,
      outcomeSource: "closer",
      factsConfirmedAt: now,
      startedAt,
      completedAt: now,
      // The recount buckets days by createdAt (see calls.ts around
      // completeCallWithOutcome) — so a backdated call must carry the date
      // the call happened, not the date it was typed in.
      createdAt: startedAt,
    } as any);

    // Collections, closer stats and the board read the sidecar.
    await syncCallStats(ctx, callId);
    // Fold it into the measured daily layer within seconds, not at the next
    // hourly sweep.
    await scheduleCloserRecount(ctx, (closer as any).teamId, startedAt);

    return { success: true, callId };
  },
});
