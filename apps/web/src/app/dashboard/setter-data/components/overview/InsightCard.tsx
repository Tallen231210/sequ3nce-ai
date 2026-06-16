"use client";

import { ArrowRight } from "lucide-react";

export interface PanelInsight {
  observation: string;
  recommendation: string;
}

interface InsightCardProps {
  insight: PanelInsight | null | undefined;
}

/**
 * Auto-generated insight card. Renders the "so what" layer under every
 * chart on the Setter Data dashboard: an observation reading the chart's
 * actual data for the selected range, plus one prescribed action.
 *
 * Returns null (renders nothing) when no insight is provided — typically
 * because the panel's data is below its sample-size gate. The chart's
 * existing subtitle still explains what the visual is.
 *
 * Pure monochrome to match the dashboard. Always visible — never
 * collapsed, never click-to-expand.
 */
export function InsightCard({ insight }: InsightCardProps) {
  if (!insight) return null;

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-3.5">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-900" />
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
          Insight
        </span>
      </div>
      <p className="text-[13px] text-zinc-700 leading-relaxed">
        {insight.observation}
      </p>
      <div className="mt-2 flex items-start gap-1.5">
        <ArrowRight
          className="h-3.5 w-3.5 text-zinc-900 mt-0.5 shrink-0"
          strokeWidth={2.5}
        />
        <p className="text-[13px] text-zinc-900 leading-relaxed font-medium">
          {insight.recommendation}
        </p>
      </div>
    </div>
  );
}
