"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Cell,
} from "recharts";

interface FunnelChartProps {
  data: {
    totalLeads: number;
    connectedLeads: number;
  };
}

/**
 * Phase 1 funnel — just lead count → connected count. Phase 2 expands
 * this to a proper four-stage funnel (dial → connect → appt → showed)
 * once appointment data is in scope.
 */
export function FunnelChart({ data }: FunnelChartProps) {
  const chartData = [
    { stage: "Total leads", count: data.totalLeads, fill: "hsl(var(--primary))" },
    {
      stage: "Connected",
      count: data.connectedLeads,
      fill: "hsl(var(--primary) / 0.6)",
    },
  ];

  return (
    <Card>
      <CardContent className="px-4 py-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Funnel</h3>
          <p className="text-xs text-muted-foreground">
            Total leads → Connected (call ≥ threshold). Phase 2 will add
            Appointments → Show.
          </p>
        </div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 24, bottom: 4, left: 100 }}
            >
              <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis
                type="category"
                dataKey="stage"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
