import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
export const check = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const t = (await ctx.db.get(args.teamId)) as Record<string, unknown> | null;
    if (!t) return { missing: true };
    return {
      name: t.name,
      stripeCustomerId: t.stripeCustomerId ?? null,
      stripeSubscriptionId: t.stripeSubscriptionId ?? null,
      subscriptionStatus: t.subscriptionStatus ?? null,
      plan: t.plan ?? null,
    };
  },
});
