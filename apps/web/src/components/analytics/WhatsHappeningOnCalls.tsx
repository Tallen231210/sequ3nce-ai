"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Clock, UserCheck, Heart, Lightbulb } from "lucide-react";

interface DetectionMetric {
  detectionRate: number;
  closeRateWith: number;
  closeRateWithout: number;
}

interface WhatsHappeningProps {
  data: {
    budget: DetectionMetric;
    timeline: DetectionMetric;
    decisionMaker: DetectionMetric;
    spouse: DetectionMetric;
    insights: string[];
  } | undefined;
  isLoading?: boolean;
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-56 bg-zinc-200 rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-zinc-100 rounded animate-pulse" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  detectionRate: number;
  closeRateWith: number;
  closeRateWithout: number;
}

function MetricCard({ icon: Icon, label, detectionRate, closeRateWith, closeRateWithout }: MetricCardProps) {
  const difference = closeRateWith - closeRateWithout;
  const hasPositiveCorrelation = difference > 5;
  const isLowDetection = detectionRate < 50;

  return (
    <div className={`p-4 border rounded-lg ${isLowDetection && hasPositiveCorrelation ? "border-amber-300 bg-amber-50/50" : ""}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-zinc-100 rounded">
          <Icon className="h-4 w-4 text-zinc-600" />
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>

      {/* Detection rate */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Discussed on</span>
          <span className={`text-sm font-semibold ${isLowDetection ? "text-amber-600" : "text-green-600"}`}>
            {detectionRate}% of calls
          </span>
        </div>
        <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isLowDetection ? "bg-amber-500" : "bg-green-500"}`}
            style={{ width: `${detectionRate}%` }}
          />
        </div>
      </div>

      {/* Correlation */}
      <div className="text-xs text-muted-foreground">
        <span className={hasPositiveCorrelation ? "text-green-600 font-medium" : ""}>
          {closeRateWith}% close rate
        </span>
        {" when discussed vs "}
        <span className={hasPositiveCorrelation ? "text-red-600" : ""}>
          {closeRateWithout}%
        </span>
        {" without"}
      </div>
    </div>
  );
}

export function WhatsHappeningOnCalls({ data, isLoading }: WhatsHappeningProps) {
  if (isLoading || !data) {
    return <LoadingSkeleton />;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">What's Happening on Calls</CardTitle>
          <span className="text-sm text-muted-foreground">
            AI Detection Insights
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Insights callout */}
        {data.insights.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
            {data.insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2 text-amber-700">
                <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span className="text-sm">{insight}</span>
              </div>
            ))}
          </div>
        )}

        {/* Metric cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <MetricCard
            icon={DollarSign}
            label="Budget Discussed"
            detectionRate={data.budget.detectionRate}
            closeRateWith={data.budget.closeRateWith}
            closeRateWithout={data.budget.closeRateWithout}
          />
          <MetricCard
            icon={Clock}
            label="Timeline/Urgency Uncovered"
            detectionRate={data.timeline.detectionRate}
            closeRateWith={data.timeline.closeRateWith}
            closeRateWithout={data.timeline.closeRateWithout}
          />
          <MetricCard
            icon={UserCheck}
            label="Decision Maker Clarified"
            detectionRate={data.decisionMaker.detectionRate}
            closeRateWith={data.decisionMaker.closeRateWith}
            closeRateWithout={data.decisionMaker.closeRateWithout}
          />
          <MetricCard
            icon={Heart}
            label="Spouse/Partner Mentioned"
            detectionRate={data.spouse.detectionRate}
            closeRateWith={data.spouse.closeRateWith}
            closeRateWithout={data.spouse.closeRateWithout}
          />
        </div>
      </CardContent>
    </Card>
  );
}
