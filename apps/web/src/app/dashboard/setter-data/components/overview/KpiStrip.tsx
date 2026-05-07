"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Phone, Clock, AlertCircle, CalendarCheck } from "lucide-react";

interface KpiStripData {
  totalLeads: number;
  connectedLeads: number;
  connectedRate: number | null;
  untouchedLeads: number;
  avgSpeedMs: number | null;
  p50SpeedMs: number | null;
  p90SpeedMs: number | null;
  // Phase 2 — appointment rollup
  totalAppointments: number;
  totalShowed: number;
  totalNoShow: number;
  showRate: number | null;
}

interface KpiStripProps {
  data: KpiStripData;
  onUntouchedClick?: () => void;
}

/**
 * Four-card KPI strip. Phase 2 swaps "Total leads" for a Show Rate card
 * since show rate is a top-tier setter metric and lead count is already
 * visible on the Connections card. Untouched is clickable → drills to
 * Leads tab pre-filtered.
 */
export function KpiStrip({ data, onUntouchedClick }: KpiStripProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard
        icon={Clock}
        label="Speed to lead (avg)"
        value={
          data.avgSpeedMs !== null ? formatDuration(data.avgSpeedMs) : "—"
        }
        sub={
          data.p50SpeedMs !== null
            ? `Median ${formatDuration(data.p50SpeedMs)}`
            : "No dialed leads"
        }
      />
      <KpiCard
        icon={Phone}
        label="Connections"
        value={`${data.connectedLeads} / ${data.totalLeads}`}
        sub={
          data.connectedRate !== null
            ? `${Math.round(data.connectedRate * 100)}% rate`
            : "—"
        }
      />
      <KpiCard
        icon={CalendarCheck}
        label="Show rate"
        value={
          data.showRate !== null ? `${Math.round(data.showRate * 100)}%` : "—"
        }
        sub={
          data.totalShowed + data.totalNoShow > 0
            ? `${data.totalShowed} of ${data.totalShowed + data.totalNoShow} settled`
            : data.totalAppointments > 0
              ? `${data.totalAppointments} booked, none settled yet`
              : "No appointments yet"
        }
      />
      <KpiCard
        icon={AlertCircle}
        label="Untouched"
        value={String(data.untouchedLeads)}
        sub={data.untouchedLeads > 0 ? "Tap to view →" : "All leads worked"}
        tone={data.untouchedLeads > 0 ? "warning" : "default"}
        onClick={data.untouchedLeads > 0 ? onUntouchedClick : undefined}
      />
    </div>
  );
}

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warning";
  onClick?: () => void;
}

function KpiCard({ icon: Icon, label, value, sub, tone, onClick }: KpiCardProps) {
  const isClickable = !!onClick;
  const isWarning = tone === "warning";

  return (
    <Card
      className={
        (isClickable
          ? "cursor-pointer transition-colors hover:bg-muted/30 "
          : "") + (isWarning ? "border-amber-500/40" : "")
      }
      onClick={onClick}
    >
      <CardContent className="px-4 py-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Icon className={`h-3.5 w-3.5 ${isWarning ? "text-amber-600 dark:text-amber-500" : ""}`} />
          {label}
        </div>
        <div
          className={
            "mt-2 text-2xl font-semibold tabular-nums " +
            (isWarning ? "text-amber-600 dark:text-amber-500" : "")
          }
        >
          {value}
        </div>
        {sub && (
          <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) {
    const s = sec % 60;
    return s === 0 ? `${min}m` : `${min}m ${s}s`;
  }
  const hours = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${hours}h` : `${hours}h ${m}m`;
}
