"use client";

import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Loader2, Video } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What's coming and what was recorded.
 *
 * Upcoming sits above recorded because the useful question in the morning is
 * "what is the bot about to walk into", not "what did it catch yesterday".
 */
export function MeetingsTab({
  onOpenMeeting,
}: {
  onOpenMeeting: (id: string) => void;
}) {
  const { user } = useUser();
  const clerkId = user?.id;

  const meetings = useQuery(
    api.managerMeetingQueries.listManagerMeetings,
    clerkId ? { clerkId } : "skip",
  );
  const upcoming = useQuery(
    api.managerMeetingQueries.listUpcomingManagerEvents,
    clerkId ? { clerkId } : "skip",
  );

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Coming up
        </h3>
        <div className="rounded-xl border border-border bg-card">
          {upcoming === undefined ? (
            <Loading />
          ) : upcoming.length === 0 ? (
            <Empty>Nothing on your calendar in the next week.</Empty>
          ) : (
            upcoming.map((e: any) => (
              <div
                key={e._id}
                className="flex items-center justify-between border-b border-border/50 px-5 py-3.5 last:border-0"
              >
                <div>
                  <div className="text-sm font-medium">{e.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(e.startTime).toLocaleString()}
                  </div>
                </div>
                {/* A meeting with no video link is on the calendar but
                    unrecordable. Saying so beats a silent absence from the
                    recordings list later. */}
                {!e.hasMeetingUrl ? (
                  <span className="text-xs text-muted-foreground">
                    no video link
                  </span>
                ) : e.excluded ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                    not recording
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                    will record
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Recorded
        </h3>
        <div className="rounded-xl border border-border bg-card">
          {meetings === undefined ? (
            <Loading />
          ) : meetings.length === 0 ? (
            <Empty>
              Nothing recorded yet. Your next meeting with a video link will
              appear here.
            </Empty>
          ) : (
            meetings.map((m: any) => (
              <button
                key={m._id}
                onClick={() => onOpenMeeting(m._id)}
                className="flex w-full items-center gap-3 border-b border-border/50 px-5 py-3.5 text-left last:border-0 hover:bg-muted/40"
              >
                <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{m.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {m.startedAt ? new Date(m.startedAt).toLocaleString() : "—"}
                    {m.duration ? ` · ${Math.round(m.duration / 60)} min` : ""}
                  </div>
                </div>
                {/* Why a recording produced nothing, when it produced nothing —
                    rather than a gap someone reads as "no meeting happened". */}
                {m.failureReason && (
                  <span className="text-xs text-amber-700">{m.failureReason}</span>
                )}
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-20 items-center justify-center">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-5 text-sm text-muted-foreground">{children}</div>;
}
