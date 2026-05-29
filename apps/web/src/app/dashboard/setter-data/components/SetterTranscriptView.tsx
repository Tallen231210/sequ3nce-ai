"use client";

/**
 * Per-sentence transcript renderer for GHL call transcripts. Adapted
 * from the closer-side TranscriptPanel.tsx in apps/web/src/components/
 * call-reviews/ but with setter/prospect labels instead of closer/
 * prospect.
 *
 * The transcript JSON shape from GHL:
 *   [
 *     { speaker: 0|1, transcript: "Hello.", startTime: 3.52, endTime: 4.16, ... },
 *     ...
 *   ]
 *
 * Speaker identification is handled outside this component — if
 * `setterSpeakerIndex` is null, we show generic Speaker A/B labels
 * (visually distinct still, just not role-labeled).
 */

interface GhlTranscriptSentence {
  speaker?: number;
  transcript?: string;
  startTime?: number;
  endTime?: number;
}

interface SetterTranscriptViewProps {
  transcriptJson: string;
  setterSpeakerIndex: 0 | 1 | null;
}

export function SetterTranscriptView({
  transcriptJson,
  setterSpeakerIndex,
}: SetterTranscriptViewProps) {
  const sentences = parseTranscript(transcriptJson);
  if (sentences.length === 0) {
    return (
      <div className="mt-2 rounded-lg bg-zinc-50 p-3 text-xs text-muted-foreground">
        Transcript is empty.
      </div>
    );
  }

  return (
    <div className="mt-2 max-h-[400px] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3 space-y-2">
      {sentences.map((s, idx) => {
        const isSetter =
          setterSpeakerIndex !== null && s.speaker === setterSpeakerIndex;
        const isProspect =
          setterSpeakerIndex !== null && s.speaker !== setterSpeakerIndex;

        const label =
          setterSpeakerIndex === null
            ? `Speaker ${s.speaker === 0 ? "A" : "B"}`
            : isSetter
              ? "Setter"
              : "Prospect";

        const labelColor =
          setterSpeakerIndex === null
            ? "text-zinc-500"
            : isSetter
              ? "text-emerald-600"
              : isProspect
                ? "text-blue-600"
                : "text-zinc-500";

        return (
          <div key={idx} className="rounded-md p-2 text-sm hover:bg-zinc-50">
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${labelColor}`}
              >
                {label}
              </span>
              {typeof s.startTime === "number" && (
                <span className="text-[10px] text-muted-foreground">
                  {formatTime(s.startTime)}
                </span>
              )}
            </div>
            <p className="text-foreground leading-relaxed">{s.transcript}</p>
          </div>
        );
      })}
    </div>
  );
}

function parseTranscript(json: string): GhlTranscriptSentence[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s) => s && typeof s === "object" && typeof s.transcript === "string",
    );
  } catch {
    return [];
  }
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
