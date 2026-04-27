"use client";

interface CallAnalysis {
  chapters: Array<{
    title: string;
    startTime: number;
    endTime: number;
    summary: string;
  }>;
  analysis: {
    opening: { score: string; summary: string };
    discovery: { score: string; summary: string };
    presentation: { score: string; summary: string };
    objectionHandling: { score: string; summary: string };
    closing: { score: string; summary: string };
  };
  callSequence: Array<{ phase: string; description: string }>;
  analyzedAt: number;
}

interface AnalysisTabProps {
  callAnalysis?: CallAnalysis;
}

const DIMENSIONS = [
  "opening",
  "discovery",
  "presentation",
  "objectionHandling",
  "closing",
] as const;

export function AnalysisTab({ callAnalysis }: AnalysisTabProps) {
  if (!callAnalysis) {
    return (
      <div className="p-4 sm:p-5">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-zinc-400">No AI analysis available</p>
          <p className="text-xs text-zinc-300 mt-1">
            AI analysis is available for new calls
          </p>
        </div>
      </div>
    );
  }

  const { analysis, callSequence } = callAnalysis;

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
        Sales Process
      </h4>
      {DIMENSIONS.map((dim) => {
        const d = analysis[dim];
        return (
          <div key={dim} className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-zinc-700 capitalize">
                {dim === "objectionHandling" ? "Objection Handling" : dim}
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase shrink-0 ${scoreClass(d.score)}`}
              >
                {d.score}
              </span>
            </div>
            <p className="text-xs text-zinc-500">{d.summary}</p>
          </div>
        );
      })}

      {callSequence && callSequence.length > 0 && (
        <div className="pt-2">
          <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Call Flow
          </h4>
          <div className="space-y-2">
            {callSequence.map((step, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-zinc-300 mt-1.5" />
                  {i < callSequence.length - 1 && (
                    <div className="w-px flex-1 bg-zinc-200" />
                  )}
                </div>
                <div className="pb-3 min-w-0">
                  <p className="text-xs font-medium text-zinc-700">
                    {step.phase}
                  </p>
                  <p className="text-xs text-zinc-400 break-words">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function scoreClass(score: string): string {
  if (score === "strong") return "text-green-600 bg-green-50";
  if (score === "moderate") return "text-amber-600 bg-amber-50";
  return "text-red-600 bg-red-50";
}
