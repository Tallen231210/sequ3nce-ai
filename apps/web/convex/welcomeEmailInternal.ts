// V8 helpers for the welcome-email flow. Lives in a sibling file because
// queries + mutations can't live in welcomeEmail.ts ("use node" / Node
// runtime is action-only). Same V8/Node split pattern as adSpend.ts +
// adSpendInternal.ts.

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export const getTeamForWelcome = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    welcomeEmailSentAt: number | undefined;
    name: string;
  } | null> => {
    const team = (await ctx.db.get(args.teamId)) as Doc<"teams"> | null;
    if (!team) return null;
    return {
      welcomeEmailSentAt: team.welcomeEmailSentAt,
      name: team.name,
    };
  },
});

export const findTeamByStripeCustomer = internalQuery({
  args: { stripeCustomerId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    teamId: Id<"teams">;
    welcomeEmailSentAt: number | undefined;
  } | null> => {
    const team = (await ctx.db
      .query("teams")
      .withIndex("by_stripe_customer", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId),
      )
      .first()) as Doc<"teams"> | null;
    if (!team) return null;
    return {
      teamId: team._id,
      welcomeEmailSentAt: team.welcomeEmailSentAt,
    };
  },
});

export const markWelcomeSent = internalMutation({
  args: { teamId: v.id("teams"), sentAt: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, { welcomeEmailSentAt: args.sentAt });
  },
});
