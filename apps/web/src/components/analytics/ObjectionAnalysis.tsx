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
import { Shield, CheckCircle, XCircle, Lightbulb, TrendingUp } from "lucide-react";
import { formatCurrency, getOvercomeRateColor, formatObjectionLabel } from "@/lib/analytics-utils";

interface ObjectionData {
  objection: string;
  objectionLabel: string;
  count: number;
  value: number;
  overcomeRate?: number | null;
}

interface ObjectionAnalysisProps {
  data: {
    lostObjections: ObjectionData[];
    overcomeObjections: Array<{
      objection: string;
      objectionLabel: string;
      count: number;
      value: number;
    }>;
    overcomeRates: Record<string, number>;
    totalLost: number;
    totalClosed: number;
    totalLostValue: number;
    totalClosedValue: number;
    insights: string[];
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
          <div className="h-24 bg-zinc-100 rounded animate-pulse" />
          <div className="h-32 bg-zinc-100 rounded animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

export function ObjectionAnalysis({ data, isLoading }: ObjectionAnalysisProps) {
  if (isLoading || !data) {
    return <LoadingSkeleton />;
  }

  const hasData = data.lostObjections.length > 0 || data.overcomeObjections.length > 0;

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Objection Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 bg-zinc-100 rounded-full mb-3">
              <Shield className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-muted-foreground">No objection data available yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Complete post-call forms to see real objection analysis
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
          <CardTitle className="text-lg">Objection Analysis</CardTitle>
          <span className="text-sm text-muted-foreground">
            From post-call forms
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Insights */}
        {data.insights.length > 0 && (
          <div className="space-y-2">
            {data.insights.map((insight, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg flex items-start gap-2 ${
                  insight.includes("well") || insight.includes("great") || insight.includes("smooth")
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

        {/* Two-column layout for lost vs overcome */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Lost deals by objection */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-red-100 rounded">
                <XCircle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <h3 className="font-medium text-sm">Lost To (Primary Objection)</h3>
                <p className="text-xs text-muted-foreground">
                  {data.totalLost} deals — {formatCurrency(data.totalLostValue)}
                </p>
              </div>
            </div>

            {data.lostObjections.length > 0 ? (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Objection</TableHead>
                      <TableHead className="text-right">Lost</TableHead>
                      <TableHead className="text-right">Overcome Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.lostObjections.slice(0, 5).map((obj) => (
                      <TableRow key={obj.objection}>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">{obj.objectionLabel}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatCurrency(obj.value)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{obj.count}</TableCell>
                        <TableCell className="text-right">
                          {obj.overcomeRate !== null && obj.overcomeRate !== undefined ? (
                            <Badge className={`${getOvercomeRateColor(obj.overcomeRate)} border`}>
                              {obj.overcomeRate}%
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-4 text-sm text-muted-foreground border rounded-lg">
                No lost deals with objections recorded
              </div>
            )}
          </div>

          {/* Overcome objections */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-green-100 rounded">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium text-sm">Overcame (Closed Deals)</h3>
                <p className="text-xs text-muted-foreground">
                  {data.totalClosed} deals — {formatCurrency(data.totalClosedValue)}
                </p>
              </div>
            </div>

            {data.overcomeObjections.length > 0 ? (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Objection Overcome</TableHead>
                      <TableHead className="text-right">Deals</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.overcomeObjections.slice(0, 5).map((obj) => (
                      <TableRow key={obj.objection}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{obj.objectionLabel}</span>
                            {obj.objection === "none" && (
                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                <TrendingUp className="h-3 w-3 mr-1" />
                                Great leads
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{obj.count}</TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          {formatCurrency(obj.value)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-4 text-sm text-muted-foreground border rounded-lg">
                No closed deals with objection data
              </div>
            )}
          </div>
        </div>

        {/* Overcome rate summary */}
        {Object.keys(data.overcomeRates).length > 0 && (
          <div className="pt-4 border-t">
            <h3 className="text-sm font-medium mb-3">Overcome Rate by Objection Type</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.overcomeRates)
                .sort(([, a], [, b]) => b - a)
                .map(([objection, rate]) => (
                  <Badge
                    key={objection}
                    className={`${getOvercomeRateColor(rate)} border px-3 py-1`}
                  >
                    {formatObjectionLabel(objection)}: {rate}%
                  </Badge>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
