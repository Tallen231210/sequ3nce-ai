import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
export const check = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId)).collect();
    const f = all.filter((c) => c.source === "fathom");
    return { total: f.length, newest: f.sort((a,b)=>b.createdAt-a.createdAt)[0]?.externalRecordingId };
  },
});
