// V8 supporting queries/mutations for hyrosReadActions.ts (which is "use
// node"). Split out so the Node action layer can call cheap DB ops here.

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { normalizeHyrosSource } from "./hyrosRead";

export const getTeamsWithHyrosEnabled = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("teams").collect();
    return all
      .filter((t) => t.hyrosEnabled === true && !!t.hyrosApiKey)
      .map((t) => ({ _id: t._id, hyrosApiKey: t.hyrosApiKey }));
  },
});

export const fetchPendingLeads = internalQuery({
  args: {
    teamId: v.id("teams"),
    limit: v.number(),
    bailoutBeforeMs: v.optional(v.number()), // legacy arg, no longer used
  },
  handler: async (ctx, args) => {
    // No age-based bailout — the pending→found/not_found state machine
    // is what prevents repolling. Backfilled historical leads have old
    // dateAdded values but should still be polled once.
    const pending = await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_hyros_status", (q: any) =>
        q.eq("teamId", args.teamId).eq("hyrosAttributionStatus", "pending"),
      )
      .take(args.limit);
    return pending
      .filter((l): l is Doc<"setterLeads"> & { email: string } => !!l.email)
      .map((l) => ({ id: l._id, email: l.email }));
  },
});

export const markPendingForBackfill = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    // Mark all leads without a status as pending so the poll cron picks
    // them up over time. Bounded — only marks the most recent 1000.
    const leads = await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date_added", (q: any) =>
        q.eq("teamId", args.teamId),
      )
      .order("desc")
      .take(1000);
    let marked = 0;
    for (const lead of leads) {
      if (lead.hyrosAttributionStatus !== undefined) continue;
      if (!lead.email) continue;
      await ctx.db.patch(lead._id, { hyrosAttributionStatus: "pending" });
      marked++;
    }
    return { marked };
  },
});

export const markLeadNotFound = internalMutation({
  args: { leadId: v.id("setterLeads") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.leadId, {
      hyrosAttributionStatus: "not_found",
      hyrosAttributionFetchedAt: Date.now(),
    });
  },
});

export const applyPolledAttribution = internalMutation({
  args: {
    leadId: v.id("setterLeads"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    firstSource: v.any(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastSource: v.any(),
  },
  handler: async (ctx, args) => {
    const firstNorm = normalizeHyrosSource(args.firstSource);
    const lastNorm = normalizeHyrosSource(args.lastSource);
    if (!firstNorm && !lastNorm) {
      await ctx.db.patch(args.leadId, {
        hyrosAttributionStatus: "not_found",
        hyrosAttributionFetchedAt: Date.now(),
      });
      return;
    }
    await ctx.db.patch(args.leadId, {
      ...(firstNorm ? { hyrosFirstSource: firstNorm } : {}),
      ...(lastNorm ? { hyrosLastSource: lastNorm } : {}),
      hyrosAttributionStatus: "found",
      hyrosAttributionFetchedAt: Date.now(),
    });
  },
});
