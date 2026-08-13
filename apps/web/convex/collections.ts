// ============================================================================
// Outstanding balances — the money that was closed but never collected.
//
// The post-call form already records cash collected and contract value as two
// separate numbers, so the gap between them exists the moment a call is logged.
// Nothing has ever looked at it. A customer's own bottleneck analysis put it at
// $18K contracted and uncollected with, in their words, no collections cadence
// at all.
//
// This is a reminder, not an accounting system. We cannot see payments —
// customers take money through processors we have no connection to, often under
// names that never appear on the call board — so the balance is closed out by
// hand and the arrangement lives in a Slack thread where a human wrote it down.
//
// WHY THIS READS callStats AND NOT calls:
// a team-wide scan of `calls` is what caused the recurring 16 MiB read-limit
// crashes this codebase has already been bitten by twice. `callStats` is the
// sidecar built for exactly this — same money fields, ~80 bytes a row, indexed
// by team and date. We scan it to find the handful of calls that might have a
// balance, and only then read those few real rows.
// ============================================================================

import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * How far back a balance stays a collections problem.
 *
 * Six months. Past that it isn't being chased, it's being ignored, and a digest
 * that resurrects two-year-old debts every morning is one nobody reads. Anything
 * older should be written off, which is a decision a person makes rather than
 * something we quietly do for them by widening a window.
 */
export const BALANCE_WINDOW_DAYS = 180;

/**
 * Ceiling on how many candidate calls we resolve in one pass.
 *
 * Reached only by a team with hundreds of unsettled balances over six months,
 * which is itself the finding. We report `truncated` rather than trimming in
 * silence — a total that quietly understates what's owed is worse than no
 * total, because it looks authoritative.
 */
const MAX_CANDIDATES = 500;

/**
 * Ceiling on stats rows scanned per pass.
 *
 * Convex aborts a transaction at 32k documents scanned. Six months of calls is
 * comfortably under that for any real team — 20k is roughly a team taking a
 * hundred calls a day, every day, for six months — but an unbounded `.collect()`
 * is exactly the shape that has taken this dashboard down before, so it gets a
 * bound and a loud log rather than a crash on the day someone grows into it.
 */
const MAX_STATS_SCANNED = 20_000;

export type BalanceMode = "open" | "cleared";

export interface OutstandingBalance {
  callId: Id<"calls">;
  prospectName: string;
  closerName: string;
  closerId: string;
  cashCollected: number;
  contractValue: number;
  balance: number;
  /**
   * Where these figures came from: "ai" | "closer" | "manager", or null for
   * anything recorded before provenance existed (which was always a human).
   *
   * Carried through so a manager can tell a balance we READ from the recording
   * from one a person confirmed. On a payment plan those are very different
   * levels of confidence, and this list is the one that decides whether a
   * customer gets chased for money.
   */
  outcomeSource: string | null;
  /** When the deal was closed — what the ageing is measured from. */
  closedAt: number;
  ageDays: number;
  /** Set only on rows returned in "cleared" mode. */
  clearedAt?: number;
  clearedAs?: "settled" | "written_off";
  clearedBy?: string;
}

export interface OutstandingBalancesResult {
  balances: OutstandingBalance[];
  total: number;
  count: number;
  truncated: boolean;
}

/**
 * Does this call have money still owed on it?
 *
 * The one place the rule lives, so the digest and the in-app lists can never
 * disagree about what counts.
 *
 * Only `closed` calls carry money at all: the post-call form writes
 * cashCollected and contractValue solely on a close, and writes `dealValue`
 * (what was pitched, not what was agreed) on a loss or a follow-up. Treating a
 * pitched number as a debt would invent balances for deals that never happened.
 */
export function hasOutstandingBalance(row: {
  outcome?: string;
  cashCollected?: number;
  contractValue?: number;
}): boolean {
  if (row.outcome !== "closed") return false;
  const contract = row.contractValue ?? 0;
  const cash = row.cashCollected ?? 0;
  return contract > 0 && contract > cash;
}

/** Whole days elapsed, floored — "0 days" for something closed this morning. */
export function ageInDays(closedAt: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - closedAt) / 86_400_000));
}

/**
 * Resolve candidate stats rows into displayable balances.
 *
 * The settled/written-off flags live on `calls`, not on the sidecar, so this is
 * where we pay for the real rows — bounded by the number of candidates, not by
 * the team's call volume.
 */
async function resolveBalances(
  ctx: { db: any },
  candidates: Doc<"callStats">[],
  nowMs: number,
  /**
   * "open" is the digest and the chase lists. "cleared" is what makes clearing
   * reversible — a balance marked collected keeps every field it had, so undo
   * is only ever unsetting two of them, and the row has to be findable to be
   * undone.
   */
  mode: BalanceMode = "open",
  /** For "cleared": how far back to look. Ignored for "open". */
  clearedSinceMs = 0,
): Promise<OutstandingBalancesResult> {
  const truncated = candidates.length > MAX_CANDIDATES;
  const considered = truncated ? candidates.slice(0, MAX_CANDIDATES) : candidates;

  // One lookup per closer rather than one per call — a team of six closers with
  // ninety open balances would otherwise do ninety identical reads.
  const closerNames = new Map<string, string>();

  const balances: OutstandingBalance[] = [];
  for (const stat of considered) {
    const call = (await ctx.db.get(stat.callId)) as Doc<"calls"> | null;
    if (!call) continue;

    const settledAt = call.balanceSettledAt;
    const writtenOffAt = call.balanceWrittenOffAt;
    const clearedAt = settledAt ?? writtenOffAt;

    if (mode === "open") {
      // Already dealt with. Both outcomes remove it from every list; they stay
      // distinguishable in the data because "we got paid" and "we gave up" are
      // different facts about the business.
      if (clearedAt !== undefined) continue;
    } else {
      if (clearedAt === undefined) continue;
      if (clearedAt < clearedSinceMs) continue;
    }

    // Re-check against the call itself. The sidecar is reconciled on a cron, so
    // it can lag a correction by minutes — and chasing someone who has already
    // paid is the single worst thing this feature could do.
    if (!hasOutstandingBalance(call)) continue;

    const closerKey = String(call.closerId);
    if (!closerNames.has(closerKey)) {
      const closer = (await ctx.db.get(call.closerId)) as Doc<"closers"> | null;
      closerNames.set(closerKey, closer?.name ?? "Unknown closer");
    }

    const cash = call.cashCollected ?? 0;
    const contract = call.contractValue ?? 0;
    // completedAt is when the closer submitted the form; createdAt is when the
    // call row appeared. The debt starts at the close, so prefer the former.
    const closedAt = call.completedAt ?? call.createdAt;

    balances.push({
      callId: call._id,
      prospectName: call.prospectName?.trim() || "Unnamed prospect",
      closerName: closerNames.get(closerKey) ?? "Unknown closer",
      closerId: closerKey,
      outcomeSource: call.outcomeSource ?? null,
      cashCollected: cash,
      contractValue: contract,
      balance: contract - cash,
      closedAt,
      ageDays: ageInDays(closedAt, nowMs),
      ...(clearedAt !== undefined
        ? {
            clearedAt,
            clearedAs: settledAt !== undefined ? "settled" : "written_off",
            clearedBy: call.balanceSettledBy ?? call.balanceWrittenOffBy,
          }
        : {}),
    });
  }

  if (mode === "cleared") {
    // Most recently cleared first — an undo is nearly always undoing the thing
    // that just happened.
    balances.sort((a, b) => (b.clearedAt ?? 0) - (a.clearedAt ?? 0));
  } else {
    // Oldest first. A debt gets harder to collect the longer it sits, so the top
    // of the list should be the one most at risk, not the biggest number.
    balances.sort((a, b) => a.closedAt - b.closedAt);
  }

  return {
    balances,
    total: balances.reduce((sum, b) => sum + b.balance, 0),
    count: balances.length,
    truncated,
  };
}

/**
 * Everything a team is still owed.
 *
 * A plain function, not only a Convex query, so the digest preview can compose
 * the real message from the real data inside a single query rather than
 * reimplementing the scan — a preview that doesn't share a code path with the
 * thing it previews is worth very little.
 */
export async function collectTeamOutstanding(
  ctx: { db: any },
  teamId: Id<"teams">,
  nowMs: number,
): Promise<OutstandingBalancesResult> {
  const since = nowMs - BALANCE_WINDOW_DAYS * 86_400_000;

  const stats = await ctx.db
    .query("callStats")
    .withIndex("by_team_and_date", (q: any) =>
      q.eq("teamId", teamId).gte("createdAt", since),
    )
    .take(MAX_STATS_SCANNED);

  if (stats.length === MAX_STATS_SCANNED) {
    console.warn(
      `[collections] team ${teamId} hit the ${MAX_STATS_SCANNED}-row ` +
        `scan ceiling — balances older than the newest ${MAX_STATS_SCANNED} ` +
        `calls in the window are not being counted`,
    );
  }

  return resolveBalances(ctx, stats.filter(hasOutstandingBalance), nowMs);
}

/** Everything a team is still owed. Drives the digest and the manager list. */
export const getTeamOutstandingBalances = internalQuery({
  args: { teamId: v.id("teams"), nowMs: v.optional(v.number()) },
  handler: async (ctx, args): Promise<OutstandingBalancesResult> => {
    return collectTeamOutstanding(ctx, args.teamId, args.nowMs ?? Date.now());
  },
});

/**
 * How long a cleared balance stays undoable.
 *
 * Long enough that a mistake noticed at the end of the week can still be put
 * right, short enough that the list stays a list of recent decisions rather
 * than an archive.
 */
export const UNDO_WINDOW_DAYS = 30;

/** Balances cleared recently — the raw material for undo. */
export async function collectTeamCleared(
  ctx: { db: any },
  teamId: Id<"teams">,
  nowMs: number,
): Promise<OutstandingBalancesResult> {
  const since = nowMs - BALANCE_WINDOW_DAYS * 86_400_000;
  const stats = await ctx.db
    .query("callStats")
    .withIndex("by_team_and_date", (q: any) =>
      q.eq("teamId", teamId).gte("createdAt", since),
    )
    .take(MAX_STATS_SCANNED);

  return resolveBalances(
    ctx,
    stats.filter(hasOutstandingBalance),
    nowMs,
    "cleared",
    nowMs - UNDO_WINDOW_DAYS * 86_400_000,
  );
}

export const getTeamClearedBalances = internalQuery({
  args: { teamId: v.id("teams"), nowMs: v.optional(v.number()) },
  handler: async (ctx, args): Promise<OutstandingBalancesResult> => {
    return collectTeamCleared(ctx, args.teamId, args.nowMs ?? Date.now());
  },
});

/**
 * Put a cleared balance back.
 *
 * Exists because clearing is two clicks and a mis-tick is permanent otherwise.
 * The row keeps every field it had when it was cleared, so this is only ever
 * unsetting the four markers — there is no reconstruction and nothing to get
 * wrong.
 *
 * Idempotent: undoing something that isn't cleared is a no-op, not an error.
 */
export async function applyBalanceUndo(
  ctx: { db: any },
  callId: Id<"calls">,
): Promise<{ success: boolean; error?: string }> {
  const call = await ctx.db.get(callId);
  if (!call) return { success: false, error: "That call no longer exists." };

  if (
    call.balanceSettledAt === undefined &&
    call.balanceWrittenOffAt === undefined
  ) {
    return { success: true };
  }

  await ctx.db.patch(callId, {
    balanceSettledAt: undefined,
    balanceSettledBy: undefined,
    balanceWrittenOffAt: undefined,
    balanceWrittenOffBy: undefined,
  });
  return { success: true };
}

export const unresolveBalance = internalMutation({
  args: {
    callId: v.id("calls"),
    /** Set for a closer acting on their own call; absent for a manager. */
    closerId: v.optional(v.id("closers")),
    /** Set for a manager or a Slack action scoped to a team. */
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { success: false, error: "That call no longer exists." };

    if (args.closerId && String(call.closerId) !== String(args.closerId)) {
      return { success: false, error: "That isn't your call." };
    }
    if (args.teamId && String(call.teamId) !== String(args.teamId)) {
      return { success: false, error: "That call isn't on your team." };
    }
    if (!args.closerId && !args.teamId) {
      return { success: false, error: "No caller identity supplied." };
    }

    return applyBalanceUndo(ctx, args.callId);
  },
});

/** One closer's own outstanding balances, for the queue in their app. */
export const getMyOutstandingBalances = internalQuery({
  args: { closerId: v.id("closers"), nowMs: v.optional(v.number()) },
  handler: async (ctx, args): Promise<OutstandingBalancesResult> => {
    const now = args.nowMs ?? Date.now();
    const since = now - BALANCE_WINDOW_DAYS * 86_400_000;

    const stats = await ctx.db
      .query("callStats")
      .withIndex("by_closer_and_date", (q) =>
        q.eq("closerId", String(args.closerId)).gte("createdAt", since),
      )
      .take(MAX_STATS_SCANNED);

    return resolveBalances(ctx, stats.filter(hasOutstandingBalance), now);
  },
});

/**
 * Close out a balance, one way or the other.
 *
 * `settled` means the money arrived. `written_off` means it isn't going to, and
 * exists so an uncollectable debt can leave the list without being dressed up
 * as a win. Without the second option a hopeless balance nags every morning
 * until people stop reading the channel, which costs us the collectable ones
 * too.
 *
 * Idempotent: marking something twice is a no-op rather than an error, because
 * the closer's app and the manager dashboard can both be looking at the same
 * row and a double-click shouldn't produce a failure.
 */
export const resolveBalance = internalMutation({
  args: {
    callId: v.id("calls"),
    resolution: v.union(v.literal("settled"), v.literal("written_off")),
    /** Who did it — a closer id or a user id, stored as a string for display. */
    actorId: v.string(),
    /** Set for a closer acting on their own call; absent for a manager. */
    closerId: v.optional(v.id("closers")),
    /** Set for a manager acting on their team's call. */
    teamId: v.optional(v.id("teams")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; error?: string }> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { success: false, error: "That call no longer exists." };

    // Yours to resolve, not anyone's. A closer clearing someone else's balance
    // would let one person quietly erase money owed to the business.
    if (args.closerId && String(call.closerId) !== String(args.closerId)) {
      return { success: false, error: "That isn't your call." };
    }
    if (args.teamId && String(call.teamId) !== String(args.teamId)) {
      return { success: false, error: "That call isn't on your team." };
    }
    if (!args.closerId && !args.teamId) {
      return { success: false, error: "No caller identity supplied." };
    }

    return applyBalanceResolution(ctx, args.callId, args.resolution, args.actorId);
  },
});

/**
 * Stamp the resolution onto the call.
 *
 * Shared by the closer's app and the manager dashboard, which authorise very
 * differently — one checks the call is yours, the other that it's your team's
 * and that you're a manager — but must write identically. Two copies of this
 * would be two chances to record a collection one way here and another way
 * there.
 *
 * Idempotent: marking something twice is a no-op rather than an error, because
 * both surfaces can be looking at the same row and whoever gets there second
 * shouldn't see a failure.
 */
export async function applyBalanceResolution(
  ctx: { db: any },
  callId: Id<"calls">,
  resolution: "settled" | "written_off",
  actorId: string,
): Promise<{ success: boolean; error?: string }> {
  const call = await ctx.db.get(callId);
  if (!call) return { success: false, error: "That call no longer exists." };

  if (
    call.balanceSettledAt !== undefined ||
    call.balanceWrittenOffAt !== undefined
  ) {
    return { success: true };
  }

  const now = Date.now();
  await ctx.db.patch(
    callId,
    resolution === "settled"
      ? { balanceSettledAt: now, balanceSettledBy: actorId }
      : { balanceWrittenOffAt: now, balanceWrittenOffBy: actorId },
  );

  return { success: true };
}
