// Analytics Step 4 — Call Quality.
//
// The first AI-data-dependent section in the Analytics tab. Surfaces FACTUAL
// signals only (talk-ratio, discovery-signal hit rates, durations) — explicitly
// not the AI's JUDGMENT scores (`callContent.callAnalysis.analysis.opening`
// etc), which are gated to Step 6 behind an opt-in toggle, if ever.
//
// Per Tyler's design constraints (memory/analytics-tab-revamp-roadmap.md):
//   - Use AI data for FACTUAL signals only. Talk-ratio is from Deepgram
//     diarization. Discovery-signal flags are objective regex/LLM detections
//     on the transcript, with mention-count + quotes as evidence.
//   - Gate behind data-confidence indicator: "Based on N verified calls of M."
//   - Skip flagged calls in aggregations. The "flag" is the ABSENCE of
//     `meetingBots.speakerVerifiedAt` — when speaker verification didn't
//     run / didn't resolve, the closer/prospect attribution is unreliable
//     and the talk-time numbers might be backward.
//   - All factual signals live on the calls main table (~100 bytes/row)
//     not on `callContent` (~10 KB/row). 5k-call aggregations comfortable.

import { v } from "convex/values";
import { query } from "./_generated/server";
import { getDateRangeTimestamps, type DateRange } from "./lib/dateRanges";
import { computeCallQuality } from "./lib/callQualityAggregator";
import type { Doc, Id } from "./_generated/dataModel";

export const getCallQualitySummary = query({
  args: {
    teamId: v.id("teams"),
    dateRange: v.string(),
    closerId: v.optional(v.id("closers")),
    customStart: v.optional(v.number()),
    customEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { start, end } = getDateRangeTimestamps(
      args.dateRange as DateRange,
      args.customStart,
      args.customEnd,
    );

    let allCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", start).lte("createdAt", end),
      )
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    if (args.closerId) {
      allCalls = allCalls.filter((c) => c.closerId === args.closerId);
    }

    // Pre-resolve speaker-verification status for every call that has a
    // meeting bot. Doing this once up front so the aggregator's predicate is
    // synchronous (the aggregator is pure / shared with the rec query).
    const verifiedBotIds = new Set<string>();
    const botIdSet = new Set<Id<"meetingBots">>();
    for (const c of allCalls) {
      if (c.meetingBotId) botIdSet.add(c.meetingBotId);
    }
    for (const botId of botIdSet) {
      const bot = await ctx.db.get(botId);
      if (bot?.speakerVerifiedAt) verifiedBotIds.add(botId);
    }

    const isVerified = (call: Doc<"calls">) => {
      if (!call.meetingBotId) return true; // manual recording, no attribution risk
      return verifiedBotIds.has(call.meetingBotId);
    };

    return computeCallQuality(allCalls, isVerified);
  },
});
