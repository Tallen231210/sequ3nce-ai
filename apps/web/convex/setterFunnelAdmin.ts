// ============================================================================
// Setting a funnel up on a customer's behalf.
//
// The self-serve path is clerk-gated and records the manager who approved it,
// which is right — a definition should carry the name of whoever agreed to it.
// But the working reality is that we configure these with the customer rather
// than sending them into a form, so this exists to do it honestly: the funnel
// records that WE set it up, not that they approved something they never saw.
//
// Internal only. This changes what a live customer's numbers mean, so it should
// never be reachable from a browser.
// ============================================================================

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { validateBindings, validateBusinessHours } from "./setterFunnelTypes";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Create (or replace) a team's funnel and switch it on.
 *
 * Replaces rather than accumulates: running this twice for the same team
 * shouldn't leave a trail of half-finished drafts nobody can tell apart.
 */
export const setupFunnelForTeam = internalMutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
    bindings: v.any(),
    businessHours: v.optional(v.any()),
    summary: v.string(),
    setUpBy: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    const check = validateBindings(args.bindings);
    if (!check.ok) return { ok: false, errors: check.errors };
    const hours = validateBusinessHours(args.businessHours);
    if (!hours.ok) return { ok: false, errors: hours.errors };

    const existing = await ctx.db
      .query("setterFunnels")
      .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
      .collect();

    const now = Date.now();
    let funnelId: Id<"setterFunnels">;
    const prior = existing.find((f: Doc<"setterFunnels">) => f.name === args.name);

    if (prior) {
      await ctx.db.patch(prior._id, {
        bindings: args.bindings,
        businessHours: args.businessHours,
        summary: args.summary,
        version: prior.version + 1,
        active: true,
        approvedAt: now,
        approvedBy: args.setUpBy,
        updatedAt: now,
      });
      funnelId = prior._id;
    } else {
      funnelId = await ctx.db.insert("setterFunnels", {
        teamId: args.teamId,
        name: args.name,
        active: true,
        bindings: args.bindings,
        businessHours: args.businessHours,
        version: 1,
        summary: args.summary,
        approvedAt: now,
        approvedBy: args.setUpBy,
        createdAt: now,
        updatedAt: now,
      });
    }

    // One active funnel per team until lead routing exists; two would double
    // count every lead that matched both.
    for (const f of existing) {
      if (String(f._id) !== String(funnelId) && f.active) {
        await ctx.db.patch(f._id, { active: false });
      }
    }

    return { ok: true, funnelId: String(funnelId), warnings: check.warnings };
  },
});
