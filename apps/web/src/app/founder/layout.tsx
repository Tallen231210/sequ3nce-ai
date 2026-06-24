import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import { isFounder } from "@/lib/founders";

/**
 * Server-side gate for /founder (read-only Sequ3nce founder dashboard).
 *
 * Mounted at /founder rather than /admin because /admin is the existing
 * password-protected ammo-config tool (apps/web/src/app/admin/layout.tsx,
 * since Dec 2025). Different concept, different auth, can't share a tree.
 *
 * Layer 1 of two-layer auth:
 *   Layer 1 (this file): redirect non-founders to /dashboard so they
 *                        never see the founder UI.
 *   Layer 2 (convex/founderAdmin.ts assertFounder): throws on every
 *                        query so even a Layer 1 bypass can't read data.
 *
 * Server component — runs on every request, can't be bypassed by
 * client-side route manipulation.
 *
 * Plan: .claude/plans/admin-dashboard-readonly.md
 */
export default async function FounderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/founder");
  }

  // Email lives on the Convex users table — synced on first sign-in by
  // createTeamAndUser. No Clerk SDK round-trip needed.
  const user = await fetchQuery(api.teams.getMyUser, { clerkId: userId });
  if (!isFounder(user?.email)) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-zinc-500">[founder]</span>
          <h1 className="text-sm font-semibold">Sequ3nce Admin</h1>
          <span className="ml-auto text-xs text-zinc-500">{user?.email}</span>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
