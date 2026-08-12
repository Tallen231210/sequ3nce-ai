import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";

// ============================================================================
// Admin account directory — powers the /admin impersonation picker.
//
// SECURITY: Convex queries are publicly callable by anyone who knows the
// deployment URL (it ships in the client bundle), so this MUST NOT be an
// ungated public query — it would hand out every customer's email. It's
// gated on ADMIN_SECRET (same pattern as the admin endpoints in http.ts),
// and only ever called server-side from /api/admin/* routes that are
// themselves behind the signed admin session. Two independent layers.
// ============================================================================

function assertAdmin(adminSecret: string) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || adminSecret !== secret) {
    throw new Error("Unauthorized");
  }
}

export interface AdminAccount {
  teamId: string;
  teamName: string;
  emails: string[];
  primaryClerkId: string | null;
  subscriptionStatus: string | null;
  plan: string | null;
  comped: boolean;
  closerCount: number;
}

export const listAccounts = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args): Promise<AdminAccount[]> => {
    assertAdmin(args.adminSecret);

    // Small tables (tens of rows) — bounded takes keep this safe regardless.
    const teams = await ctx.db.query("teams").take(1000);
    const users = await ctx.db.query("users").take(2000);
    const closers = await ctx.db.query("closers").take(3000);

    const usersByTeam = new Map<string, typeof users>();
    for (const u of users) {
      const key = String(u.teamId);
      const list = usersByTeam.get(key) ?? [];
      list.push(u);
      usersByTeam.set(key, list);
    }
    const closerCountByTeam = new Map<string, number>();
    for (const c of closers) {
      if (c.status === "deactivated") continue;
      const key = String(c.teamId);
      closerCountByTeam.set(key, (closerCountByTeam.get(key) ?? 0) + 1);
    }

    const accounts: AdminAccount[] = teams.map((t) => {
      const key = String(t._id);
      const teamUsers = usersByTeam.get(key) ?? [];
      return {
        teamId: key,
        teamName: t.name,
        emails: teamUsers.map((u) => u.email).filter(Boolean),
        // The manager we'd impersonate — first admin, else first user.
        primaryClerkId:
          (teamUsers.find((u) => u.role === "admin") ?? teamUsers[0])?.clerkId ??
          null,
        subscriptionStatus: t.subscriptionStatus ?? null,
        plan: t.plan ?? null,
        comped: t.comped === true,
        closerCount: closerCountByTeam.get(key) ?? 0,
      };
    });

    // Real, working accounts first: paying/active, then ones with closers,
    // then alphabetical — so live customers float above old test teams.
    const rank = (a: AdminAccount) => {
      const live =
        a.subscriptionStatus === "active" || a.subscriptionStatus === "trialing";
      if (live) return 0;
      if (a.closerCount > 0) return 1;
      return 2;
    };
    accounts.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        b.closerCount - a.closerCount ||
        a.teamName.localeCompare(b.teamName),
    );
    return accounts;
  },
});

/**
 * Point a signed-in account at the team it should have joined.
 *
 * The orphaned-account case, which recurs: someone signs in, bootstrap can't
 * match them to an existing team, and creates them a personal one. The account
 * works, has a team, and shows an empty dashboard — or bounces to /subscribe,
 * because a freshly-created team has no subscription status and the gate only
 * lets through "active" or "trialing".
 *
 * Seen on 2026-08-12: gianni@createfreedom.io signed in, landed on a new
 * "Gianni SM's Team" created that minute, and read as locked out of an account
 * that was in fact perfectly healthy — the lockout was on a different team from
 * the one anyone was looking at.
 *
 * Deliberately does NOT delete the team left behind. An empty team is harmless;
 * deleting one that turned out to have data would not be.
 */
export const attachUserToTeam = internalMutation({
  args: { clerkId: v.string(), teamId: v.id("teams") },
  handler: async (
    ctx,
    args,
  ): Promise<{ moved: boolean; from?: string; to?: string; reason?: string }> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return { moved: false, reason: "no user with that clerk id" };

    const target = await ctx.db.get(args.teamId);
    if (!target) return { moved: false, reason: "target team not found" };

    const from = String(user.teamId);
    if (from === String(args.teamId)) {
      return { moved: false, reason: "already on that team" };
    }

    await ctx.db.patch(user._id, { teamId: args.teamId });
    return { moved: true, from, to: String(args.teamId) };
  },
});
