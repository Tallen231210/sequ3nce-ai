"use client";

interface OverviewTabProps {
  summary?: string;
  closerTalkTime?: number;
  prospectTalkTime?: number;
  outcome?: string;
}

export function OverviewTab({
  summary,
  closerTalkTime,
  prospectTalkTime,
  outcome,
}: OverviewTabProps) {
  const summaryFields = summary ? parseSummary(summary) : null;
  const talkTotal = (closerTalkTime || 0) + (prospectTalkTime || 0);
  const closerPercent =
    talkTotal > 0
      ? Math.round(((closerTalkTime || 0) / talkTotal) * 100)
      : null;

  const isEmpty = !summaryFields && closerPercent === null && !outcome;

  return (
    <div className="p-4 sm:p-5 space-y-5">
      {summaryFields && (
        <div>
          <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            AI Summary
          </h4>
          {/* Mobile: single column (full-width values). Tablet+: two columns. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {summaryFields.map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  {label}
                </p>
                <p className="text-sm text-zinc-700 break-words">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {closerPercent !== null && (
        <div>
          <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Talk-to-Listen Ratio
          </h4>
          {/* Stack on mobile so the bar gets full width; inline on tablet+. */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-zinc-900 rounded-full"
                style={{ width: `${closerPercent}%` }}
              />
            </div>
            <span className="text-xs text-zinc-500">
              Closer {closerPercent}% / Prospect {100 - closerPercent}%
            </span>
          </div>
        </div>
      )}

      {outcome && (
        <div>
          <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
            Outcome
          </h4>
          <span
            className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${outcomeClass(outcome)}`}
          >
            {formatOutcome(outcome)}
          </span>
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-zinc-400">No overview data available</p>
          <p className="text-xs text-zinc-300 mt-1">
            AI analysis is available for new calls
          </p>
        </div>
      )}
    </div>
  );
}

function outcomeClass(outcome: string): string {
  if (outcome === "closed") return "bg-green-50 text-green-700";
  if (outcome === "lost") return "bg-red-50 text-red-700";
  if (outcome === "follow_up") return "bg-amber-50 text-amber-700";
  return "bg-zinc-100 text-zinc-500";
}

function formatOutcome(outcome: string): string {
  if (outcome === "follow_up") return "Follow Up";
  return outcome.charAt(0).toUpperCase() + outcome.slice(1);
}

function parseSummary(summary: string): Array<{ label: string; value: string }> {
  // AI summary is formatted as "**Label:** value" bullet points
  const fields: Array<{ label: string; value: string }> = [];
  const lines = summary.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const match = line.match(/\*?\*?([^:*]+)\*?\*?:\s*(.+)/);
    if (match) {
      fields.push({
        label: match[1].replace(/[*-]/g, "").trim(),
        value: match[2].trim(),
      });
    } else if (line.trim()) {
      fields.push({
        label: "Summary",
        value: line.replace(/^[-*]\s*/, "").trim(),
      });
    }
  }
  return fields.length > 0 ? fields : [{ label: "Summary", value: summary }];
}
