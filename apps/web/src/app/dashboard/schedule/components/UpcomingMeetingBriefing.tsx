"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useTeam } from "@/hooks/useTeam";
import { Loader2, Phone } from "lucide-react";
import { SetterTranscriptView } from "../../setter-data/components/SetterTranscriptView";

interface UpcomingMeetingBriefingProps {
  calendarEventId: Id<"calendarEvents">;
}

/**
 * Pre-call briefing panel. Renders inline below an upcoming-meeting row
 * in the Schedule list when a manager expands it. Shows the qualifying
 * setter-call summary + talk-ratio for the prospect, lazy-loads the full
 * transcript on demand.
 *
 * Empty-state copy varies by reason so managers understand WHY a row
 * doesn't have a briefing (and what they could do about it).
 */
export function UpcomingMeetingBriefing({
  calendarEventId,
}: UpcomingMeetingBriefingProps) {
  const { clerkId } = useTeam();
  const data = useQuery(
    api.setterCloserBriefing.getBriefingForCalendarEvent,
    clerkId ? { clerkId, calendarEventId } : "skip",
  );

  if (data === undefined) {
    return (
      <div className="mt-2 flex items-center justify-center rounded-lg bg-zinc-50 p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="ml-2 text-xs text-muted-foreground">
          Loading prospect context…
        </span>
      </div>
    );
  }

  if (data.reason === "no_prospect_identity") {
    return (
      <BriefingEmpty
        title="No external prospect"
        copy="Calendar event has no non-organizer attendee — looks like an internal meeting."
      />
    );
  }
  if (data.reason === "no_matching_setter_lead") {
    return (
      <BriefingEmpty
        title="Prospect isn't in your setter leads"
        copy="They may have been added manually, or this prospect came in via a different lead source than GHL."
      />
    );
  }
  if (data.reason === "no_transcript_yet" || !data.transcript) {
    return (
      <BriefingEmpty
        title="No qualifying setter call yet"
        copy={
          data.matchedSetterLead
            ? `Lead matched (${data.matchedSetterLead.name || data.matchedSetterLead.email}) but no transcribed setter call is on file. Either no setter dialed yet, or the call's transcript hasn't processed.`
            : "We couldn't find a qualifying setter call for this prospect."
        }
      />
    );
  }

  return (
    <BriefingContent
      briefing={data}
      transcriptRowId={data.transcript.transcriptRowId}
    />
  );
}

interface BriefingData {
  matchedSetterLead: {
    name?: string;
    email?: string;
    source?: string;
    tags: string[];
  } | null;
  transcript: {
    transcriptRowId: Id<"setterCallTranscripts">;
    occurredAt: number;
    direction: "outbound" | "inbound";
    durationSec?: number;
    aiSummary?: string;
    setterTalkTimeSec?: number;
    prospectTalkTimeSec?: number;
    setterSpeakerIndex?: 0 | 1;
    hasFullTranscript: boolean;
  } | null;
  setterName: string | null;
}

function BriefingContent({
  briefing,
  transcriptRowId,
}: {
  briefing: BriefingData;
  transcriptRowId: Id<"setterCallTranscripts">;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const t = briefing.transcript!;
  const talkRatio = computeTalkRatio(t.setterTalkTimeSec, t.prospectTalkTimeSec);
  const callAge = humanAgo(t.occurredAt);

  return (
    <div className="mt-2 space-y-2">
      {/* Briefing header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Phone className="h-3.5 w-3.5" />
        <span>
          Qualifying call{briefing.setterName ? ` by ${briefing.setterName}` : ""}{" "}
          {callAge} · {t.direction === "inbound" ? "inbound" : "outbound"}
          {typeof t.durationSec === "number" &&
            ` · ${formatDurationShort(t.durationSec)}`}
        </span>
      </div>

      {/* Summary card */}
      <div className="rounded-lg bg-zinc-50 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Pre-call briefing
        </div>
        {t.aiSummary ? (
          <div className="mt-2 whitespace-pre-line text-sm text-foreground leading-relaxed">
            {t.aiSummary}
          </div>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">
            Summary unavailable for this call.
          </div>
        )}
      </div>

      {/* Talk ratio */}
      {talkRatio && (
        <div className="rounded-lg bg-zinc-50 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Talk ratio
          </div>
          <div className="mt-2 flex items-center gap-3 text-sm">
            {t.setterSpeakerIndex !== undefined ? (
              <>
                <span className="text-emerald-600 font-medium">
                  Setter {talkRatio.setterPct}%
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-blue-600 font-medium">
                  Prospect {talkRatio.prospectPct}%
                </span>
              </>
            ) : (
              <>
                <span className="font-medium">
                  Speaker A {talkRatio.setterPct}%
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="font-medium">
                  Speaker B {talkRatio.prospectPct}%
                </span>
              </>
            )}
          </div>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="bg-emerald-500"
              style={{ width: `${talkRatio.setterPct}%` }}
            />
            <div
              className="bg-blue-500"
              style={{ width: `${talkRatio.prospectPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Show full transcript toggle */}
      {t.hasFullTranscript && (
        <div>
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showTranscript
              ? "▲ Hide full transcript"
              : "▼ Show full transcript"}
          </button>
          {showTranscript && (
            <LazyTranscriptLoader transcriptRowId={transcriptRowId} />
          )}
        </div>
      )}
    </div>
  );
}

function LazyTranscriptLoader({
  transcriptRowId,
}: {
  transcriptRowId: Id<"setterCallTranscripts">;
}) {
  const data = useQuery(api.setterCallTranscriptsMutations.getCallTranscript, {
    rowId: transcriptRowId,
  });
  if (data === undefined) {
    return (
      <div className="mt-2 flex items-center justify-center rounded-lg bg-zinc-50 p-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data || !data.transcriptJson) {
    return (
      <div className="mt-2 rounded-lg bg-zinc-50 p-3 text-xs text-muted-foreground">
        Transcript unavailable.
      </div>
    );
  }
  return (
    <SetterTranscriptView
      transcriptJson={data.transcriptJson}
      setterSpeakerIndex={data.setterSpeakerIndex}
    />
  );
}

function BriefingEmpty({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="mt-2 rounded-lg bg-zinc-50 p-3">
      <div className="text-xs font-medium text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{copy}</div>
    </div>
  );
}

function computeTalkRatio(
  setterSec: number | undefined,
  prospectSec: number | undefined,
): { setterPct: number; prospectPct: number } | null {
  if (typeof setterSec !== "number" || typeof prospectSec !== "number") {
    return null;
  }
  const total = setterSec + prospectSec;
  if (total < 1) return null;
  const setterPct = Math.round((setterSec / total) * 100);
  return { setterPct, prospectPct: 100 - setterPct };
}

function formatDurationShort(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${min}m` : `${min}m ${s}s`;
}

function humanAgo(ts: number): string {
  const deltaMs = Date.now() - ts;
  if (deltaMs < 0) return "just now";
  const min = Math.floor(deltaMs / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
