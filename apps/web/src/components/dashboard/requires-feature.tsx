"use client";

// ============================================================================
// A page this team's plan doesn't include.
//
// Hiding a tab is not gating a feature — the URL still works, and a bookmark,
// a browser autocomplete or an old link walks straight into it. This is the
// other half.
//
// It sends them to the billing page rather than showing a dead end, because
// someone who lands here wanted the thing and the only useful next step is
// telling them what it costs.
// ============================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/hooks/useTeam";
import { tierHas, type Feature } from "@/lib/tiers";

export function RequiresFeature({
  feature,
  children,
}: {
  feature: Feature;
  children: React.ReactNode;
}) {
  const { team, isLoading } = useTeam();
  const router = useRouter();

  // Only once the team has actually loaded. Redirecting on an undefined team
  // would bounce every user off these pages for the first moment of every page
  // load, including the ones who are entitled to be there.
  const denied = !isLoading && !!team && !tierHas(team.productTier, feature);

  useEffect(() => {
    if (denied) router.replace("/dashboard/billing?upgrade=1");
  }, [denied, router]);

  if (isLoading) return null;
  if (denied) return null;

  return <>{children}</>;
}
