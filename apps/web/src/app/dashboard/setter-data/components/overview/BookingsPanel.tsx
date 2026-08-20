"use client";

import { Card, CardContent } from "@/components/ui/card";
import { InsightCard, type PanelInsight } from "./InsightCard";
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

export interface AttendanceFunnelData {
  /** When Sequ3nce first witnessed a call for this team (null = never). */
  watchingSinceMs: number | null;
  peopleBooked: number;
  totalBookings: number;
  showed: number;
  noShowFinal: number;
  cancelledNeverRebooked: number;
  unverifiable: number;
  upcoming: number;
  rescheduledAtLeastOnce: number;
  rescheduledPct: number | null;
  truncated: boolean;
}

interface BookingsPanelProps {
  bookings: BookingsData;
  insight?: PanelInsight | null;
  /** Persisted attendance rollup — null for teams without the beta. */
  attendanceFunnel?: AttendanceFunnelData | null;
  /** Range start, so the funnel can flag slots that predate call-watching. */
  rangeStart?: number;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Universal bookings panel. Surfaces what's happening (Tier 1) for every
 * team; layers attribution (Tier 2) only when the flow is setter-driven
 * or mixed. The pre-call qualification rate is the headline metric for
 * self-book teams — answers "what % of bookings did my setters reach
 * before the call?"
 */
export function BookingsPanel({
  bookings,
  insight,
  attendanceFunnel,
  rangeStart,
}: BookingsPanelProps) {
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
          {/* People lead, bookings follow: 948 bookings can be 808 humans
              once rebooks are counted as the same person, and "how many
              prospects did we put on calendars" is the business question.
              Group-call attendees each count as a person, correctly. */}
          <StatCard
            icon={CalendarCheck}
            label="People booked"
            value={String(
              (bookings as any).uniquePeopleBooked ?? bookings.total,
            )}
            sub={
              ((bookings as any).uniquePeopleBooked ?? bookings.total) !==
              bookings.total
                ? `${bookings.total} bookings` +
                  (bookings.futureScheduled > 0
                    ? ` · ${bookings.futureScheduled} upcoming`
                    : "")
                : bookings.futureScheduled > 0
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

        {/* People funnel: what actually happened to everyone booked.
            Rendered only when persisted attendance verdicts exist (beta) —
            every other team's panel is unchanged. */}
        {attendanceFunnel && attendanceFunnel.peopleBooked > 0 && (
          <PeopleFunnelSection funnel={attendanceFunnel} rangeStart={rangeStart} />
        )}

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

        <InsightCard insight={insight ?? null} />
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

function PeopleFunnelSection({
  funnel,
  rangeStart,
}: {
  funnel: AttendanceFunnelData;
  rangeStart?: number;
}) {
  const watchNote =
    funnel.watchingSinceMs !== null &&
    rangeStart !== undefined &&
    rangeStart < funnel.watchingSinceMs
      ? new Date(funnel.watchingSinceMs).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : null;
  const settledPeople = funnel.showed + funnel.noShowFinal;
  const showRate =
    settledPeople > 0 ? Math.round((funnel.showed / settledPeople) * 100) : null;
  // Each bucket says how trustworthy it is and why, right on the card —
  // these five numbers have very different evidence behind them and the
  // reader shouldn't have to know that from memory.
  const buckets: Array<{
    label: string;
    value: number;
    tone: string;
    accuracy: string;
    tip: string;
  }> = [
    {
      label: "Showed",
      value: funnel.showed,
      tone: "text-emerald-700 dark:text-emerald-400",
      accuracy: "Proven — never estimated",
      tip: "Counted only when a call recording or a CRM status proves the prospect attended.",
    },
    {
      label: "No-showed",
      value: funnel.noShowFinal,
      tone: "text-rose-700 dark:text-rose-400",
      accuracy: "Proven — undercounted for now",
      tip: "Counted only when the notetaker watched the closer wait alone, the closer logged it, or the CRM was marked No Show. A no-show nobody witnessed sits in Unverifiable instead.",
    },
    {
      label: "Cancelled, never rebooked",
      value: funnel.cancelledNeverRebooked,
      tone: "text-amber-700 dark:text-amber-400",
      accuracy: "Exact — from your CRM",
      tip: "Every cancellation is recorded in your CRM. Counted here only when no rebook followed within 14 days — otherwise it counts as rescheduled.",
    },
    {
      label: "Upcoming",
      value: funnel.upcoming,
      tone: "text-foreground",
      accuracy: "Slot hasn't happened yet",
      tip: "Booked in this range, but the meeting time is still ahead (or too recent to judge).",
    },
    {
      label: "Unverifiable",
      value: funnel.unverifiable,
      tone: "text-muted-foreground",
      accuracy: "No witness either way",
      tip: "No notetaker in the meeting and nothing marked in the CRM — could be a show or a silent no-show. Never guessed, never counted in the show rate.",
    },
  ];
  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          People funnel
        </div>
        {showRate !== null && (
          <div
            className="text-xs text-muted-foreground"
            title="Showed ÷ (showed + no-showed). Only proven outcomes count — unverifiable slots are excluded, not assumed."
          >
            Show rate{" "}
            <span className="font-semibold text-foreground">{showRate}%</span>{" "}
            of {settledPeople} proven outcomes
          </div>
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Where each of the {funnel.peopleBooked} people who booked in this
        range ended up — including people whose only booking was later
        cancelled, judged at their final slot so a reschedule counts once.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {buckets.map((b) => (
          <div
            key={b.label}
            className="rounded-md border border-border bg-card px-3 py-2.5"
            title={b.tip}
          >
            <div className={`text-lg font-semibold tabular-nums ${b.tone}`}>
              {b.value}
            </div>
            <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
              {b.label}
            </div>
            <div className="mt-1 text-[9px] leading-snug text-muted-foreground/80">
              {b.accuracy}
            </div>
          </div>
        ))}
      </div>
      {funnel.rescheduledPct !== null && funnel.rescheduledAtLeastOnce > 0 && (
        <div className="mt-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {Math.round(funnel.rescheduledPct * 100)}%
          </span>{" "}
          rescheduled at least once ({funnel.rescheduledAtLeastOnce} of{" "}
          {funnel.peopleBooked}) — exact, from CRM cancellations followed by a
          rebook within 14 days
        </div>
      )}
      {watchNote && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          Sequ3nce joined its first call for this team on {watchNote} — slots
          before that can&apos;t earn call evidence and mostly read as
          unverifiable.
        </div>
      )}
      {funnel.truncated && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          Range too large to read fully — counts cover the first 8,000
          bookings. Narrow the range for exact numbers.
        </div>
      )}
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
