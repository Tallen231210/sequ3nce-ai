import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { verifyAdminSession } from "@/lib/adminAuth";

const IMPERSONATION_TTL_SECONDS = 30 * 60; // 30 min, one-time use

const getConvex = () =>
  new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Mint a Clerk actor token to impersonate a customer account. Founder-only:
 * gated on the signed admin session. Returns a one-time sign-in URL; the raw
 * token is never returned separately, never logged. Every call is audited.
 */
export async function POST(request: NextRequest) {
  // --- Gate: the crown-jewels action. Nothing proceeds without a valid,
  // unforgeable admin session. ---
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: "Clerk not configured" },
      { status: 500 },
    );
  }

  // Accept either a clerkId (precise — picked from the account list) or an
  // email (typed manually). clerkId wins when both are present.
  let email = "";
  let clerkId = "";
  try {
    const body = await request.json();
    email = String(body.email ?? "").trim().toLowerCase();
    clerkId = String(body.clerkId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!clerkId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email" },
      { status: 400 },
    );
  }

  const client = await clerkClient();
  let target;
  if (clerkId) {
    try {
      target = await client.users.getUser(clerkId);
    } catch {
      return NextResponse.json(
        { error: "That account no longer exists in Clerk" },
        { status: 404 },
      );
    }
  } else {
    const { data: users } = await client.users.getUserList({
      emailAddress: [email],
    });
    if (users.length === 0) {
      return NextResponse.json(
        { error: `No account found for ${email}` },
        { status: 404 },
      );
    }
    if (users.length > 1) {
      // Extremely rare; surface it rather than guess who to become.
      return NextResponse.json(
        { error: `Multiple accounts share ${email} — pick from the list instead` },
        { status: 409 },
      );
    }
    target = users[0];
  }
  // Normalize the label email to whatever Clerk has on the resolved user.
  email =
    target.emailAddresses?.[0]?.emailAddress?.toLowerCase() || email || "";

  // Friendly confirmation label from our own DB (team name).
  let teamName: string | null = null;
  let targetTeamId: string | undefined;
  try {
    const convex = getConvex();
    const info = await convex.query(api.adminAudit.teamForClerkId, {
      adminSecret: process.env.ADMIN_SECRET ?? "",
      clerkId: target.id,
    });
    teamName = info?.teamName ?? null;
    targetTeamId = info?.teamId;
  } catch {
    // Non-fatal — impersonation still works without the label.
  }

  // Mint the actor token. actor.sub = the target flags the session as
  // impersonated (Clerk renders its own on-screen indicator).
  const res = await fetch("https://api.clerk.com/v1/actor_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: target.id,
      actor: { sub: target.id },
      expires_in_seconds: IMPERSONATION_TTL_SECONDS,
    }),
  });
  if (!res.ok) {
    // Log status only — never the response body (could echo token material).
    console.error("[impersonate] Clerk actor_tokens failed:", res.status);
    return NextResponse.json(
      { error: "Failed to create impersonation session" },
      { status: 502 },
    );
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) {
    return NextResponse.json(
      { error: "Clerk returned no sign-in URL" },
      { status: 502 },
    );
  }

  // Audit (best-effort — don't fail the action if logging hiccups).
  try {
    const convex = getConvex();
    await convex.mutation(api.adminAudit.logAdminAction, {
      action: "impersonate",
      targetClerkId: target.id,
      targetEmail: email,
      targetTeamId: targetTeamId as never,
      targetTeamName: teamName ?? undefined,
    });
  } catch (e) {
    console.error("[impersonate] audit write failed:", e);
  }

  return NextResponse.json({
    url: data.url,
    targetEmail: email,
    teamName,
  });
}
