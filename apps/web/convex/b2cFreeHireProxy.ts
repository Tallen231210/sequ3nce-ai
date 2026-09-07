import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const read = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("b2cFreeHireProxyCache")
      .withIndex("by_key", (query) => query.eq("key", args.key))
      .first();
  },
});

export const write = internalMutation({
  args: {
    key: v.string(),
    payload: v.string(),
    expiresAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("b2cFreeHireProxyCache")
      .withIndex("by_key", (query) => query.eq("key", args.key))
      .take(4);
    if (existing[0]) {
      await ctx.db.patch(existing[0]._id, args);
      // Convex indexes are not uniqueness constraints. Concurrent first-time
      // misses normally conflict and retry, but remove any duplicate cache rows
      // defensively so a historical race can never make reads ambiguous.
      await Promise.all(existing.slice(1).map((entry) => ctx.db.delete(entry._id)));
    } else {
      await ctx.db.insert("b2cFreeHireProxyCache", args);
    }

    // Bound cache growth opportunistically. Every miss removes a small batch;
    // this avoids a separate cron and never puts cleanup on the read path.
    const expired = await ctx.db
      .query("b2cFreeHireProxyCache")
      .withIndex("by_expiry", (query) => query.lt("expiresAt", args.updatedAt - 24 * 60 * 60 * 1000))
      .take(32);
    await Promise.all(expired.map((entry) => ctx.db.delete(entry._id)));
  },
});
