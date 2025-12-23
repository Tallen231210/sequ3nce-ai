"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { formatCurrencyFull, getBarWidth } from "@/lib/analytics-utils";

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
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-48 bg-zinc-200 rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-32 bg-zinc-200 rounded animate-pulse" />
                <div className="h-4 w-24 bg-zinc-200 rounded animate-pulse" />
              </div>
              <div className="h-6 w-full bg-zinc-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function WhereYouLosing({ data, isLoading }: WhereYouLosingProps) {
  if (isLoading || !data) {
    return <LoadingSkeleton />;
  }

  if (data.objections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Where You're Losing Deals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 bg-zinc-100 rounded-full mb-3">
              <AlertTriangle className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-muted-foreground">No lost deals in this period</p>
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
          <CardTitle className="text-lg">Where You're Losing Deals</CardTitle>
          <div className="text-sm text-muted-foreground">
            {formatCurrencyFull(data.totalLost)} across {data.totalDeals} deals
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Problem areas callout */}
        {data.problemAreas.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">
                Focus area: {data.problemAreas.join(" and ")} objections are trending up
              </span>
            </div>
          </div>
        )}

        {/* Objection bars */}
        <div className="space-y-4">
          {data.objections.map((objection) => (
            <div key={objection.objection} className="space-y-1">
              {/* Label row */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{objection.objectionLabel}</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {objection.dealCount} deals
                  </span>
                  <span className="font-medium">
                    {formatCurrencyFull(objection.lostAmount)}
                  </span>
                  {/* Trend indicator */}
                  {objection.trend !== 0 && (
                    <span
                      className={`flex items-center gap-0.5 text-xs ${
                        objection.trend > 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {objection.trend > 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {Math.abs(objection.trend)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Bar */}
              <div className="h-6 bg-zinc-100 rounded-md overflow-hidden">
                <div
                  className="h-full bg-red-400 rounded-md transition-all duration-500"
                  style={{ width: `${getBarWidth(objection.lostAmount, maxValue)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
