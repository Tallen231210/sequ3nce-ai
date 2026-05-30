"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Loader2 } from "lucide-react";
import { SetterTranscriptView } from "./SetterTranscriptView";

interface TranscriptSummary {
  transcriptRowId: Id<"setterCallTranscripts">;
  status: "pending" | "available" | "not_available" | "failed";
  aiSummary?: string;
  setterTalkTimeSec?: number;
  prospectTalkTimeSec?: number;
  setterSpeakerIndex?: 0 | 1;
  hasFullTranscript: boolean;
}

interface CallEventDetailPanelProps {
  transcript: TranscriptSummary;
}

/**
 * Expandable detail panel that renders below a dial/call event in the
 * activity timeline. Shows AI summary + talk-to-listen ratio inline.
 * The full per-sentence transcript is fetched lazily (only when the
 * user clicks "Show full transcript") so the parent list query stays
 * small.
 *
 * Styling mirrors the closer-side AnalysisPanel:
 * `bg-zinc-50 rounded-lg p-3` cards with `text-[10px] uppercase
 * tracking-wider` section labels.
 */
export function CallEventDetailPanel({ transcript }: CallEventDetailPanelProps) {
  const [showTranscript, setShowTranscript] = useState(false);

  // Status states other than "available" each get a one-line message
  // explaining why there's no detail to show. Avoids silent empty states.
  if (transcript.status === "pending") {
    return (
      <div className="mt-2 rounded-lg bg-zinc-50 p-3 text-xs text-muted-foreground">
        Fetching transcript from GHL…
      </div>
    );
  }
  if (transcript.status === "failed") {
    return (
      <div className="mt-2 rounded-lg bg-zinc-50 p-3 text-xs text-muted-foreground">
        Transcript fetch failed — will retry automatically.
      </div>
    );
  }
  if (transcript.status === "not_available") {
    return (
      <div className="mt-2 rounded-lg bg-zinc-50 p-3 text-xs text-muted-foreground">
        No transcript for this call. GHL only transcribes calls with a
        usable two-way recording, so this is usually a no-answer, busy
        signal, voicemail, or call too brief to transcribe. If the call
        was substantive, GHL may still be processing — we&apos;ll check
        again for the next 24 hours.
      </div>
    );
  }

  // status === "available" from here on.
  const talkRatio = computeTalkRatio(
    transcript.setterTalkTimeSec,
    transcript.prospectTalkTimeSec,
  );

  return (
    <div className="mt-2 space-y-2">
      {/* Summary card */}
      <div className="rounded-lg bg-zinc-50 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Summary
        </div>
        {transcript.aiSummary ? (
          <div className="mt-2 whitespace-pre-line text-sm text-foreground leading-relaxed">
            {transcript.aiSummary}
          </div>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">
            Summary unavailable — will retry shortly.
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
            {transcript.setterSpeakerIndex !== undefined ? (
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
                <span className="text-[10px] text-muted-foreground">
                  (couldn&apos;t auto-identify who&apos;s who)
                </span>
              </>
            )}
          </div>
          {/* Visual bar */}
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
      {transcript.hasFullTranscript && (
        <div>
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showTranscript ? "▲ Hide full transcript" : "▼ Show full transcript"}
          </button>
          {showTranscript && (
            <LazyTranscriptLoader transcriptRowId={transcript.transcriptRowId} />
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
