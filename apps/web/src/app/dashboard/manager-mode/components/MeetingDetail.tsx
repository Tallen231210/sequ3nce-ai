"use client";

import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { ClipFromTranscript } from "./ClipFromTranscript";
import { MeetingClips } from "./MeetingClips";

/* eslint-disable @typescript-eslint/no-explicit-any */

const KIND_LABEL: Record<string, string> = {
  one_to_one: "One-to-one",
  team: "Team meeting",
  leadership: "Leadership",
  interview: "Interview",
  other: "Meeting",
};

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.round(seconds / 60);
  return m < 1 ? "under a minute" : `${m} min`;
}

/**
 * One meeting, read back.
 *
 * Three states have to be distinguishable and are: not read yet, read and
 * empty, and read with something in it. Collapsing those into one silent
 * blank is how a working feature gets reported as broken.
 */
export function MeetingDetail({
  meetingId,
  onBack,
}: {
  meetingId: string;
  onBack: () => void;
}) {
  const { user } = useUser();
  const d = useQuery(
    api.managerMeetingQueries.getManagerMeetingDetail,
    user ? { clerkId: user.id, meetingId: meetingId as any } : "skip",
  );

  if (d === undefined) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!d) return null;

  const a = d.analysis;
  const isInterview = a?.kind === "interview";

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All meetings
      </button>

      <div>
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{d.title}</h2>
          {a && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {KIND_LABEL[a.kind] ?? "Meeting"}
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {d.startedAt ? new Date(d.startedAt).toLocaleString() : "—"}
          {d.duration ? ` · ${fmtDuration(d.duration)}` : ""}
          {isInterview && a?.candidateName ? ` · ${a.candidateName}` : ""}
          {isInterview && a?.role ? ` · ${a.role}` : ""}
        </div>
      </div>

      {/* Why nothing was recorded, when nothing was. */}
      {d.failureReason && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No recording — {d.failureReason}.
        </div>
      )}

      {/* Read but empty, versus not read yet. Different facts. */}
      {!a && d.hasTranscript && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Still being read. This usually takes a minute after the meeting ends.
        </div>
      )}
      {!a && !d.hasTranscript && !d.failureReason && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          No transcript — nothing was said, or the meeting was too short to read.
        </div>
      )}

      {a && (
        <>
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Summary
            </div>
            <p className="mt-2.5 text-sm leading-relaxed">{a.summary}</p>
            {a.topics.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {a.topics.map((t: string) => (
                  <span
                    key={t}
                    className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Interviews: what they said, never what we think of them. */}
          {isInterview && a.talkingPoints.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Worth remembering
              </div>
              <ul className="mt-3 space-y-2">
                {a.talkingPoints.map((t: string, i: number) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    {t}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {a.agreements.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Agreed
              </div>
              <ul className="mt-3 space-y-2.5">
                {a.agreements.map((g: any, i: number) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded border-border accent-foreground"
                    />
                    <span className="flex-1 leading-relaxed">
                      <span className="font-medium">{g.who}</span> — {g.what}
                    </span>
                    {/* Only where a record could settle it. Everything else
                        gets no badge rather than a hedge, because a badge that
                        means "maybe" is worse than none. */}
                    {g.measurable && (
                      <span className="mt-0.5 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        we can check this
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {a.actionItems.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Left hanging
              </div>
              <ul className="mt-3 space-y-2">
                {a.actionItems.map((t: any, i: number) => (
                  <li key={i} className="text-sm leading-relaxed">
                    <span className="font-medium">{t.who}</span> — {t.what}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {d.recordingUrl && (
        <a
          href={d.recordingUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sm text-muted-foreground underline"
        >
          Watch the recording
        </a>
      )}

      <MeetingClips meetingId={meetingId} />

      {/* The transcript doubles as the clipping surface — a manager marks the
          moment in the words rather than by scrubbing for it. */}
      <ClipFromTranscript meetingId={meetingId} transcript={d.transcript} />
    </div>
  );
}
