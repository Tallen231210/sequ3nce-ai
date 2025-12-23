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
import { Users, AlertTriangle, Lightbulb } from "lucide-react";
import { formatCurrencyFull, formatPercent } from "@/lib/analytics-utils";
import type { Id } from "../../../convex/_generated/dataModel";

interface CloserData {
  closerId: Id<"closers">;
  closerName: string;
  pitched: number;
  closed: number;
  lost: number;
  closeRate: number;
  totalCalls: number;
  topObjection: string | null;
  topObjectionCount: number;
  topObjectionLostAmount: number;
}

interface WhoIsLosingProps {
  data: {
    breakdown: CloserData[];
    insights: string[];
  } | undefined;
  isLoading?: boolean;
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-40 bg-zinc-200 rounded animate-pulse" />
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

function getCloseRateColor(rate: number): string {
  if (rate >= 60) return "text-green-600";
  if (rate >= 40) return "text-yellow-600";
  return "text-red-600";
}

export function WhoIsLosing({ data, isLoading }: WhoIsLosingProps) {
  if (isLoading || !data) {
    return <LoadingSkeleton />;
  }

  if (data.breakdown.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Who's Losing Deals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 bg-zinc-100 rounded-full mb-3">
              <Users className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-muted-foreground">No closer data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Filter to only show closers with at least one call
  const activeClosers = data.breakdown.filter((c) => c.totalCalls > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Who's Losing Deals</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Insights callout */}
        {data.insights.length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
            {data.insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2 text-amber-700">
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
                <TableHead>Closer</TableHead>
                <TableHead className="text-right">Pitched</TableHead>
                <TableHead className="text-right">Closed</TableHead>
                <TableHead className="text-right">Lost</TableHead>
                <TableHead className="text-right">Close Rate</TableHead>
                <TableHead>Top Objection</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeClosers.map((closer) => (
                <TableRow key={closer.closerId}>
                  <TableCell className="font-medium">{closer.closerName}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyFull(closer.pitched)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyFull(closer.closed)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyFull(closer.lost)}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${getCloseRateColor(closer.closeRate)}`}>
                    {formatPercent(closer.closeRate)}
                  </TableCell>
                  <TableCell>
                    {closer.topObjection ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{closer.topObjection}</span>
                        {closer.topObjectionCount >= 3 && (
                          <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">
                            {closer.topObjectionCount}x
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
