// Post-call speaker verification using Recall.ai's participant list as
// ground truth. Catches two failure modes:
//
//   1. Pin landed on the wrong participant (closerParticipantId points at
//      the prospect — happened when the "first non-host" heuristic fired
//      on a Zoom call where is_host was misreported).
//   2. Pin never fired (closerParticipantId null) AND the live segments
//      were labeled wrong because closerIsHost was missing on legacy bots.
//
// Recall stores per-word participant.id in its transcript endpoint even
// when our own segment-level labels are stale. Fetching from there lets us
// authoritatively relabel without LLM guesswork or human review.
//
// The verifier is fire-and-forget on call completion; it also doubles as
// the engine for one-shot backfills against historical calls.

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  fetchRecallTranscript,
  isLikelyBotName,
  rosterFromTranscript,
  tokenOverlap,
  type RecallParticipantSummary,
  type RecallTranscriptUtterance,
} from "./recallApi";

// Result envelope — returned by the top-level action so callers (the
// completion hook, the backfill runner) can log what happened.
export type VerifyResult = {
  ok: boolean;
  reason:
    | "verified_no_change"
    | "repinned_and_relabeled"
    | "filled_missing_pin_and_relabeled"
    | "skipped_already_verified"
    | "skipped_no_recall_bot_id"
    | "skipped_no_closer_name"
    | "skipped_no_participants"
    | "skipped_no_closer_match"
    | "skipped_recall_error"
    | "skipped_no_call_link";
  detail?: string;
  closerParticipantId?: number | string | null;
};

interface BotForVerify {
  _id: Id<"meetingBots">;
  recallBotId?: string;
  callId?: Id<"calls">;
  teamId: Id<"teams">;
  closerName?: string;
  closerParticipantId?: number | string;
  closerIsHost?: boolean;
  speakerVerifiedAt?: number;
  source?: string;
}

export const getBotForVerify = internalQuery({
  args: { botId: v.id("meetingBots") },
  handler: async (ctx, args): Promise<BotForVerify | null> => {
    const bot = await ctx.db.get(args.botId);
    if (!bot) return null;
    return {
      _id: bot._id,
      recallBotId: (bot as any).recallBotId,
      callId: (bot as any).callId,
      teamId: bot.teamId,
      closerName: (bot as any).closerName,
      closerParticipantId: (bot as any).closerParticipantId,
      closerIsHost: (bot as any).closerIsHost,
      speakerVerifiedAt: (bot as any).speakerVerifiedAt,
      source: (bot as any).source,
    };
  },
});

// A bot can be linked to more than one calls row — `bot.callId` only holds
// the most recently linked one, but older calls may still reference the bot
// via `calls.meetingBotId`. The verifier rewrites segments for every call
// pointing at this bot so we don't leave stale labels behind. Cheap because
// the index is selective.
export const getAllCallsLinkedToBot = internalQuery({
  args: { botId: v.id("meetingBots") },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("calls")
      .filter((q) => q.eq(q.field("meetingBotId"), args.botId))
      .collect();
    return calls.map((c) => ({ _id: c._id, teamId: c.teamId }));
  },
});

export const stampSpeakerVerified = internalMutation({
  args: { botId: v.id("meetingBots"), when: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.botId, { speakerVerifiedAt: args.when });
  },
});

export const setCloserParticipantId = internalMutation({
  args: {
    botId: v.id("meetingBots"),
    closerParticipantId: v.union(v.number(), v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.botId, {
      closerParticipantId: args.closerParticipantId,
    });
  },
});

// Atomic segment rewrite. Deletes all existing segments for the call,
// inserts the corrected ones, and updates the call's talk times — all in
// one mutation so the UI never sees a partial state. Recall transcripts
// for a 40-min call run ~300-700 segments, well under Convex's per-mutation
// document write budget.
export const rewriteCallSegments = internalMutation({
  args: {
    callId: v.id("calls"),
    teamId: v.id("teams"),
    segments: v.array(
      v.object({
        speaker: v.string(),
        text: v.string(),
        timestamp: v.number(),
      }),
    ),
    closerTalkTime: v.number(),
    prospectTalkTime: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
    for (const seg of existing) {
      await ctx.db.delete(seg._id);
    }
    const now = Date.now();
    for (const seg of args.segments) {
      await ctx.db.insert("transcriptSegments", {
        callId: args.callId,
        teamId: args.teamId,
        speaker: seg.speaker,
        text: seg.text,
        timestamp: seg.timestamp,
        createdAt: now,
      });
    }
    // Patch talk times directly (NOT through updateTalkTimeInternal — that one
    // has a guard against overwriting non-suspicious values; we're applying
    // authoritative truth and want the patch to land unconditionally).
    await ctx.db.patch(args.callId, {
      closerTalkTime: args.closerTalkTime,
      prospectTalkTime: args.prospectTalkTime,
    });
  },
});

// Picks the closer's participant.id from Recall's participant list.
//
// Algorithm:
//   1. Skip the bot itself (name pattern match against configured bot name)
//   2. Score remaining participants by:
//      - Name overlap with bot.closerName (token match)
//      - is_host alignment with bot.closerIsHost (when both present)
//      - joined_at order tie-breaker (earliest first)
//   3. Return the highest-scoring match, or null if no participant matches
//      the closer name at all.
//
// Defensive: returns null instead of throwing on any malformed participant
// data. The caller treats null as "verifier inconclusive, leave call alone."
// The closer can appear in the participant list under multiple ids when they
// drop and rejoin the meeting — Zoom assigns a new participant.id per
// session. We return the FULL set of name-matching ids and treat all of
// them as "closer." For the pin field (which holds a single id), the
// caller picks the dominant id (most chars spoken).
//
// Why name match alone, not is_host: see Bug B in the investigation.
// is_host is unreliable on Zoom (free accounts, co-host scenarios, host
// transfer mid-call). Name match is the only durable signal.
function identifyCloserParticipantIds(
  participants: RecallParticipantSummary[],
  closerName: string,
  configuredBotName: string | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (!closerName) return ids;
  for (const p of participants) {
    if (isLikelyBotName(p.name ?? "", configuredBotName)) continue;
    if (tokenOverlap(closerName, p.name ?? "")) {
      ids.add(String(p.id));
    }
  }
  return ids;
}

function utteranceText(u: RecallTranscriptUtterance): string {
  return u.words.map((w) => w.text).join(" ").trim();
}

function utteranceStartSeconds(u: RecallTranscriptUtterance): number {
  const first = u.words[0];
  if (!first) return 0;
  const t = first.start_timestamp;
  if (typeof t === "number") return Math.floor(t);
  if (t && typeof t.relative === "number") return Math.floor(t.relative);
  return 0;
}

// Ensure the unused-import warning doesn't bite — kept for future helpers
// that may need to filter by name.
void isLikelyBotName;

// Top-level verifier action. Hooked from completeCallFromBot for new calls
// and from the one-shot backfill for historical ones.
//
// "Fire-and-forget" friendly: never throws on Recall errors, never fails
// the calling flow. Returns a result envelope that the caller logs.
export const verifyClosersByRecallApi = internalAction({
  args: {
    botId: v.id("meetingBots"),
    // When true, regenerate summary + analysis after relabel. Defaults true
    // for live completion (correct summary > token cost); backfill runner
    // passes true too. Available as an arg so a future bulk backfill could
    // opt out if scope ever grows past where re-AI is affordable.
    regenerateAi: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<VerifyResult> => {
    const bot = await ctx.runQuery(internal.speakerVerification.getBotForVerify, {
      botId: args.botId,
    });
    if (!bot) {
      return { ok: false, reason: "skipped_no_call_link", detail: "bot not found" };
    }
    if (bot.speakerVerifiedAt) {
      return { ok: true, reason: "skipped_already_verified" };
    }
    if (!bot.recallBotId) {
      return { ok: false, reason: "skipped_no_recall_bot_id" };
    }
    if (!bot.callId) {
      return { ok: false, reason: "skipped_no_call_link" };
    }
    if (!bot.closerName) {
      return { ok: false, reason: "skipped_no_closer_name" };
    }

    // Single fetch: Recall stores transcripts in S3 with per-utterance
    // participant.id + name + is_host. The roster is derivable from the
    // transcript itself — no separate participant-list endpoint exists.
    const transcript = await fetchRecallTranscript(bot.recallBotId);
    if (!transcript.ok) {
      return {
        ok: false,
        reason: "skipped_recall_error",
        detail: `transcript: ${transcript.error}`,
      };
    }
    const participants = rosterFromTranscript(transcript.data);
    if (participants.length === 0) {
      return { ok: false, reason: "skipped_no_participants" };
    }

    const team = await ctx.runQuery(internal.meetingBot.getTeamById, {
      teamId: bot.teamId,
    });
    const configuredBotName = (team as any)?.meetingBotName;

    const closerIds = identifyCloserParticipantIds(
      participants,
      bot.closerName,
      configuredBotName,
    );
    if (closerIds.size === 0) {
      return { ok: false, reason: "skipped_no_closer_match" };
    }

    // Per-id char counts → pick the dominant closer id for the pin field
    // (which only holds one), and segment-relabel using the full set.
    const charsByPid = new Map<string, number>();
    let closerChars = 0;
    let prospectChars = 0;
    const newSegments: Array<{
      speaker: string;
      text: string;
      timestamp: number;
    }> = [];
    for (const u of transcript.data) {
      const text = utteranceText(u);
      if (!text) continue;
      const pid = u.participant?.id !== undefined ? String(u.participant.id) : "";
      charsByPid.set(pid, (charsByPid.get(pid) ?? 0) + text.length);
      const speaker = closerIds.has(pid) ? "closer" : "prospect";
      if (speaker === "closer") closerChars += text.length;
      else prospectChars += text.length;
      newSegments.push({
        speaker,
        text,
        timestamp: utteranceStartSeconds(u),
      });
    }

    // Pick dominant closer id for the pin field
    let dominantCloserPid: number | string | null = null;
    let maxCloserChars = -1;
    for (const id of closerIds) {
      const c = charsByPid.get(id) ?? 0;
      if (c > maxCloserChars) {
        maxCloserChars = c;
        // Preserve original id type (number vs string) for the pin field
        const original = participants.find((p) => String(p.id) === id);
        dominantCloserPid = original ? original.id : id;
      }
    }
    if (dominantCloserPid === null) {
      return { ok: false, reason: "skipped_no_closer_match" };
    }
    const trueCloserPid = dominantCloserPid;

    // Compare against current state — if closer-chars share is within 3pp of
    // what the live segments already represent, treat as no-change to save
    // a segment rewrite. Otherwise the pin or earlier labeling was wrong
    // and we need to rewrite.
    const currentCloserTalk = (bot as any).closerTalkTime ?? 0;
    const currentProspectTalk = (bot as any).prospectTalkTime ?? 0;
    const liveTotal = currentCloserTalk + currentProspectTalk;
    const newTotalChars = closerChars + prospectChars;
    const newCloserShare = newTotalChars > 0 ? closerChars / newTotalChars : 0;
    const liveCloserShare = liveTotal > 0 ? currentCloserTalk / liveTotal : 0;
    const pinMatches =
      bot.closerParticipantId !== undefined &&
      String(bot.closerParticipantId) === String(trueCloserPid);
    const sharesClose = Math.abs(newCloserShare - liveCloserShare) < 0.03;

    if (pinMatches && sharesClose && closerIds.size === 1) {
      await ctx.runMutation(internal.speakerVerification.stampSpeakerVerified, {
        botId: args.botId,
        when: Date.now(),
      });
      return {
        ok: true,
        reason: "verified_no_change",
        closerParticipantId: trueCloserPid,
      };
    }

    if (newSegments.length === 0) {
      return {
        ok: false,
        reason: "skipped_recall_error",
        detail: "transcript empty after parse",
      };
    }

    // Match the chars-per-second constant from meetingBot.retrySummaryGeneration
    // so all post-call talk-time recalculations agree.
    const newCloserTalkTime = Math.round(closerChars / 12.5);
    const newProspectTalkTime = Math.round(prospectChars / 12.5);

    // Pin first (so any concurrent webhook segments after this point inherit
    // the correct label via decideSpeaker Layer 1), then rewrite history.
    await ctx.runMutation(
      internal.speakerVerification.setCloserParticipantId,
      { botId: args.botId, closerParticipantId: trueCloserPid },
    );

    // Apply the rewrite to every call linked to this bot — handles the
    // one-bot-many-calls edge case (closer triggered the same bot for two
    // separate calls).
    const linkedCalls = await ctx.runQuery(
      internal.speakerVerification.getAllCallsLinkedToBot,
      { botId: args.botId },
    );
    const callsToRewrite =
      linkedCalls.length > 0
        ? linkedCalls
        : [{ _id: bot.callId, teamId: bot.teamId }];

    const flatTranscript = newSegments
      .map((s) => `${s.speaker === "closer" ? "Closer" : "Prospect"}: ${s.text}`)
      .join("\n");

    for (const linkedCall of callsToRewrite) {
      await ctx.runMutation(internal.speakerVerification.rewriteCallSegments, {
        callId: linkedCall._id,
        teamId: linkedCall.teamId,
        segments: newSegments,
        closerTalkTime: newCloserTalkTime,
        prospectTalkTime: newProspectTalkTime,
      });
      await ctx.runMutation(internal.calls.writeTranscriptText, {
        callId: linkedCall._id,
        transcriptText: flatTranscript,
      });
    }

    const reason =
      bot.closerParticipantId === undefined
        ? "filled_missing_pin_and_relabeled"
        : "repinned_and_relabeled";

    // Stamp before AI runs — verification is "done" once labels are right;
    // AI re-runs are a downstream chore.
    await ctx.runMutation(internal.speakerVerification.stampSpeakerVerified, {
      botId: args.botId,
      when: Date.now(),
    });

    if (args.regenerateAi !== false) {
      for (const linkedCall of callsToRewrite) {
        const call = await ctx.runQuery(
          internal.meetingBot.getCallByIdInternal,
          { callId: linkedCall._id },
        );
        if (!call) continue;
        try {
          await ctx.runAction(internal.ai.generateCallSummary, {
            callId: linkedCall._id,
            transcript: flatTranscript,
            outcome: (call as any).outcome || "unknown",
            prospectName: (call as any).prospectName || "Prospect",
          });
        } catch (err) {
          console.error(
            `[verifyClosersByRecallApi] Summary regen failed for call ${linkedCall._id}:`,
            err,
          );
        }
        try {
          await ctx.runAction(internal.ai.generateCallAnalysis, {
            callId: linkedCall._id,
            transcript: flatTranscript,
            outcome: (call as any).outcome || "unknown",
            prospectName: (call as any).prospectName || "Prospect",
            duration: (call as any).duration,
          });
        } catch (err) {
          console.error(
            `[verifyClosersByRecallApi] Analysis regen failed for call ${linkedCall._id}:`,
            err,
          );
        }
      }
    }

    return {
      ok: true,
      reason,
      closerParticipantId: trueCloserPid,
      detail:
        `${newSegments.length} segments relabeled, closer ${newCloserTalkTime}s vs prospect ${newProspectTalkTime}s` +
        (closerIds.size > 1 ? ` (closer had ${closerIds.size} participant ids)` : ""),
    };
  },
});
