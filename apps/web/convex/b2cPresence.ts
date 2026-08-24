import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

// Update lastSeenAt on the user — called every 60s from the client
export const heartbeat = mutation({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(args.userId, { lastSeenAt: Date.now() });
  },
});

// Returns IDs of users seen within the online threshold.
// NOTE: This performs a full table scan. If b2cUsers grows large (1000+),
// add an index on lastSeenAt and use .withIndex() to filter server-side.
export const getOnlineUserIds = query({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - ONLINE_THRESHOLD_MS;
    const users = await ctx.db.query("b2cUsers").collect();
    const onlineIds = users
      .filter((u) => u.lastSeenAt && u.lastSeenAt > cutoff && u.isTestAccount !== true)
      .map((u) => u._id);
    return { onlineIds };
  },
});
