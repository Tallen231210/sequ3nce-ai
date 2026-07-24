import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MS,
  signAdminSession,
  verifyAdminSession,
} from "@/lib/adminAuth";

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  // Path "/" (not "/admin") so the session cookie is sent to the
  // /api/admin/* routes that must verify it server-side.
  path: "/",
};

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      console.error("ADMIN_PASSWORD environment variable not set");
      return NextResponse.json(
        { error: "Admin access not configured" },
        { status: 500 },
      );
    }

    if (password !== adminPassword) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_COOKIE, signAdminSession(), {
      ...cookieOpts,
      maxAge: Math.floor(ADMIN_SESSION_MS / 1000),
    });
    return response;
  } catch (error) {
    console.error("Admin verify error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/** Cookie check so the admin UI can persist auth across refreshes. */
export async function GET() {
  const ok = await verifyAdminSession();
  return NextResponse.json({ authenticated: ok }, { status: ok ? 200 : 401 });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_COOKIE, "", { ...cookieOpts, maxAge: 0 });
  return response;
}
