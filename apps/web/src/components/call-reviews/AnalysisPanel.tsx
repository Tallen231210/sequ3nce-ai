"use client";

interface AnalysisDimension {
  score: string;
  summary: string;
}

interface CallAnalysis {
  chapters: { title: string; startTime: number; endTime: number; summary: string }[];
  analysis: {
    opening: AnalysisDimension;
    discovery: AnalysisDimension;
    presentation: AnalysisDimension;
    objectionHandling: AnalysisDimension;
    closing: AnalysisDimension;
  };
  callSequence: { phase: string; description: string }[];
  analyzedAt: number;
}

interface AnalysisPanelProps {
  callAnalysis: CallAnalysis | undefined;
}

export function AnalysisPanel({ callAnalysis }: AnalysisPanelProps) {
  if (!callAnalysis) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <div className="h-5 w-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Analysis pending...</span>
        <span className="text-xs text-muted-foreground">
          This usually takes a few seconds after the call ends
        </span>
      </div>
    );
  }

  const dimensions = [
    { key: "opening", label: "Opening", data: callAnalysis.analysis.opening },
    { key: "discovery", label: "Discovery", data: callAnalysis.analysis.discovery },
    { key: "presentation", label: "Presentation", data: callAnalysis.analysis.presentation },
    { key: "objectionHandling", label: "Objection Handling", data: callAnalysis.analysis.objectionHandling },
    { key: "closing", label: "Closing", data: callAnalysis.analysis.closing },
  ] as const;

  return (
    <div className="overflow-y-auto flex-1 p-4 space-y-6">
      {/* Sales Process Scores */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Sales Process Analysis
        </h4>
        <div className="space-y-2">
          {dimensions.map(({ key, label, data }) => (
            <ScoreCard key={key} label={label} score={data.score} summary={data.summary} />
          ))}
        </div>
      </div>

      {/* Call Flow */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Call Flow
        </h4>
        <div className="bg-zinc-50 rounded-lg p-3">
          <div className="space-y-2.5">
            {callAnalysis.callSequence.map((step, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="flex flex-col items-center shrink-0 mt-1.5">
                  <div className="w-2 h-2 rounded-full bg-zinc-400" />
                  {i < callAnalysis.callSequence.length - 1 && (
                    <div className="w-px h-4 bg-zinc-300 mt-0.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-foreground">{step.phase}</span>
                  <p className="text-xs text-muted-foreground leading-snug">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreCard({ label, score, summary }: { label: string; score: string; summary: string }) {
  const config = getScoreConfig(score);

  return (
    <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-lg">
      <div className="shrink-0 w-[130px]">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <div className="mt-1">
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
            style={{ color: config.color, backgroundColor: config.bg }}
          >
            {config.label}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed flex-1">{summary}</p>
    </div>
  );
}

function getScoreConfig(score: string): { label: string; color: string; bg: string } {
  switch (score.toLowerCase()) {
    case "strong":
      return { label: "Strong", color: "#17a034", bg: "#f0fdf0" };
    case "adequate":
      return { label: "Adequate", color: "#b45309", bg: "#fffbeb" };
    case "weak":
      return { label: "Weak", color: "#dc2626", bg: "#fef2f2" };
    default:
      return { label: score, color: "#808080", bg: "#f3f3f3" };
  }
}
