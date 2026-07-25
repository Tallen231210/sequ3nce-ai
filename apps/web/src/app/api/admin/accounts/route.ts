import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { verifyAdminSession } from "@/lib/adminAuth";

const getConvex = () =>
  new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Account directory + audit trail for the /admin panel. Session-gated here,
 * and the underlying Convex queries additionally require ADMIN_SECRET — so
 * the customer list is never reachable from a browser, only from this route.
 */
export async function GET() {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET not configured on the web app" },
      { status: 500 },
    );
  }

  try {
    const convex = getConvex();
    const [accounts, recent] = await Promise.all([
      convex.query(api.adminAccounts.listAccounts, { adminSecret }),
      convex.query(api.adminAudit.recentAdminActions, { adminSecret, limit: 10 }),
    ]);
    return NextResponse.json({ accounts, recent });
  } catch (e) {
    console.error("[admin/accounts] failed:", e);
    return NextResponse.json(
      { error: "Failed to load accounts" },
      { status: 500 },
    );
  }
}
