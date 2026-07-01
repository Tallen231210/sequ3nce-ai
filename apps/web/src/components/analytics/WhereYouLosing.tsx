"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrencyFull, getBarWidth } from "@/lib/analytics-utils";
import { TrendDelta } from "./primitives/TrendDelta";
import { MONO } from "./primitives/typography";
import { SectionNote } from "./primitives/SectionNote";
import { RecommendationCallout } from "./RecommendationCallout";
import type { Recommendation } from "@/lib/analytics-types";

interface ObjectionData {
  objection: string;
  objectionLabel: string;
  lostAmount: number;
  dealCount: number;
  trend: number;
}

interface WhereYouLosingProps {
  data: {
    objections: ObjectionData[];
    totalLost: number;
    totalDeals: number;
    problemAreas: string[];
  } | undefined;
  isLoading?: boolean;
  recommendation?: Recommendation | null;
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-44 animate-pulse rounded bg-zinc-100" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-zinc-100" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function WhereYouLosing({ data, isLoading, recommendation }: WhereYouLosingProps) {
  if (isLoading || !data) return <LoadingSkeleton />;

  if (data.objections.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold tracking-tight">
            Where deals are lost
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-10 text-center text-sm text-zinc-500">
            No lost deals in this period.
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxValue = Math.max(...data.objections.map((o) => o.lostAmount));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold tracking-tight">
            Where deals are lost
          </CardTitle>
          <span className={cn("text-xs text-zinc-400", MONO)}>
            {formatCurrencyFull(data.totalLost)} · {data.totalDeals} deals
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {data.problemAreas.length > 0 && (
          <SectionNote
            items={[`${data.problemAreas.join(" and ")} objections are trending up.`]}
          />
        )}

        <div className="space-y-3.5">
          {data.objections.map((objection) => (
            <div key={objection.objection}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{objection.objectionLabel}</span>
                <div className="flex items-center gap-3">
                  <span className="text-zinc-500">{objection.dealCount} deals</span>
                  <span className={cn("font-semibold", MONO)}>
                    {formatCurrencyFull(objection.lostAmount)}
                  </span>
                  <TrendDelta value={objection.trend} invert />
                </div>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-zinc-900"
                  style={{ width: `${getBarWidth(objection.lostAmount, maxValue)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <RecommendationCallout recommendation={recommendation} />
      </CardContent>
    </Card>
  );
}
