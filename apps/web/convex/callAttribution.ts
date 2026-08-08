// ============================================================================
// Whose call was it?
//
// Auto-join books a bot from a calendar, and the calendar cannot answer this.
// Two rules were tested against real data and both were wrong more often than
// right: "who has it on their own calendar" fails because being INVITED puts a
// meeting in your diary, and "the subscription label" fails because teams book
// onto shared calendars named after one person — one customer's diary says
// Nick for calls that are Gianni's.
//
// The transcript can answer it. Recall tags every utterance with the speaker's
// name, so after the call we know which closer actually turned up and which of
// them did the talking. That is evidence rather than inference, and it costs
// one API call we are already making for speaker verification.
//
// Deliberately conservative. It only ever moves a call to another closer ON THE
// SAME TEAM, only when that closer clearly out-spoke the one it is assigned to,
// and never when a human has already touched the call. Moving a call moves
// someone's numbers, and a wrong move is worse than a wrong guess left alone.
// ============================================================================

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  fetchRecallTranscript,
  isLikelyBotName,
  tokenOverlap,
  type RecallTranscriptUtterance,
} from "./recallApi";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RosterCloser {
  closerId: string;
  name: string;
}

export interface AttributionResult {
  /** Null when nobody on the roster is recognisable in the transcript. */
  closerId: string | null;
  name?: string;
  /** Characters spoken by the winner, and by the runner-up. */
  chars: number;
  runnerUpChars: number;
  /** Every closer we could see, for explaining the decision. */
  spoke: Array<{ closerId: string; name: string; chars: number }>;
}

/**
 * How much did each closer on this team actually say?
 *
 * Volume, not presence. A manager sitting in on a call says a few words; the
 * person running it does most of the talking. Presence alone would hand the
 * call to whoever happened to drop in.
 */
export function attributeFromTranscript(
  transcript: RecallTranscriptUtterance[],
  roster: RosterCloser[],
  configuredBotName?: string,
): AttributionResult {
  const charsByCloser = new Map<string, number>();

  for (const utterance of transcript) {
    const speaker = (utterance.participant?.name ?? "").trim();
    if (!speaker) continue;
    if (isLikelyBotName(speaker, configuredBotName)) continue;

    const said = (utterance.words ?? []).reduce(
      (n, w) => n + (w.text?.length ?? 0),
      0,
    );
    if (said === 0) continue;

    // A participant can match at most one closer; first match wins, which is
    // stable because the roster order is stable.
    const owner = roster.find((c) => c.name && tokenOverlap(c.name, speaker));
    if (!owner) continue;

    charsByCloser.set(
      owner.closerId,
      (charsByCloser.get(owner.closerId) ?? 0) + said,
    );
  }

  const spoke = Array.from(charsByCloser.entries())
    .map(([closerId, chars]) => ({
      closerId,
      name: roster.find((c) => c.closerId === closerId)?.name ?? "",
      chars,
    }))
    .sort((a, b) => b.chars - a.chars);

  if (spoke.length === 0) {
    return { closerId: null, chars: 0, runnerUpChars: 0, spoke: [] };
  }

  return {
    closerId: spoke[0].closerId,
    name: spoke[0].name,
    chars: spoke[0].chars,
    runnerUpChars: spoke[1]?.chars ?? 0,
    spoke,
  };
}

/**
 * Is this confident enough to move someone's call?
 *
 * Two closers on a call is normal — a manager sits in, or a rep shadows. The
 * question is whether one of them was clearly running it. A narrow margin means
 * we don't know, and not knowing must leave the call where it is.
 */
export function isConfident(result: AttributionResult): boolean {
  if (!result.closerId) return false;
  // Enough was said to be a real contribution rather than a hello.
  if (result.chars < 400) return false;
  // And clearly more than anyone else on the team.
  return result.chars >= result.runnerUpChars * 2;
}

export const getAttributionContext = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, args): Promise<any> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;

    const bot = call.meetingBotId ? await ctx.db.get(call.meetingBotId) : null;
    const team = await ctx.db.get(call.teamId);

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", call.teamId))
      .collect();

    return {
      currentCloserId: String(call.closerId),
      recallBotId: bot?.recallBotId ?? null,
      botName: team?.meetingBotName ?? "Sequ3nce.ai",
      // A human's decision outranks ours; see reattributeCall.
      outcome: call.outcome ?? null,
      classifiedBy: call.classifiedBy ?? null,
      roster: closers
        .filter((c) => typeof c.name === "string" && c.name.length > 0)
        .map((c) => ({ closerId: String(c._id), name: c.name })),
    };
  },
});

export const applyAttribution = internalMutation({
  args: { callId: v.id("calls"), closerId: v.id("closers") },
  handler: async (ctx, args): Promise<{ moved: boolean }> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { moved: false };
    if (String(call.closerId) === String(args.closerId)) return { moved: false };

    const target = await ctx.db.get(args.closerId);
    // Never across teams. A call is one company's data.
    if (!target || String(target.teamId) !== String(call.teamId)) {
      return { moved: false };
    }

    await ctx.db.patch(args.callId, { closerId: args.closerId });

    // The stats sidecar carries closerId too, and a call that moved without it
    // would show under one closer on the board and another in the detail view.
    const stat = await ctx.db
      .query("callStats")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .first();
    if (stat) await ctx.db.patch(stat._id, { closerId: String(args.closerId) });

    return { moved: true };
  },
});

/**
 * Put the call on the right closer, after the fact.
 *
 * Refuses when a human has already engaged with the call — an outcome logged,
 * or a classification they set. At that point they have told us it's theirs,
 * and a background job must not disagree with a person.
 */
export const reattributeCall = internalAction({
  args: { callId: v.id("calls"), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<any> => {
    const ctxData = await ctx.runQuery(
      internal.callAttribution.getAttributionContext,
      { callId: args.callId },
    );
    if (!ctxData) return { ok: false, reason: "call not found" };
    if (!ctxData.recallBotId) return { ok: false, reason: "not a bot call" };
    if (ctxData.roster.length < 2) {
      return { ok: false, reason: "single-closer team, nothing to decide" };
    }
    if (ctxData.outcome || ctxData.classifiedBy === "closer") {
      return { ok: false, reason: "a human has already answered for this call" };
    }

    const transcript = await fetchRecallTranscript(ctxData.recallBotId);
    if (!transcript.ok) {
      return { ok: false, reason: `transcript unavailable: ${transcript.error}` };
    }

    const result = attributeFromTranscript(
      transcript.data,
      ctxData.roster,
      ctxData.botName,
    );

    const confident = isConfident(result);
    const wouldMove =
      confident && result.closerId !== ctxData.currentCloserId;

    if (!confident) {
      return { ok: true, moved: false, reason: "not confident", result };
    }
    if (!wouldMove) {
      return { ok: true, moved: false, reason: "already correct", result };
    }
    if (args.dryRun) {
      return { ok: true, moved: false, dryRun: true, wouldMove: true, result };
    }

    const applied = await ctx.runMutation(
      internal.callAttribution.applyAttribution,
      {
        callId: args.callId,
        closerId: result.closerId as Id<"closers">,
      },
    );
    return { ok: true, moved: applied.moved, result };
  },
});

/**
 * Would this have got it right on calls we already know the answer to?
 *
 * Every bot call created by a human clicking "Join & Record" carries a closer
 * who chose it — imperfect ground truth, but real. Running the rule over those
 * says whether it agrees with people before it is ever allowed to overrule the
 * calendar.
 *
 * Read-only. Changes nothing, whatever it finds.
 */
export const backtestAttribution = internalAction({
  args: { teamId: v.optional(v.id("teams")), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<any> => {
    const bots = await ctx.runQuery(internal.callAttribution.listBotsForBacktest, {
      ...(args.teamId ? { teamId: args.teamId } : {}),
      limit: args.limit ?? 30,
    });

    const rows: any[] = [];
    let agree = 0;
    let disagree = 0;
    let inconclusive = 0;

    for (const b of bots) {
      const transcript = await fetchRecallTranscript(b.recallBotId);
      if (!transcript.ok) {
        rows.push({ callId: b.callId, verdict: "no transcript" });
        inconclusive++;
        continue;
      }

      const result = attributeFromTranscript(
        transcript.data,
        b.roster,
        b.botName,
      );

      if (!isConfident(result)) {
        rows.push({
          callId: b.callId,
          assigned: b.assignedName,
          verdict: "not confident",
          spoke: result.spoke.map((s) => `${s.name}:${s.chars}`),
        });
        inconclusive++;
        continue;
      }

      const same = result.closerId === b.currentCloserId;
      if (same) agree++;
      else disagree++;

      rows.push({
        callId: b.callId,
        assigned: b.assignedName,
        chose: result.name,
        verdict: same ? "AGREES" : "DISAGREES",
        spoke: result.spoke.map((s) => `${s.name}:${s.chars}`),
      });
    }

    return {
      examined: bots.length,
      agree,
      disagree,
      inconclusive,
      agreementRate:
        agree + disagree > 0
          ? `${Math.round((agree / (agree + disagree)) * 100)}%`
          : "n/a",
      rows,
    };
  },
});

export const listBotsForBacktest = internalQuery({
  args: { teamId: v.optional(v.id("teams")), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<any[]> => {
    const bots = await ctx.db.query("meetingBots").order("desc").take(500);

    const rosterCache = new Map<string, RosterCloser[]>();
    const nameCache = new Map<string, string>();
    const out: any[] = [];

    for (const bot of bots) {
      if (out.length >= (args.limit ?? 30)) break;
      if (!bot.recallBotId || !bot.callId) continue;
      if (args.teamId && String(bot.teamId) !== String(args.teamId)) continue;

      const key = String(bot.teamId);
      if (!rosterCache.has(key)) {
        const closers = await ctx.db
          .query("closers")
          .withIndex("by_team", (q) => q.eq("teamId", bot.teamId))
          .collect();
        rosterCache.set(
          key,
          closers
            .filter((c) => typeof c.name === "string" && c.name.length > 0)
            .map((c) => ({ closerId: String(c._id), name: c.name })),
        );
        const team = await ctx.db.get(bot.teamId);
        nameCache.set(key, team?.meetingBotName ?? "Sequ3nce.ai");
      }
      const roster = rosterCache.get(key)!;
      // Nothing to decide on a one-person team.
      if (roster.length < 2) continue;

      const call = await ctx.db.get(bot.callId);
      if (!call) continue;

      out.push({
        callId: String(bot.callId),
        recallBotId: bot.recallBotId,
        currentCloserId: String(call.closerId),
        assignedName:
          roster.find((c) => c.closerId === String(call.closerId))?.name ?? "?",
        botName: nameCache.get(key),
        roster,
      });
    }

    return out;
  },
});
