import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================================================
// Demo-rep rotation for the ONE shared B2C demo account (reps@sequ3nce.ai).
//
// Sales reps come and go; the account stays. Rotating a rep = boot every
// device (session epoch), set a new password, and replace the demo calls with
// a fresh week of them. `reseed` alone refreshes the calls — the stats only
// look back 7 days, so the demo goes stale weekly.
//
// CLI-only. Refuses any account not flagged isTestAccount. It orchestrates
// the existing admin mutations, so every guard they carry still applies.
// Driven by the /rotate-demo-rep and /reseed-demo-rep commands.
// ============================================================================

type DemoOutcome = "closed" | "follow_up" | "lost" | "no_show";

/** One believable week for a closer: 12 calls, 6 closed, $26k cash. */
const DEMO_CALLS: ReadonlyArray<{
  name: string;
  daysAgo: number;
  outcome: DemoOutcome;
  cash?: number;
  contract?: number;
}> = [
  { name: "Daniela Ortiz", daysAgo: 6, outcome: "closed", cash: 4500, contract: 4500 },
  { name: "Kevin Marsh", daysAgo: 6, outcome: "follow_up" },
  { name: "Priya Natarajan", daysAgo: 5, outcome: "closed", cash: 2800, contract: 5600 },
  { name: "Tom Alvarez", daysAgo: 5, outcome: "lost" },
  { name: "Lena Fischer", daysAgo: 4, outcome: "closed", cash: 6000, contract: 6000 },
  { name: "Marcus Bell", daysAgo: 4, outcome: "no_show" },
  { name: "Sophie Grant", daysAgo: 3, outcome: "follow_up" },
  { name: "Jamal Whitfield", daysAgo: 3, outcome: "closed", cash: 3500, contract: 7000 },
  { name: "Rachel Kim", daysAgo: 2, outcome: "closed", cash: 5200, contract: 5200 },
  { name: "Owen Castellano", daysAgo: 2, outcome: "follow_up" },
  { name: "Nadia Hussain", daysAgo: 1, outcome: "closed", cash: 4000, contract: 8000 },
  { name: "Chris Delgado", daysAgo: 1, outcome: "lost" },
];

/** Bound on purge rounds (10 calls each) so a runaway account can't loop forever. */
const MAX_PURGE_ROUNDS = 50;

/**
 * YYYY-MM-DD for `daysAgo` days before `now`, in UTC. Never "today": the
 * closer's own timezone decides what today is, and UTC can run ahead of it,
 * which addManualCall would reject as a future date.
 */
export function demoDayKey(now: number, daysAgo: number): string {
  const backMs = Math.max(1, daysAgo) * 86_400_000;
  return new Date(now - backMs).toISOString().slice(0, 10);
}

export const getDemoAccount = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!user) return null;
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    return {
      userId: user._id,
      closerId: closer?._id ?? null,
      isTestAccount: user.isTestAccount === true,
    };
  },
});

type RotateResult = {
  mode: "rotate" | "reseed";
  /** The new epoch every other device is now behind (rotate only). */
  sessionEpoch: number | undefined;
  cleared: number;
  seeded: number;
  failed: string[];
};

export const rotateDemoAccount = internalAction({
  args: {
    email: v.string(),
    mode: v.union(v.literal("rotate"), v.literal("reseed")),
    newPassword: v.optional(v.string()),
  },
  // Explicit return type: this action references a query in its own module,
  // which otherwise makes TypeScript's inference loop back on itself.
  handler: async (ctx, args): Promise<RotateResult> => {
    const account = await ctx.runQuery(internal.b2cDemoRotation.getDemoAccount, {
      email: args.email,
    });
    if (!account) throw new Error("No such user");
    if (!account.isTestAccount) throw new Error("Refusing: not a test account");
    if (!account.closerId) throw new Error("Account has no closer row");
    if (args.mode === "rotate" && !args.newPassword) {
      throw new Error("rotate needs newPassword");
    }

    let sessionEpoch: number | undefined;
    if (args.mode === "rotate" && args.newPassword) {
      const bumped: { email: string; sessionEpoch: number } = await ctx.runMutation(
        internal.b2cSessionEpoch.bumpSessionEpoch,
        { email: args.email },
      );
      sessionEpoch = bumped.sessionEpoch;
      await ctx.runMutation(internal.b2cAdminAccounts.setTestAccountPassword, {
        email: args.email,
        password: args.newPassword,
      });
    }

    // Replace the demo calls. The purge tool works in small batches by design
    // (it sweeps every child table per call), so drive it until it reports
    // nothing left.
    let cleared = 0;
    for (let round = 0; round < MAX_PURGE_ROUNDS; round++) {
      const r: any = await ctx.runMutation(internal.b2cAdminPurge.purgeCallsBatch, {
        email: args.email,
        dryRun: false,
        batch: 10,
      });
      cleared += r.deleted ?? 0;
      if (!r.remaining) break;
    }

    const now = Date.now();
    const seeded: string[] = [];
    const failed: string[] = [];
    for (const c of DEMO_CALLS) {
      const r: any = await ctx.runMutation(internal.callConfirm.addManualCall, {
        closerId: account.closerId,
        prospectName: c.name,
        dayKey: demoDayKey(now, c.daysAgo),
        outcome: c.outcome,
        cashCollected: c.cash,
        contractValue: c.contract,
      });
      if (r?.success) seeded.push(c.name);
      else failed.push(`${c.name}: ${r?.error ?? "unknown error"}`);
    }
    await ctx.runMutation(internal.b2cAdminAccounts.polishDemoCalls, { email: args.email });

    return { mode: args.mode, sessionEpoch, cleared, seeded: seeded.length, failed };
  },
});
