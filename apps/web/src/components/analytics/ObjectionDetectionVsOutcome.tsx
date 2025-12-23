"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shield, Lightbulb } from "lucide-react";
import { getOvercomeRateColor } from "@/lib/analytics-utils";

interface ObjectionOvercome {
  objection: string;
  objectionLabel: string;
  detectedCount: number;
  lostToCount: number;
  overcomeRate: number;
}

interface ObjectionDetectionVsOutcomeProps {
  data: {
    objections: ObjectionOvercome[];
    insights: string[];
  } | undefined;
  isLoading?: boolean;
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-64 bg-zinc-200 rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-zinc-100 rounded animate-pulse" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ObjectionDetectionVsOutcome({ data, isLoading }: ObjectionDetectionVsOutcomeProps) {
  if (isLoading || !data) {
    return <LoadingSkeleton />;
  }

  if (data.objections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Objection Detection vs Outcome</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 bg-zinc-100 rounded-full mb-3">
              <Shield className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-muted-foreground">No objection data available yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Objections will appear here as calls are analyzed
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Objection Detection vs Outcome</CardTitle>
          <span className="text-sm text-muted-foreground">
            Are objections being overcome?
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Insights */}
        {data.insights.length > 0 && (
          <div className="space-y-2">
            {data.insights.map((insight, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg flex items-start gap-2 ${
                  insight.includes("Good") || insight.includes("overcoming")
                    ? "bg-green-50 border border-green-200 text-green-700"
                    : "bg-amber-50 border border-amber-200 text-amber-700"
                }`}
              >
                <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span className="text-sm">{insight}</span>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Objection</TableHead>
                <TableHead className="text-right">Detected During Call</TableHead>
                <TableHead className="text-right">Was Primary Loss</TableHead>
                <TableHead className="text-right">Overcome Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.objections.map((obj) => (
                <TableRow key={obj.objection}>
                  <TableCell className="font-medium">{obj.objectionLabel}</TableCell>
                  <TableCell className="text-right">{obj.detectedCount} calls</TableCell>
                  <TableCell className="text-right">{obj.lostToCount} calls</TableCell>
                  <TableCell className="text-right">
                    <Badge className={`${getOvercomeRateColor(obj.overcomeRate)} border`}>
                      {obj.overcomeRate}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
