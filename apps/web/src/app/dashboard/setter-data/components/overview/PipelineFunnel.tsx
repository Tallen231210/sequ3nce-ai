"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Cell,
} from "recharts";

interface PipelineStage {
  ghlStageId: string;
  name: string;
  position: number;
  count: number;
}

interface Pipeline {
  ghlPipelineId: string;
  name: string;
  totalOpen: number;
  totalValue: number;
  stages: PipelineStage[];
}

interface PipelineFunnelProps {
  pipelines: Pipeline[];
}

/**
 * Pipeline stage funnel for the Overview tab. Shows how many open
 * opportunities sit in each stage of the selected pipeline. Multiple
 * pipelines → renders a picker; single pipeline → renders directly.
 *
 * Bar widths are proportional to stage count, with progressively lighter
 * primary-color shades to communicate "later stage = closer to close."
 */
export function PipelineFunnel({ pipelines }: PipelineFunnelProps) {
  const [selectedId, setSelectedId] = useState<string>(
    pipelines[0]?.ghlPipelineId ?? "",
  );

  if (pipelines.length === 0) return null;

  const selected =
    pipelines.find((p) => p.ghlPipelineId === selectedId) ?? pipelines[0];

  const chartData = selected.stages.map((stage, idx) => ({
    name: stage.name,
    count: stage.count,
    // Lighter shades as we go further down the pipeline.
    fill: `hsl(var(--primary) / ${1 - (idx / Math.max(1, selected.stages.length - 1)) * 0.66})`,
  }));

  return (
    <Card>
      <CardContent className="px-4 py-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Pipeline funnel</h3>
            <p className="text-xs text-muted-foreground">
              Current open opportunities by stage. Won/lost/abandoned excluded.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {pipelines.length > 1 && (
              <Select value={selected.ghlPipelineId} onValueChange={setSelectedId}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.ghlPipelineId} value={p.ghlPipelineId}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Open value
              </div>
              <div className="font-mono text-sm font-semibold tabular-nums">
                {formatCurrency(selected.totalValue)}
              </div>
            </div>
          </div>
        </div>

        {selected.totalOpen === 0 ? (
          <div className="rounded-md bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            No open opportunities in {selected.name}.
          </div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 36, bottom: 4, left: 130 }}
              >
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={120}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number): string {
  if (value === 0) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}
