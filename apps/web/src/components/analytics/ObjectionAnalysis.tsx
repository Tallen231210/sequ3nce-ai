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
import { formatCurrency, formatObjectionLabel } from "@/lib/analytics-utils";
import { MONO } from "./primitives/typography";
import { SectionNote } from "./primitives/SectionNote";

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

/** Overcome rate is monochrome by default; emerald only when genuinely strong. */
function rateTone(rate: number): string {
  return rate >= 70 ? "text-emerald-600" : "text-zinc-700";
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-40 animate-pulse rounded bg-zinc-100" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded bg-zinc-100" />
          <div className="h-32 animate-pulse rounded bg-zinc-100" />
        </div>
      </CardContent>
    </Card>
  );
}

export function ObjectionAnalysis({ data, isLoading }: ObjectionAnalysisProps) {
  if (isLoading || !data) return <LoadingSkeleton />;

  const hasData =
    data.lostObjections.length > 0 || data.overcomeObjections.length > 0;

  if (!hasData) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold tracking-tight">
            Objection analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-sm font-medium text-zinc-700">No objection data yet</p>
            <p className="mt-1 text-xs text-zinc-500">
              Complete post-call forms to see objection analysis.
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
          <CardTitle className="text-sm font-semibold tracking-tight">
            Objection analysis
          </CardTitle>
          <span className="text-xs text-zinc-400">From post-call forms</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {data.insights.length > 0 && <SectionNote items={data.insights} />}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Lost to objection */}
          <div>
            <ColumnHeader
              title="Lost to objection"
              caption={`${data.totalLost} deals · ${formatCurrency(data.totalLostValue)}`}
            />
            {data.lostObjections.length > 0 ? (
              <div className="rounded-lg border border-zinc-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Objection</TableHead>
                      <TableHead className="text-right">Lost</TableHead>
                      <TableHead className="text-right">Overcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.lostObjections.slice(0, 5).map((obj) => (
                      <TableRow key={obj.objection}>
                        <TableCell>
                          <div className="font-medium text-sm">{obj.objectionLabel}</div>
                          <div className={cn("text-xs text-zinc-500", MONO)}>
                            {formatCurrency(obj.value)}
                          </div>
                        </TableCell>
                        <TableCell className={cn("text-right", MONO)}>{obj.count}</TableCell>
                        <TableCell className="text-right">
                          {obj.overcomeRate !== null && obj.overcomeRate !== undefined ? (
                            <span
                              className={cn("text-sm font-medium", MONO, rateTone(obj.overcomeRate))}
                            >
                              {obj.overcomeRate}%
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyRow>No lost deals with objections recorded</EmptyRow>
            )}
          </div>

          {/* Overcame */}
          <div>
            <ColumnHeader
              title="Overcame"
              caption={`${data.totalClosed} deals · ${formatCurrency(data.totalClosedValue)}`}
            />
            {data.overcomeObjections.length > 0 ? (
              <div className="rounded-lg border border-zinc-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Objection overcome</TableHead>
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
                              <span className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                                Great leads
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className={cn("text-right", MONO)}>{obj.count}</TableCell>
                        <TableCell className={cn("text-right font-medium", MONO)}>
                          {formatCurrency(obj.value)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyRow>No closed deals with objection data</EmptyRow>
            )}
          </div>
        </div>

        {/* Overcome rate by type — muted chips, emerald only for strong rates */}
        {Object.keys(data.overcomeRates).length > 0 && (
          <div className="border-t border-zinc-100 pt-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
              Overcome rate by objection type
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(data.overcomeRates)
                .sort(([, a], [, b]) => b - a)
                .map(([objection, rate]) => (
                  <span
                    key={objection}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1 text-xs"
                  >
                    <span className="text-zinc-600">{formatObjectionLabel(objection)}</span>
                    <span className={cn("font-medium", MONO, rateTone(rate))}>{rate}%</span>
                  </span>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ColumnHeader({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className={cn("text-xs text-zinc-500", MONO)}>{caption}</p>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 py-6 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}
