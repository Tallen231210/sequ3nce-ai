"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export function useTeam() {
  const { user, isLoaded: isUserLoaded } = useUser();

  const clerkId = user?.id ?? "";

  // Get the current team
  const team = useQuery(
    api.teams.getMyTeam,
    clerkId ? { clerkId } : "skip"
  );

  // Get the current user record
  const dbUser = useQuery(
    api.teams.getMyUser,
    clerkId ? { clerkId } : "skip"
  );

  // Ensure a team exists on first login.
  //
  // Goes through /api/auth/bootstrap rather than calling Convex directly:
  // that route verifies the Clerk session server-side and reads the
  // VERIFIED email from Clerk's backend, which is what allows it to
  // reattach a returning manager to their existing team (e.g. after they
  // deleted and recreated their Clerk login) without letting anyone claim
  // a team by simply asserting someone else's email.
  useEffect(() => {
    let cancelled = false;
    async function ensureTeamExists() {
      if (!isUserLoaded || !user) return;
      if (team === undefined) return; // Still loading
      if (team !== null) return; // Team already exists

      try {
        const res = await fetch("/api/auth/bootstrap", { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `bootstrap ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled && data.reattached) {
          // Reconnected to a pre-existing account — reload so every query
          // re-runs against the restored team.
          window.location.reload();
        }
      } catch (error) {
        console.error("Failed to bootstrap team:", error);
        Sentry.captureException(error);
      }
    }

    ensureTeamExists();
    return () => {
      cancelled = true;
    };
  }, [isUserLoaded, user, team]);

  // Tag every Sentry event with which user hit it. Single biggest debugging
  // force-multiplier — turns "some user got this error" into "this specific
  // user, who is on team X, got this error." Cleared on logout (when Clerk
  // user goes from defined → null).
  useEffect(() => {
    if (!isUserLoaded) return;
    if (user) {
      Sentry.setUser({
        id: user.id,
        email: user.emailAddresses[0]?.emailAddress,
        username: user.fullName ?? user.firstName ?? undefined,
      });
    } else {
      Sentry.setUser(null);
    }
  }, [isUserLoaded, user]);

  return {
    team,
    user: dbUser,
    clerkId,
    isLoading: !isUserLoaded || team === undefined,
    isReady: isUserLoaded && team !== undefined && team !== null,
  };
}
