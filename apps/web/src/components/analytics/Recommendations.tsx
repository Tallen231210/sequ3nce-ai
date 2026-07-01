"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Recommendation } from "@/lib/analytics-types";

/**
 * Top priorities digest — Step 2 of the Analytics revamp.
 *
 * A roll-up of the top 3 highest-severity inline recommendations computed by
 * `getAnalyticsRecommendations` and surfaced across the page in their section
 * callouts. The "give me the headline" view for a manager who doesn't want to
 * scan every section.
 *
 * Hides entirely (returns null) when no recommendations fire — we don't fake a
 * "looking good!" state, since the absence of recs isn't the same as
 * "everything's fine" (it may just be too quiet to recommend anything).
 */
interface RecommendationsProps {
  data: Recommendation[] | undefined;
  isLoading?: boolean;
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-48 animate-pulse rounded bg-zinc-100" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded bg-zinc-100" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const SEVERITY_DOT: Record<Recommendation["severity"], string> = {
  high: "bg-amber-500",
  medium: "bg-zinc-400",
  low: "bg-zinc-300",
};

export function Recommendations({ data, isLoading }: RecommendationsProps) {
  if (isLoading) return <LoadingSkeleton />;
  if (!data || data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold tracking-tight">
          Top priorities this week
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-zinc-100">
          {data.map((rec) => (
            <RecRow key={rec.id} rec={rec} />
          ))}
        </div>
        <p className="mt-4 text-xs text-zinc-400">
          The highest-severity findings across the sections above — open a section for the
          underlying data.
        </p>
      </CardContent>
    </Card>
  );
}

function RecRow({ rec }: { rec: Recommendation }) {
  const inner = (
    <div className="group -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-zinc-50">
      <span
        className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[rec.severity])}
        title={`${rec.severity} priority`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-900">{rec.headline}</p>
        {rec.detail && <p className="mt-0.5 text-xs text-zinc-500">{rec.detail}</p>}
      </div>
      {rec.action && (
        <ChevronRight className="h-4 w-4 shrink-0 self-center text-zinc-300 transition-colors group-hover:text-zinc-500" />
      )}
    </div>
  );

  if (rec.action) {
    return (
      <Link href={rec.action.href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
