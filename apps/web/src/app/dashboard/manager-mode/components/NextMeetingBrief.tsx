"use client";

import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../../../convex/_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

function whenLabel(startTime: number): string {
  const mins = Math.round((startTime - Date.now()) / 60000);
  if (mins < -1) return "started";
  if (mins <= 1) return "now";
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  return `in ${hrs} hour${hrs === 1 ? "" : "s"}`;
}

/**
 * The next meeting, briefed.
 *
 * Only shown when there IS one within the next half-day. A hero card that says
 * "nothing coming up" is a large piece of furniture doing no work — the rep
 * cards below are the useful thing on a quiet day.
 */
export function NextMeetingBrief() {
  const { user } = useUser();
  const clerkId = user?.id;

  const brief = useQuery(
    api.managerBrief.getNextMeetingBrief,
    clerkId ? { clerkId } : "skip",
  );
  const reps = useQuery(
    api.managerBrief.listTaggableReps,
    clerkId ? { clerkId } : "skip",
  );
  const cards = useQuery(
    api.managerRepCards.listRepCards,
    clerkId ? { clerkId } : "skip",
  );

  const tagRep = useMutation(api.managerBrief.tagMeetingRep);
  const setExcluded = useMutation(api.managerBrief.setMeetingExcluded);

  if (!brief?.meeting) return null;
  const m = brief.meeting;
  const rep = brief.rep;

  // The rep's live suggestions, from the same engine as the cards below — so
  // the brief and the card underneath it can never disagree.
  const repCard = rep
    ? cards?.cards?.find((c: any) => String(c.closerId) === String(rep.closerId))
    : null;
  const suggestions = repCard?.suggestions ?? [];

  return (
    <div className="rounded-xl bg-zinc-950 p-6 text-white">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Next · {whenLabel(m.startTime)}
          </div>
          <div className="mt-1.5 text-xl font-semibold tracking-tight">
            {m.title}
          </div>
          {rep && (
            <div className="mt-1 text-xs text-zinc-400">
              with {rep.name}
              {rep.identifiedBy && rep.identifiedBy !== "you" && (
                <span className="text-zinc-600">
                  {" "}
                  · matched from the {rep.identifiedBy}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="text-right">
          {m.hasMeetingUrl ? (
            <button
              onClick={() =>
                void setExcluded({
                  clerkId: clerkId!,
                  eventId: m.eventId,
                  excluded: !m.excluded,
                })
              }
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              {m.excluded ? "Record this one" : "Don't record"}
            </button>
          ) : (
            <span className="text-xs text-zinc-500">no video link</span>
          )}
        </div>
      </div>

      {/* When we can't tell who it's with, ask rather than guess. A brief
          addressed to the wrong rep is worse than none. */}
      {!rep && reps && reps.length > 0 && (
        <div className="mt-5 flex items-center gap-3 border-t border-zinc-800 pt-4">
          <span className="text-xs text-zinc-400">Who is this with?</span>
          <select
            defaultValue=""
            onChange={(e) =>
              e.target.value &&
              void tagRep({
                clerkId: clerkId!,
                eventId: m.eventId,
                closerId: e.target.value as any,
              })
            }
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200"
          >
            <option value="">Select…</option>
            {reps.map((r: any) => (
              <option key={r.closerId} value={r.closerId}>
                {r.name}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-zinc-600">
            or leave it — not every meeting is with one person
          </span>
        </div>
      )}

      {rep && (
        <div className="mt-5 border-t border-zinc-800 pt-4">
          <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Worth bringing up
          </div>

          {suggestions.length === 0 && brief.lastAgreements.length === 0 && (
            <div className="text-sm text-zinc-400">
              Nothing flagged. Their numbers are steady and nothing was left
              open last time.
            </div>
          )}

          <ul className="space-y-1.5 text-sm">
            {suggestions.map((s: any) => (
              <li key={s.code} className="flex gap-2.5">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                <span>
                  {s.text}
                  <span className="text-zinc-500"> — {s.evidence}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* The part nothing else can do: what they said last time, next to
              whether it's the kind of thing we could check. */}
          {brief.lastAgreements.length > 0 && (
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Agreed last time
                {brief.lastMetAt && (
                  <span className="ml-1.5 font-normal tracking-normal text-zinc-600">
                    {new Date(brief.lastMetAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {brief.lastAgreements.map((a: any, i: number) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                    <span className="flex-1">{a.what}</span>
                    {a.measurable && (
                      <span className="mt-0.5 shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                        checkable
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
