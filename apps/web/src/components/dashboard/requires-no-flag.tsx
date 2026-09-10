"use client";

// ============================================================================
// A page this team has moved on from. Hiding the nav entry is not enough —
// bookmarks and old links still work — so a team with the flag is sent to
// the page that replaced it, query string included (the Close OAuth callback
// lands on the old route with ?connected=1). Unflagged teams render the page
// as they always did, loaders and all: children show while the team loads.
// ============================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/hooks/useTeam";

export function RequiresNoFlag({ flag, to, children }: { flag: string; to: string; children: React.ReactNode }) {
  const { team, isLoading } = useTeam();
  const router = useRouter();
  const flags = (team as { betaFeatures?: string[] } | null | undefined)?.betaFeatures ?? [];
  const bounce = !isLoading && !!team && flags.includes(flag);
  useEffect(() => {
    if (bounce) router.replace(to + window.location.search);
  }, [bounce, router, to]);
  if (bounce) return null;
  return <>{children}</>;
}
