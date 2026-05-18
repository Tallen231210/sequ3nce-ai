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

  // Mutation to create team if needed
  const createTeamAndUser = useMutation(api.teams.createTeamAndUser);

  // Create team on first login
  useEffect(() => {
    async function ensureTeamExists() {
      if (!isUserLoaded || !user) return;
      if (team === undefined) return; // Still loading
      if (team !== null) return; // Team already exists

      // Team doesn't exist, create one
      try {
        await createTeamAndUser({
          clerkId: user.id,
          email: user.emailAddresses[0]?.emailAddress ?? "",
          name: user.fullName ?? user.firstName ?? undefined,
        });
      } catch (error) {
        console.error("Failed to create team:", error);
      }
    }

    ensureTeamExists();
  }, [isUserLoaded, user, team, createTeamAndUser]);

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
