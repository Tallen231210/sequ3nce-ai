"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, CheckCircle2, ChevronRight } from "lucide-react";
import type { Recommendation } from "@/lib/analytics-types";

/**
 * Top-3 Priorities digest — Step 2 of the Analytics revamp.
 *
 * Previously a list of generic recommendations from the old `getRecommendations`
 * query. Now a roll-up of the top 3 highest-severity inline recommendations
 * computed by `getAnalyticsRecommendations` and surfaced across the page in
 * their respective section callouts. Acts as the "give me the headline" view
 * for a manager who doesn't want to scan every section.
 *
 * Hides entirely (returns null) when no recommendations fire across the page —
 * we don't want to fake an empty "looking good!" state if the page is
 * genuinely too quiet to recommend anything.
 */
interface RecommendationsProps {
  data: Recommendation[] | undefined;
  isLoading?: boolean;
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-56 bg-zinc-200 rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-zinc-100 rounded animate-pulse" />
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

  // No recs at all → hide section entirely. Don't render a "looking good"
  // empty state — Analytics is for managers who are looking for *what to do*,
  // and the absence of recommendations isn't the same as "everything's fine."
  // It could just mean we don't have enough data to recommend anything yet.
  if (!data || data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-zinc-600" />
          <CardTitle className="text-lg">Top priorities this week</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {data.map((rec) => (
            <RecRow key={rec.id} rec={rec} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Pulled from the highest-severity findings across the sections above —
          jump to a section for the underlying data.
        </p>
      </CardContent>
    </Card>
  );
}

function RecRow({ rec }: { rec: Recommendation }) {
  const inner = (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:border-zinc-200 hover:bg-zinc-50 transition-colors">
      <div
        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[rec.severity]}`}
        title={`${rec.severity} priority`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">{rec.headline}</p>
        {rec.detail && (
          <p className="text-xs text-muted-foreground mt-0.5">{rec.detail}</p>
        )}
      </div>
      {rec.action && (
        <ChevronRight className="h-4 w-4 text-zinc-300 shrink-0 self-center" />
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

/**
 * Replaces the empty-state "Looking good!" celebration card from the old
 * implementation. Kept as a named export in case anywhere else in the app
 * still wants to surface that vibe — but the inline recs flow doesn't use it.
 */
export function RecommendationsLookingGood() {
  return (
    <Card className="border-2 border-green-200 bg-green-50/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-green-600" />
          <CardTitle className="text-lg">All quiet this period</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 py-4">
          <div className="p-2 bg-green-100 rounded-full">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="font-medium text-green-700">No major issues detected.</p>
            <p className="text-sm text-green-600">
              Either it's a clean week or there's not enough data to recommend
              anything specific yet.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
