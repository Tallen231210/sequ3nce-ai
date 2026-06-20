// ============================================================================
// Team-level Setter Scorecard config — admin mutations for the playbook
// overlay (cadence A/B, dial target, set rate target, typical deal value
// override).
//
// These are also surfaced in getMySettings + the Settings UI tab.
// ============================================================================

import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

async function resolveAuthUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any; auth: { getUserIdentity: () => Promise<{ subject: string } | null> } },
  clerkId: string,
) {
  return await ctx.db
    .query("users")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId))
    .first();
}

export const updateScorecardConfig = mutation({
  args: {
    clerkId: v.string(),
    cadenceDefault: v.optional(v.string()),       // "A" | "B"
    dialsPerDayTarget: v.optional(v.number()),
    contactsPerDayTarget: v.optional(v.number()),
    setRateTarget: v.optional(v.number()),
    typicalDealValue: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new Error("Not authenticated");
    const teamId = user.teamId as Id<"teams">;

    const patch: Record<string, unknown> = {};
    if (args.cadenceDefault === "A" || args.cadenceDefault === "B") {
      patch.setterCadenceDefault = args.cadenceDefault;
    }
    if (args.dialsPerDayTarget !== undefined) {
      patch.setterDialsPerDayTarget = args.dialsPerDayTarget;
    }
    if (args.contactsPerDayTarget !== undefined) {
      patch.setterContactsPerDayTarget = args.contactsPerDayTarget;
    }
    if (args.setRateTarget !== undefined) {
      patch.setterSetRateTarget = args.setRateTarget;
    }
    if (args.typicalDealValue !== undefined) {
      patch.setterTypicalDealValue = args.typicalDealValue;
    }
    await ctx.db.patch(teamId, patch);
    return { ok: true };
  },
});
