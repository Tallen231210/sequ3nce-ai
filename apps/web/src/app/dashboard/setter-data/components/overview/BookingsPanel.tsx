"use client";

import { Card, CardContent } from "@/components/ui/card";
import { CalendarCheck, Sparkles } from "lucide-react";

type BookingFlowType = "setter_drives" | "self_book" | "mixed" | "unknown";
type BookingFlowOverride = "auto" | "setter_drives" | "self_book" | "mixed";

interface BookingsData {
  source: "setterAppointments" | "calendarEvents" | "none";
  total: number;
  futureScheduled: number;
  medianTimeToBookMs: number | null;
  byDayOfWeek: number[];
  preCallQualificationRate: number | null;
  preCallQualifiedCount: number;
  perSetter: Array<{
    ghlUserId: string;
    name: string;
    bookingCount: number;
  }>;
  connectionsToBookingsRate: number | null;
  flowType: BookingFlowType;
  flowOverride: BookingFlowOverride;
  rangeClampedToDays?: number;
}

interface BookingsPanelProps {
  bookings: BookingsData;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Universal bookings panel. Surfaces what's happening (Tier 1) for every
 * team; layers attribution (Tier 2) only when the flow is setter-driven
 * or mixed. The pre-call qualification rate is the headline metric for
 * self-book teams — answers "what % of bookings did my setters reach
 * before the call?"
 */
export function BookingsPanel({ bookings }: BookingsPanelProps) {
  if (bookings.source === "none") {
    return (
      <Card>
        <CardContent className="px-4 py-5">
          <div className="mb-2">
            <h3 className="text-sm font-semibold">Bookings</h3>
          </div>
          <div className="rounded-md bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            Connect a closer&apos;s Google Calendar or start tracking
            appointments in GoHighLevel to populate bookings.
          </div>
        </CardContent>
      </Card>
    );
  }

  const showTier2 =
    bookings.flowType === "setter_drives" || bookings.flowType === "mixed";
  const peakDow = bookings.byDayOfWeek.reduce(
    (best, count, i) => (count > best.count ? { dow: i, count } : best),
    { dow: -1, count: 0 },
  );

  return (
    <Card>
      <CardContent className="px-4 py-5">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Bookings</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {flowDescription(bookings.flowType)}
            </p>
          </div>
          <FlowBadge
            flowType={bookings.flowType}
            isOverride={bookings.flowOverride !== "auto"}
          />
        </div>

        {/* Tier 1 stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={CalendarCheck}
            label="Total bookings"
            value={String(bookings.total)}
            sub={
              bookings.futureScheduled > 0
                ? `${bookings.futureScheduled} upcoming`
                : "in this range"
            }
          />
          <StatCard
            icon={Sparkles}
            label="Pre-call qual rate"
            value={
              bookings.preCallQualificationRate !== null
                ? `${Math.round(bookings.preCallQualificationRate * 100)}%`
                : "—"
            }
            sub={
              bookings.preCallQualificationRate !== null
                ? `${bookings.preCallQualifiedCount} of ${bookings.total} touched first`
                : "Setter touch tracking unavailable"
            }
            highlight={bookings.flowType === "self_book"}
          />
          <StatCard
            label="Median time-to-book"
            value={
              bookings.medianTimeToBookMs !== null
                ? formatDuration(bookings.medianTimeToBookMs)
                : "—"
            }
            sub="lead → booking"
          />
          <StatCard
            label="Peak booking day"
            value={peakDow.dow >= 0 ? DAY_LABELS[peakDow.dow] : "—"}
            sub={peakDow.count > 0 ? `${peakDow.count} bookings` : "—"}
          />
        </div>

        {/* By day of week mini bars */}
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Bookings by day of week
          </div>
          <div className="grid grid-cols-7 gap-2">
            {bookings.byDayOfWeek.map((count, i) => {
              const max = Math.max(...bookings.byDayOfWeek, 1);
              const heightPct = Math.round((count / max) * 100);
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="h-16 w-full rounded-sm bg-muted/30 relative overflow-hidden flex items-end">
                    <div
                      className="w-full bg-primary/70 transition-all"
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {DAY_LABELS[i]}
                  </div>
                  <div className="text-[10px] tabular-nums font-medium">
                    {count}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tier 2: per-setter + connection ratio (setter-driven flow only) */}
        {showTier2 && bookings.perSetter.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Bookings per setter
            </div>
            <div className="space-y-1.5">
              {bookings.perSetter.slice(0, 5).map((row) => (
                <div
                  key={row.ghlUserId}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{row.name}</span>
                  <span className="font-semibold tabular-nums">
                    {row.bookingCount}
                  </span>
                </div>
              ))}
            </div>
            {bookings.connectionsToBookingsRate !== null && (
              <div className="mt-3 text-xs text-muted-foreground">
                Connections → bookings:{" "}
                <span className="font-medium text-foreground">
                  {Math.round(bookings.connectionsToBookingsRate * 100)}%
                </span>
              </div>
            )}
          </div>
        )}

        {bookings.rangeClampedToDays !== undefined && (
          <div className="mt-3 text-[10px] text-muted-foreground">
            Showing last {bookings.rangeClampedToDays} days (date range was
            clamped for performance).
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FlowBadge({
  flowType,
  isOverride,
}: {
  flowType: BookingFlowType;
  isOverride: boolean;
}) {
  const label =
    flowType === "setter_drives"
      ? "Setter-driven"
      : flowType === "self_book"
        ? "Self-book"
        : flowType === "mixed"
          ? "Mixed"
          : "Detecting…";
  const tone =
    flowType === "setter_drives"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : flowType === "self_book"
        ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
        : flowType === "mixed"
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "bg-muted text-muted-foreground";
  return (
    <div
      className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium ${tone}`}
      title={
        isOverride
          ? "Flow set by admin override"
          : "Flow auto-detected from your team's data"
      }
    >
      Flow: {label}
      {isOverride && " (manual)"}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2.5 ${
        highlight ? "border-blue-500/40 bg-blue-500/5" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function flowDescription(flow: BookingFlowType): string {
  switch (flow) {
    case "setter_drives":
      return "Your setters dial first, then book. Per-setter attribution is shown below.";
    case "self_book":
      return "Prospects book before setters touch them. Pre-call qualification rate is the key metric.";
    case "mixed":
      return "Roughly half your bookings are setter-driven, half self-book. Both views shown.";
    default:
      return "Still learning your booking flow — needs ≥20 matched bookings to classify.";
  }
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const m = min % 60;
  if (hr < 24) return m === 0 ? `${hr}h` : `${hr}h ${m}m`;
  const days = Math.floor(hr / 24);
  const h = hr % 24;
  return h === 0 ? `${days}d` : `${days}d ${h}h`;
}
