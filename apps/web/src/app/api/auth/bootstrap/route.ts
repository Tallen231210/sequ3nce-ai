import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

/**
 * Ensure the signed-in user has a team, reattaching to their existing one
 * when their Clerk account was recreated (see teams.ensureUserTeam).
 *
 * This route is the trust boundary. The client is never trusted for
 * identity: the Clerk session is verified server-side via auth(), and the
 * email is read from Clerk's backend API — NOT from the request body — and
 * only accepted when Clerk reports it verified. That's what makes matching
 * an existing account by email safe rather than an account-takeover hole.
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 },
    );
  }

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    // Primary email only, and only if Clerk says it's verified. An
    // unverified address must never be able to claim an existing team.
    const primary =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ??
      user.emailAddresses[0];
    const verified = primary?.verification?.status === "verified";
    if (!primary || !verified) {
      return NextResponse.json(
        { error: "Email not verified" },
        { status: 403 },
      );
    }

    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined;

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    const result = await convex.mutation(api.teams.ensureUserTeam, {
      adminSecret,
      clerkId: userId,
      email: primary.emailAddress,
      name,
    });

    return NextResponse.json({
      teamId: result.teamId,
      reattached: result.reattached,
      created: result.created,
    });
  } catch (e) {
    console.error("[auth/bootstrap] failed:", e);
    return NextResponse.json({ error: "Bootstrap failed" }, { status: 500 });
  }
}
