// ============================================================================
// Provisioning comped B2B teams by hand.
//
// Separate from founderAdmin.ts, which is read-only dashboard queries. These
// two mutations WRITE, and they write to live customer accounts, so they live
// where they can be read in one sitting.
//
// Why this exists: `founderAdmin.compTeamByEmail` flips a team to active but
// leaves `stripeCustomerId` in place — and every B2B Stripe webhook handler
// resolves teams BY that id. A past-due subscription retrying in the
// background will fire `invoice.payment_failed`, the webhook will find the
// team, and the comp is silently undone hours later. Clearing the Stripe link
// is not a tidiness detail; it's the difference between a comp that holds and
// one that expires on Stripe's dunning schedule.
//
// That's also what the schema means by "comped teams have no stripeCustomerId,
// so Stripe webhooks never touch it".
//
// Neither mutation touches Stripe itself. Cancelling the subscription there is
// a separate, deliberate step — see docs/COMPED-ACCOUNTS.md.
// ============================================================================

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const TIERS = ["overview", "oversight", "overwatch"] as const;
type Tier = (typeof TIERS)[number];

/** Seats are a per-closer charge, not a licence check — but a typo here shows
 *  up on an invoice, so it's bounded rather than trusted. */
const MAX_SEATS = 200;

function assertTier(tier: string): asserts tier is Tier {
  if (!(TIERS as readonly string[]).includes(tier)) {
    throw new Error(`Unknown tier "${tier}". Expected one of: ${TIERS.join(", ")}`);
  }
}

/**
 * The one manager row for an email address.
 *
 * Throws on more than one match rather than picking. Duplicate rows for the
 * same email are exactly the condition that makes reattach-by-email ambiguous
 * (`teams.ensureUserTeam` takes the OLDEST), so if one ever appears it needs a
 * human, not a silent choice.
 */
async function findSoleManager(
  ctx: MutationCtx,
  email: string,
): Promise<Doc<"users">> {
  const target = email.trim().toLowerCase();
  if (!target) throw new Error("Email is required");

  const all = await ctx.db.query("users").take(5000);
  const matches = all.filter((u) => (u.email || "").trim().toLowerCase() === target);

  if (matches.length === 0) {
    throw new Error(`No manager account found for ${target}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `${matches.length} manager rows share ${target} (${matches
        .map((m) => m._id)
        .join(", ")}). Resolve by hand — reattach-by-email would be ambiguous.`,
    );
  }
  return matches[0];
}

/** The fields that make a team comped, in one place so both paths agree. */
function compedTeamFields(tier: Tier, seatCount: number) {
  return {
    subscriptionStatus: "active",
    plan: "active",
    comped: true,
    // Both, deliberately. The override is what stops a processor event from
    // changing it; productTier is what the app actually reads.
    productTierOverride: tier,
    productTier: tier,
    seatCount,
    // No Stripe link — this is what keeps the webhook away.
    stripeCustomerId: undefined,
    stripeSubscriptionId: undefined,
    // No billing date. The billing page only renders "next billing date" when
    // this is set, and a comped team has no next billing date to show.
    currentPeriodEnd: undefined,
  };
}

/**
 * Comp a team the manager already owns, keeping every closer, call and
 * integration exactly where it is.
 *
 * Idempotent: re-running writes the same values.
 */
export const compTeamInPlace = internalMutation({
  args: {
    email: v.string(),
    tier: v.string(),
    seatCount: v.number(),
    /** Rename the team at the same time. Omit to leave the name alone. */
    teamName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertTier(args.tier);
    if (!Number.isInteger(args.seatCount) || args.seatCount < 0 || args.seatCount > MAX_SEATS) {
      throw new Error(`seatCount must be a whole number between 0 and ${MAX_SEATS}`);
    }

    const user = await findSoleManager(ctx, args.email);
    const team = await ctx.db.get(user.teamId);
    if (!team) throw new Error(`Team ${user.teamId} not found for ${args.email}`);

    const before = {
      name: team.name,
      subscriptionStatus: team.subscriptionStatus ?? null,
      productTier: team.productTier ?? null,
      seatCount: team.seatCount ?? null,
      stripeCustomerId: team.stripeCustomerId ?? null,
      stripeSubscriptionId: team.stripeSubscriptionId ?? null,
    };

    await ctx.db.patch(team._id, {
      ...compedTeamFields(args.tier, args.seatCount),
      ...(args.teamName?.trim() ? { name: args.teamName.trim() } : {}),
    });

    return {
      ok: true as const,
      teamId: team._id,
      before,
      after: {
        name: args.teamName?.trim() || team.name,
        tier: args.tier,
        seatCount: args.seatCount,
      },
    };
  },
});

/**
 * Point a manager's row at a new Clerk id — for moving between Clerk
 * instances.
 *
 * `teams.ensureUserTeam` would heal this on its own at next sign-in, by
 * matching the verified email. This does it up front instead, because the
 * self-healing path has one bad failure mode: if Clerk reports the email
 * unverified, bootstrap refuses to reattach and creates a fresh empty team
 * — leaving TWO rows for one email, which is the ambiguity `findSoleManager`
 * exists to catch. Setting the id in advance means sign-in takes the plain
 * "known Clerk id" branch and never reaches that decision.
 */
export const relinkManagerClerkId = internalMutation({
  args: {
    email: v.string(),
    newClerkId: v.string(),
    /** The team they must already be on. Guards against relinking the wrong person. */
    expectedTeamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const newClerkId = args.newClerkId.trim();
    if (!newClerkId) throw new Error("newClerkId is required");

    const user = await findSoleManager(ctx, args.email);
    if (user.teamId !== args.expectedTeamId) {
      throw new Error(
        `${args.email} is on team ${user.teamId}, not the expected ` +
          `${args.expectedTeamId}. Refusing.`,
      );
    }

    // A clerkId already in use by someone else would give two rows the same
    // identity, and `by_clerk_id` returns whichever comes first.
    const clash = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", newClerkId))
      .first();
    if (clash && clash._id !== user._id) {
      throw new Error(
        `Clerk id ${newClerkId} is already on user ${clash._id} (${clash.email}).`,
      );
    }

    const previousClerkId = user.clerkId;
    if (previousClerkId === newClerkId) {
      return { ok: true as const, changed: false, clerkId: newClerkId };
    }
    await ctx.db.patch(user._id, { clerkId: newClerkId });
    return {
      ok: true as const,
      changed: true,
      email: user.email,
      teamId: user.teamId,
      previousClerkId,
      clerkId: newClerkId,
    };
  },
});

/**
 * Give a manager a brand-new empty team and retire their old one.
 *
 * The manager's `users` row is REPOINTED rather than duplicated. That matters:
 * `teams.ensureUserTeam` reattaches an unknown Clerk id to the OLDEST row
 * matching a verified email, so a second row for the same address would
 * quietly drag them back to the retired team the next time their Clerk id
 * changes — which is precisely what the production-instance migration will do
 * in a few days. One row per email, always.
 *
 * The old team keeps its data. It just becomes unreachable and unbilled.
 */
export const provisionFreshTeam = internalMutation({
  args: {
    email: v.string(),
    teamName: v.string(),
    tier: v.string(),
    seatCount: v.number(),
    /**
     * The team the manager is expected to be on right now.
     *
     * A guard against running this twice. Without it a second run silently
     * creates a second empty team and retires the one we just built.
     */
    expectedCurrentTeamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    assertTier(args.tier);
    if (!Number.isInteger(args.seatCount) || args.seatCount < 0 || args.seatCount > MAX_SEATS) {
      throw new Error(`seatCount must be a whole number between 0 and ${MAX_SEATS}`);
    }
    const teamName = args.teamName.trim();
    if (!teamName || teamName.length > 100) {
      throw new Error("teamName must be 1-100 characters");
    }

    const user = await findSoleManager(ctx, args.email);
    if (user.teamId !== args.expectedCurrentTeamId) {
      throw new Error(
        `${args.email} is on team ${user.teamId}, not the expected ` +
          `${args.expectedCurrentTeamId}. Refusing — this has probably already run.`,
      );
    }

    const oldTeam = await ctx.db.get(user.teamId);
    if (!oldTeam) throw new Error(`Team ${user.teamId} not found`);

    // 1. The new home.
    const newTeamId = await ctx.db.insert("teams", {
      name: teamName,
      createdAt: Date.now(),
      ...compedTeamFields(args.tier, args.seatCount),
    });

    // 2. Retire the old one. Data stays; billing and access do not. Clearing
    //    the Stripe ids here too, so a late webhook for the cancelled
    //    subscription can't resurrect it as an "active" team in /admin.
    const stamp = new Date().toISOString().slice(0, 10);
    await ctx.db.patch(oldTeam._id, {
      name: `${oldTeam.name} (archived ${stamp})`,
      subscriptionStatus: "canceled",
      plan: "canceled",
      comped: undefined,
      stripeCustomerId: undefined,
      stripeSubscriptionId: undefined,
    });

    // 3. Closers on the retired team must not keep signing into it.
    const oldClosers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", oldTeam._id))
      .collect();
    for (const closer of oldClosers) {
      if (closer.status !== "deactivated") {
        await ctx.db.patch(closer._id, { status: "deactivated" });
      }
    }

    // 4. Move the manager across. Last, so a failure above leaves them where
    //    they were rather than pointing at a half-built team.
    await ctx.db.patch(user._id, { teamId: newTeamId });

    return {
      ok: true as const,
      newTeamId,
      newTeamName: teamName,
      tier: args.tier,
      seatCount: args.seatCount,
      archivedTeamId: oldTeam._id,
      archivedTeamName: `${oldTeam.name} (archived ${stamp})`,
      closersDeactivated: oldClosers.length,
    };
  },
});
