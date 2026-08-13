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
// Two ways in, because there are two kinds of person with two kinds of
// knowledge. A manager sees a board that looks wrong and fixes it from the
// dashboard; a closer looks at their own call and knows what was actually
// agreed, which is knowledge nobody else has. They authenticate completely
// differently — `users` versus `closers` — so they get separate mutations with
// shared validation, rather than one mutation with a role branch.
// ============================================================================

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { syncCallStats } from "./callStats";

/* eslint-disable @typescript-eslint/no-explicit-any */

const OUTCOMES = ["closed", "lost", "no_show", "follow_up", "rescheduled"];

/** Shared shape so the manager and closer paths cannot validate differently. */
interface FactsInput {
  outcome?: string | null;
  cashCollected?: number | null;
  contractValue?: number | null;
}

/**
 * Turn a request into a patch, or explain why not.
 *
 * `null` clears a value, so someone can blank a figure the AI invented rather
 * than being forced to replace it with a different guess.
 */
function buildFactsPatch(
  args: FactsInput,
): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  const patch: Record<string, unknown> = {};

  if (args.outcome !== undefined) {
    if (args.outcome === null) {
      patch.outcome = undefined;
    } else if (!OUTCOMES.includes(args.outcome)) {
      return { ok: false, error: "That isn't a valid outcome." };
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
      return { ok: false, error: "Amounts can't be negative." };
    }
    if (value > IMPLAUSIBLE_AMOUNT) {
      return { ok: false, error: "That amount looks like a typo." };
    }
    patch[field] = Math.round(value);
  }

  return { ok: true, patch };
}

/**
 * Strip the parts of a patch that wouldn't change anything.
 *
 * Needed because "clear this field" is expressed as `undefined`, which is
 * indistinguishable from "field already absent" once it's in the patch — so an
 * editor submitted without a single edit still arrives as three instructions,
 * sails past a `length === 0` check, and stamps provenance on a call carrying no
 * data at all.
 *
 * That is worse than it sounds. Provenance is what tells the backfill a human
 * has been here, so one idle Save would remove a call from every future backfill
 * while leaving nothing behind to justify it — and nothing anywhere would say so.
 */
function dropNoOps(
  patch: Record<string, unknown>,
  call: Record<string, unknown>,
): Record<string, unknown> {
  const real: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const current = call[key] ?? undefined;
    if (value === current) continue;
    real[key] = value;
  }
  return real;
}

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

    const built = buildFactsPatch(args);
    if (!built.ok) return { success: false, error: built.error };
    const patch = dropNoOps(built.patch, call as unknown as Record<string, unknown>);

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

/**
 * A closer correcting one of their own calls.
 *
 * Separate from the manager path rather than a role check inside it, because
 * closers are a different table entirely — `closers`, not `users` — and folding
 * two identity models into one mutation is how a scoping bug gets written.
 * Validation is shared so the two can't drift.
 *
 * Scoped to the caller's own calls. Every other closer mutation in this file's
 * neighbourhood takes a callId and trusts it; this one checks that the call is
 * actually theirs, which costs one read and closes the obvious hole.
 *
 * Marks the call closer-confirmed. Same effect as filling in the form used to
 * have: extraction stops touching it, the AI marking disappears, and it counts
 * as human-confirmed toward outcome coverage.
 */
export const updateOwnCallFacts = mutation({
  args: {
    closerId: v.id("closers"),
    callId: v.id("calls"),
    outcome: v.optional(v.union(v.string(), v.null())),
    cashCollected: v.optional(v.union(v.number(), v.null())),
    contractValue: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { success: false, error: "That call no longer exists." };
    if (String(call.closerId) !== String(args.closerId)) {
      return { success: false, error: "That isn't your call." };
    }

    const built = buildFactsPatch(args);
    if (!built.ok) return { success: false, error: built.error };
    const patch = dropNoOps(built.patch, call as unknown as Record<string, unknown>);
    if (Object.keys(patch).length === 0) return { success: true };

    patch.outcomeSource = "closer";
    await ctx.db.patch(args.callId, patch);

    // Collections, closer stats and the team board read the sidecar, not this
    // row. Without this the correction is invisible everywhere it matters.
    await syncCallStats(ctx, args.callId);

    return { success: true };
  },
});
