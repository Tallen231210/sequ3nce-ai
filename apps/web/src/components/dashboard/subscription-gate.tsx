"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Loader2 } from "lucide-react";

interface SubscriptionGateProps {
  children: React.ReactNode;
}

/**
 * How long to wait for a team to appear before giving up and sending them to
 * the subscribe page.
 *
 * Only reached when bootstrap genuinely fails — a network error, or a Clerk
 * account whose email matches no existing user. Long enough that a slow
 * bootstrap isn't mistaken for a missing account, short enough that a real
 * failure doesn't leave someone staring at a spinner.
 */
const BOOTSTRAP_GRACE_MS = 8000;

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const router = useRouter();
  const { user, isLoaded: isUserLoaded } = useUser();

  // The team, resolved through the same hook that owns bootstrap.
  //
  // This gate used to query billing directly by Clerk id and redirect the
  // moment it came back empty. That raced with bootstrap and broke the move to
  // a Clerk production instance: a manager signs in with a NEW Clerk id, their
  // user row still carries the old one until bootstrap re-points it, so billing
  // is briefly null — and they were bounced to "Start Your Subscription" while
  // holding a perfectly good active subscription. Bootstrap then finished and
  // reloaded the page, which only reloaded the subscribe page.
  //
  // None of that is hypothetical. It happened on the first sign-in after
  // cutover, and would have greeted every returning manager with a demand for
  // money they had already paid.
  const { team, isLoading: isTeamLoading } = useTeam();

  const billing = useQuery(
    api.billing.getTeamBilling,
    user?.id ? { clerkId: user.id } : "skip",
  );

  const waitingForTeam = isUserLoaded && !!user && !isTeamLoading && !team;
  const [graceExpired, setGraceExpired] = useState(false);

  useEffect(() => {
    if (!waitingForTeam) {
      setGraceExpired(false);
      return;
    }
    const t = setTimeout(() => setGraceExpired(true), BOOTSTRAP_GRACE_MS);
    return () => clearTimeout(t);
  }, [waitingForTeam]);

  const isActive =
    billing?.subscriptionStatus === "active" ||
    billing?.subscriptionStatus === "trialing";

  useEffect(() => {
    if (!isUserLoaded || !user) return;

    // Still resolving the team, or bootstrap may still be re-pointing this
    // Clerk id at an existing account. Redirecting here is the bug above.
    if (isTeamLoading) return;
    if (!team && !graceExpired) return;

    // Bootstrap had its chance and there is still no team.
    if (!team && graceExpired) {
      router.push("/subscribe");
      return;
    }

    // A team exists, so billing is now meaningful.
    if (billing === undefined) return;
    if (!isActive) router.push("/subscribe");
  }, [
    isUserLoaded,
    user,
    isTeamLoading,
    team,
    graceExpired,
    billing,
    isActive,
    router,
  ]);

  if (!isUserLoaded) return <LoadingScreen />;
  if (isTeamLoading) return <LoadingScreen />;
  if (!team) return <LoadingScreen label="Restoring your account…" />;
  if (billing === undefined) return <LoadingScreen />;
  if (!isActive) return <LoadingScreen />;

  return <>{children}</>;
}

function LoadingScreen({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        <p className="text-zinc-500 text-sm">{label}</p>
      </div>
    </div>
  );
}
