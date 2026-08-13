// ============================================================================
// Correcting what a call says.
//
// Load-bearing, not insurance. The EOD form corrects DAILY TOTALS; Collections
// works PER CALL — "chase Rick Cremen for $4,800". So a closer can fix their day
// perfectly and a wrong per-call balance stays wrong forever, because the thing
// they corrected isn't the thing Collections reads.
//
// Which makes this the only place a mis-read payment plan can actually be put
// right.
//
// Manager-only, deliberately. The people fixing these are managers looking at a
// board that seems wrong, and a closer editing their own recorded numbers after
// the fact is a different feature with different consequences.
// ============================================================================

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { syncCallStats } from "./callStats";

/* eslint-disable @typescript-eslint/no-explicit-any */

const OUTCOMES = ["closed", "lost", "no_show", "follow_up", "rescheduled"];

/** Same ceiling extraction uses — a typo shouldn't become a million-pound deal. */
const IMPLAUSIBLE_AMOUNT = 5_000_000;

function canEdit(user: Doc<"users">): boolean {
  return user.role === "admin" || user.role === "manager";
}

/**
 * Set the outcome and money on one call.
 *
 * Every field is optional and `null` clears it, so a manager can blank a figure
 * the AI invented rather than being forced to replace it with another guess.
 *
 * Marks the call as manager-confirmed, which does three things: it stops
 * extraction ever touching it again, it removes the "AI-derived" marking from
 * every surface, and it counts toward outcome coverage as human-confirmed.
 */
export const updateCallFacts = mutation({
  args: {
    clerkId: v.string(),
    callId: v.id("calls"),
    outcome: v.optional(v.union(v.string(), v.null())),
    cashCollected: v.optional(v.union(v.number(), v.null())),
    contractValue: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return { success: false, error: "Not authorised." };
    if (!canEdit(user)) {
      return { success: false, error: "Only managers can change a call's numbers." };
    }

    const call = await ctx.db.get(args.callId);
    if (!call) return { success: false, error: "That call no longer exists." };
    // Scoped server-side from the caller's own identity — the client never
    // supplies a team, so a call id from another team is refused.
    if (String(call.teamId) !== String(user.teamId as Id<"teams">)) {
      return { success: false, error: "That call isn't on your team." };
    }

    const patch: Record<string, unknown> = {};

    if (args.outcome !== undefined) {
      if (args.outcome === null) {
        patch.outcome = undefined;
      } else if (!OUTCOMES.includes(args.outcome)) {
        return { success: false, error: "That isn't a valid outcome." };
      } else {
        patch.outcome = args.outcome;
      }
    }

    for (const field of ["cashCollected", "contractValue"] as const) {
      const value = args[field];
      if (value === undefined) continue;
      if (value === null) {
        patch[field] = undefined;
        continue;
      }
      if (!Number.isFinite(value) || value < 0) {
        return { success: false, error: "Amounts can't be negative." };
      }
      if (value > IMPLAUSIBLE_AMOUNT) {
        return { success: false, error: "That amount looks like a typo." };
      }
      patch[field] = Math.round(value);
    }

    if (Object.keys(patch).length === 0) return { success: true };

    // Deliberately NOT enforcing cash <= contract here. That guard exists to
    // stop the MODEL misreading a payment plan; a manager correcting a figure
    // may legitimately know something the call didn't say, and refusing their
    // input because it fails our heuristic would be the tool arguing with the
    // person it exists to serve.
    patch.outcomeSource = "manager";
    await ctx.db.patch(args.callId, patch);

    // Collections, closer stats and the board read the sidecar, not this row.
    await syncCallStats(ctx, args.callId);

    return { success: true };
  },
});
