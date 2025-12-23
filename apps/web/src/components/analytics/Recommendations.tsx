"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle2 } from "lucide-react";
import { getRecommendationCategoryColor } from "@/lib/analytics-utils";

interface Recommendation {
  category: string;
  message: string;
}

interface RecommendationsProps {
  data: Recommendation[] | undefined;
  isLoading?: boolean;
}

function LoadingSkeleton() {
  return (
    <Card className="border-2 border-zinc-200">
      <CardHeader>
        <div className="h-6 w-56 bg-zinc-200 rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-zinc-100 rounded animate-pulse" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function Recommendations({ data, isLoading }: RecommendationsProps) {
  if (isLoading || !data) {
    return <LoadingSkeleton />;
  }

  if (data.length === 0) {
    return (
      <Card className="border-2 border-green-200 bg-green-50/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">Actionable Recommendations</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 py-4">
            <div className="p-2 bg-green-100 rounded-full">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-green-700">Looking good!</p>
              <p className="text-sm text-green-600">
                No major issues detected. Keep up the great work.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-zinc-300">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-zinc-600" />
          <CardTitle className="text-lg">This Period's Focus Areas</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((rec, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 bg-zinc-50 rounded-lg border border-zinc-200"
            >
              <Badge
                variant="outline"
                className={`${getRecommendationCategoryColor(rec.category)} text-xs font-medium shrink-0`}
              >
                {rec.category}
              </Badge>
              <span className="text-sm">{rec.message}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
