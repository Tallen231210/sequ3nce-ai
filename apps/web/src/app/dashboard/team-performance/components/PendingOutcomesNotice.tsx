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

import { ClipboardList } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Notice } from "@/components/dashboard/notice";

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
    <Notice icon={ClipboardList} title={`${total} ${total === 1 ? "call is" : "calls are"} missing an outcome, so they aren't counted below yet`}>
      <p>
        A call only reaches this board once the closer says how it went
        {waitingSince ? `, and the oldest has been waiting since ${waitingSince}` : ""}.
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {byCloser.map((c) => (
          <li key={c.closerId}>
            <span className="font-medium text-foreground">{c.name}</span> <span className="tabular-nums">{c.count}</span>
          </li>
        ))}
      </ul>
    </Notice>
  );
}
