"use client";

// ============================================================================
// "Why is my board empty?"
//
// A team connects Fathom, we import the month, and the manager opens this page
// expecting to see it. They see nothing, because an imported call carries no
// outcome and nothing without an outcome can be counted.
//
// That's the right behaviour with a terrible first impression: the board isn't
// broken and the import didn't fail, the calls are sitting with the closers.
// Without saying so, the obvious reading is "this doesn't work".
//
// Names the people, because a manager acting on this needs to know who to talk
// to rather than that a number exists.
// ============================================================================

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export function PendingOutcomesNotice({ teamId }: { teamId?: string }) {
  const pending = useQuery(
    api.fathomPending.getPendingOutcomes,
    teamId ? { teamId: teamId as Id<"teams"> } : "skip",
  );

  if (!pending || pending.total === 0) return null;

  const { total, byCloser, oldestAt } = pending;
  const waitingSince = oldestAt
    ? new Date(oldestAt).toLocaleDateString([], { month: "short", day: "numeric" })
    : null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        {total} {total === 1 ? "call is" : "calls are"} missing an outcome, so
        they aren&apos;t counted below yet
      </p>
      <p className="mt-1 text-[13px] text-amber-800 dark:text-amber-300/80">
        A call only reaches this board once the closer says how it went
        {waitingSince ? `, and the oldest has been waiting since ${waitingSince}` : ""}.
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-amber-900 dark:text-amber-200">
        {byCloser.map((c) => (
          <li key={c.closerId}>
            <span className="font-medium">{c.name}</span>{" "}
            <span className="text-amber-700 dark:text-amber-400">({c.count})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
