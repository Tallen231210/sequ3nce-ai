"use client";

import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../convex/_generated/api";

/**
 * Adopts the signed-in manager's timezone as the team's, once, if the team
 * has never had one set.
 *
 * Everything day-shaped runs in team.timezone — the daily rollup's day
 * boundaries, the Team Performance board, the scheduled Slack posts. With it
 * unset the code falls back to America/New_York, which is simply wrong for a
 * team anywhere else: evening bookings land on the following day and the
 * morning post fires before dawn. Every team in production is on that
 * fallback today, none of them by choice.
 *
 * Renders nothing. The mutation is a no-op once a timezone exists, so an
 * explicit choice in Settings is never overwritten, and a manager in another
 * office signing in tomorrow can't drag the team's day boundary sideways.
 */
export function TimezoneAdopter() {
  const { user, isLoaded } = useUser();
  const adopt = useMutation(api.teams.adoptTimezoneIfUnset);
  // Guards against React strict-mode double-invocation and re-renders.
  const attempted = useRef(false);

  useEffect(() => {
    if (!isLoaded || !user || attempted.current) return;
    attempted.current = true;

    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return; // no reliable zone from this browser; leave it to Settings
    }
    if (!tz) return;

    // Best effort. A failure here must never interrupt the dashboard — the
    // fallback timezone still works, it's just not ideal.
    void adopt({ clerkId: user.id, timezone: tz }).catch(() => {});
  }, [isLoaded, user, adopt]);

  return null;
}
