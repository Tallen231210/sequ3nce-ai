"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrencyFull, formatPercent } from "@/lib/analytics-utils";
import { MONO } from "./primitives/typography";
import { SectionNote } from "./primitives/SectionNote";
import { RecommendationCallout } from "./RecommendationCallout";
import type { Recommendation } from "@/lib/analytics-types";
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
  recommendation?: Recommendation | null;
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-40 animate-pulse rounded bg-zinc-100" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded bg-zinc-100" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Close rate carries a signal: emerald when strong, red when it needs
 * attention, zinc in the middle. This is one of the few places the tab
 * spends color on a per-row basis — a manager scanning for the weak closer
 * should have their eye pulled to it.
 */
function closeRateTone(rate: number): string {
  if (rate >= 60) return "text-emerald-600";
  if (rate < 40) return "text-red-600";
  return "text-zinc-700";
}

export function WhoIsLosing({ data, isLoading, recommendation }: WhoIsLosingProps) {
  if (isLoading || !data) return <LoadingSkeleton />;

  if (data.breakdown.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold tracking-tight">
            Who&apos;s losing deals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-10 text-center text-sm text-zinc-500">
            No closer data available.
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeClosers = data.breakdown.filter((c) => c.totalCalls > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold tracking-tight">
          Who&apos;s losing deals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {data.insights.length > 0 && <SectionNote items={data.insights} />}

        <div className="rounded-lg border border-zinc-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Closer</TableHead>
                <TableHead className="text-right">Pitched</TableHead>
                <TableHead className="text-right">Closed</TableHead>
                <TableHead className="text-right">Lost</TableHead>
                <TableHead className="text-right">Close rate</TableHead>
                <TableHead>Top objection</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeClosers.map((closer) => (
                <TableRow key={closer.closerId}>
                  <TableCell className="font-medium">{closer.closerName}</TableCell>
                  <TableCell className={cn("text-right", MONO)}>
                    {formatCurrencyFull(closer.pitched)}
                  </TableCell>
                  <TableCell className={cn("text-right", MONO)}>
                    {formatCurrencyFull(closer.closed)}
                  </TableCell>
                  <TableCell className={cn("text-right", MONO)}>
                    {formatCurrencyFull(closer.lost)}
                  </TableCell>
                  <TableCell
                    className={cn("text-right font-medium", MONO, closeRateTone(closer.closeRate))}
                  >
                    {formatPercent(closer.closeRate)}
                  </TableCell>
                  <TableCell>
                    {closer.topObjection ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{closer.topObjection}</span>
                        {closer.topObjectionCount >= 3 && (
                          <span
                            className={cn(
                              "rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500",
                              MONO,
                            )}
                          >
                            {closer.topObjectionCount}×
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <RecommendationCallout recommendation={recommendation} />
      </CardContent>
    </Card>
  );
}
