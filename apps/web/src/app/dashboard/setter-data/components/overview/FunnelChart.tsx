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
    totalAppointments: number;
    totalShowed: number;
  };
}

/**
 * Four-stage funnel: Total leads → Connected → Appointments → Showed.
 * Each stage uses progressively lighter shades of the primary color so
 * the funnel "narrows" visually even when stage counts are similar.
 */
export function FunnelChart({ data }: FunnelChartProps) {
  const chartData = [
    {
      stage: "Total leads",
      count: data.totalLeads,
      fill: "hsl(var(--primary))",
    },
    {
      stage: "Connected",
      count: data.connectedLeads,
      fill: "hsl(var(--primary) / 0.78)",
    },
    {
      stage: "Appointments",
      count: data.totalAppointments,
      fill: "hsl(var(--primary) / 0.56)",
    },
    {
      stage: "Showed",
      count: data.totalShowed,
      fill: "hsl(var(--primary) / 0.34)",
    },
  ];

  return (
    <Card>
      <CardContent className="px-4 py-5">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h3 className="text-sm font-semibold">Funnel</h3>
            <p className="text-xs text-muted-foreground">
              Lead → Connect → Appointment → Show. Connect = call ≥ team
              threshold. Show counts only settled appointments (excludes
              upcoming Confirmed/Unconfirmed).
            </p>
          </div>
          {data.totalLeads > 0 && (
            <ConversionRates data={data} />
          )}
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 36, bottom: 4, left: 110 }}
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

/**
 * Three small conversion-rate badges across the top — connect rate,
 * connect-to-appointment rate, appointment-to-show rate. Helps managers
 * spot which stage is leaking without doing arithmetic in their head.
 */
function ConversionRates({ data }: FunnelChartProps) {
  const connectRate =
    data.totalLeads > 0 ? data.connectedLeads / data.totalLeads : null;
  const apptRate =
    data.connectedLeads > 0
      ? data.totalAppointments / data.connectedLeads
      : null;
  const showRate =
    data.totalAppointments > 0
      ? data.totalShowed / data.totalAppointments
      : null;

  return (
    <div className="hidden gap-4 text-xs sm:flex">
      <RateBadge label="Connect" rate={connectRate} />
      <RateBadge label="→ Appt" rate={apptRate} />
      <RateBadge label="→ Show" rate={showRate} />
    </div>
  );
}

function RateBadge({ label, rate }: { label: string; rate: number | null }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-sm font-semibold tabular-nums">
        {rate !== null ? `${Math.round(rate * 100)}%` : "—"}
      </div>
    </div>
  );
}
