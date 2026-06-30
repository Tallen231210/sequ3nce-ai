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
import {
  computeCallQuality,
  resolveVerifiedBotIds,
  makeIsVerified,
} from "./lib/callQualityAggregator";

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

    const verifiedBotIds = await resolveVerifiedBotIds(ctx, allCalls);
    return computeCallQuality(allCalls, makeIsVerified(verifiedBotIds));
  },
});
