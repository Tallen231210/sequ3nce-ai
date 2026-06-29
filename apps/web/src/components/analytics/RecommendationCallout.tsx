"use client";

import Link from "next/link";
import { Lightbulb, ChevronRight } from "lucide-react";
import type { Recommendation } from "@/lib/analytics-types";

/**
 * Inline recommendation callout — sits at the bottom of an Analytics section
 * card. Three severity variants:
 *   - high   → amber-50 background, amber-200 left border (urgent, not error)
 *   - medium → zinc-50 background, no border accent
 *   - low    → plain inline text (no card treatment) for soft suggestions
 *
 * Renders null (no DOM at all) when `recommendation` is null/undefined so the
 * parent section card collapses cleanly without an empty placeholder.
 */
interface Props {
  recommendation: Recommendation | null | undefined;
  className?: string;
}

const STYLES: Record<"high" | "medium" | "low", string> = {
  high: "bg-amber-50 border-l-4 border-amber-300 px-3 py-2.5 rounded-r-md",
  medium: "bg-zinc-50 border border-zinc-200 px-3 py-2.5 rounded-md",
  low: "text-zinc-600 px-1 py-1",
};

const TEXT: Record<"high" | "medium" | "low", string> = {
  high: "text-amber-900",
  medium: "text-zinc-700",
  low: "text-zinc-600 italic",
};

const ICON: Record<"high" | "medium" | "low", string> = {
  high: "text-amber-600",
  medium: "text-zinc-500",
  low: "text-zinc-400",
};

export function RecommendationCallout({ recommendation, className }: Props) {
  if (!recommendation) return null;
  const { severity, headline, detail, action } = recommendation;

  return (
    <div
      className={`${STYLES[severity]} ${className ?? ""} flex items-start gap-2.5 mt-3`}
      role="note"
    >
      <Lightbulb className={`h-4 w-4 mt-0.5 shrink-0 ${ICON[severity]}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${TEXT[severity]}`}>{headline}</p>
        {detail && (
          <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
        )}
        {action && (
          <Link
            href={action.href}
            className={`inline-flex items-center gap-0.5 text-xs font-medium mt-1.5 ${
              severity === "high"
                ? "text-amber-700 hover:text-amber-900"
                : "text-zinc-700 hover:text-zinc-900"
            }`}
          >
            {action.label}
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}
