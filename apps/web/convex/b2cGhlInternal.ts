import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// Non-node-runtime internals used by b2cGhl actions. Must live in a separate
// file from b2cGhl.ts because that file uses "use node" (action runtime) and
// Convex forbids queries/mutations in Node-runtime files.

export const getLead = internalQuery({
  args: { leadId: v.id("b2cLeads") },
  handler: async (ctx, args) => ctx.db.get(args.leadId),
});

export const getLeadByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("b2cLeads")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

export const markLeadSynced = internalMutation({
  args: {
    leadId: v.id("b2cLeads"),
    ghlContactId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.leadId, {
      ghlContactId: args.ghlContactId,
      ghlSyncStatus: "synced",
      ghlSyncedAt: Date.now(),
      ghlLastError: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const markLeadFailed = internalMutation({
  args: {
    leadId: v.id("b2cLeads"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.leadId, {
      ghlSyncStatus: "failed",
      ghlLastError: args.error.slice(0, 500),
      updatedAt: Date.now(),
    });
  },
});

export const listLeadsNeedingRetry = internalQuery({
  args: { staleBeforeMs: v.number() },
  handler: async (ctx, args) => {
    const failed = await ctx.db
      .query("b2cLeads")
      .withIndex("by_sync_status", (q) => q.eq("ghlSyncStatus", "failed"))
      .take(50);
    const pending = await ctx.db
      .query("b2cLeads")
      .withIndex("by_sync_status", (q) => q.eq("ghlSyncStatus", "pending"))
      .filter((q) => q.lt(q.field("updatedAt"), args.staleBeforeMs))
      .take(50);
    return [...failed, ...pending];
  },
});
