"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Phone, MessageSquare, CheckCircle2, CalendarCheck, Calendar } from "lucide-react";
import { WorkingHoursHeatmap } from "./WorkingHoursHeatmap";
import { SetterSourceMix } from "./SetterSourceMix";

interface SetterDrillPanelProps {
  ghlUserId: string | null;
  rangeStart: number;
  rangeEnd: number;
  onClose: () => void;
}

const STATUS_TONES: Record<string, "success" | "danger" | "default"> = {
  Showed: "success",
  "No Show": "danger",
  Confirmed: "default",
  Unconfirmed: "default",
  Cancelled: "default",
  Invalid: "default",
};

/**
 * Per-setter drilldown side panel. Reuses the Dialog primitive to match
 * the LeadDrillPanel pattern. Shows the setter's scorecard row, their
 * recent appointments (with status), their recent leads, and recent
 * dial activity.
 */
export function SetterDrillPanel({
  ghlUserId,
  rangeStart,
  rangeEnd,
  onClose,
}: SetterDrillPanelProps) {
  const { clerkId } = useTeam();
  const data = useQuery(
    api.setterData.getSetterDetail,
    ghlUserId && clerkId
      ? { clerkId, ghlUserId, rangeStart, rangeEnd }
      : "skip",
  );

  return (
    <Dialog open={ghlUserId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.setter.name ?? "Setter detail"}</DialogTitle>
        </DialogHeader>

        {ghlUserId && data === undefined && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && (
          <div className="space-y-5">
            {/* Setter info */}
            <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
              <div className="font-medium">{data.setter.name}</div>
              {data.setter.email && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {data.setter.email}
                </div>
              )}
              {data.setter.isActive === false && (
                <Badge variant="outline" className="mt-2 text-xs">
                  Inactive in GHL
                </Badge>
              )}
            </div>

            {/* Scorecard row stats */}
            {data.scorecardRow && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Leads" value={String(data.scorecardRow.leadCount)} />
                <Stat label="Dials" value={String(data.scorecardRow.dialCount)} />
                <Stat
                  label="Connect rate"
                  value={
                    data.scorecardRow.leadCount > 0
                      ? `${Math.round((data.scorecardRow.connectedCount / data.scorecardRow.leadCount) * 100)}%`
                      : "—"
                  }
                  sub={
                    data.scorecardRow.leadCount > 0
                      ? `${data.scorecardRow.connectedCount}/${data.scorecardRow.leadCount}`
                      : undefined
                  }
                />
                <Stat
                  label="Speed to lead"
                  value={
                    data.scorecardRow.avgSpeedMs !== null
                      ? formatDuration(data.scorecardRow.avgSpeedMs)
                      : "—"
                  }
                  sub="avg"
                />
                <Stat
                  label="Appointments"
                  value={String(data.scorecardRow.appointmentCount)}
                  sub={
                    data.scorecardRow.showedCount > 0
                      ? `${data.scorecardRow.showedCount} showed`
                      : undefined
                  }
                />
                <Stat
                  label="Show rate"
                  value={
                    data.scorecardRow.showRate !== null
                      ? `${Math.round(data.scorecardRow.showRate * 100)}%`
                      : "—"
                  }
                />
              </div>
            )}

            {/* Working hours heatmap */}
            {data.heatmap && (
              <WorkingHoursHeatmap
                heatmap={data.heatmap}
                timezone={data.timezone}
              />
            )}

            {/* Source attribution */}
            {data.sourceMix && data.sourceMix.length > 0 && (
              <SetterSourceMix rows={data.sourceMix} />
            )}

            {/* Recent appointments */}
            {data.appointments.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-semibold">
                  Recent appointments
                </div>
                <ul className="space-y-1.5">
                  {data.appointments.slice(0, 10).map((apt) => (
                    <li
                      key={apt.appointmentId}
                      className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
                    >
                      <CalendarCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-muted-foreground">
                          Booked {new Date(apt.bookedAt).toLocaleDateString()} ·
                          Scheduled {new Date(apt.startTime).toLocaleString()}
                        </div>
                      </div>
                      <StatusBadge status={apt.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recent dial events */}
            {data.events.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-semibold">Recent activity</div>
                <ul className="space-y-1.5">
                  {data.events.slice(0, 15).map((event) => {
                    const Icon = eventIcon(event.eventType);
                    return (
                      <li
                        key={event.eventId}
                        className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">
                            {eventLabel(event.eventType)}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {new Date(event.occurredAt).toLocaleString()}
                            {(event.details as { callDurationSec?: number })
                              ?.callDurationSec !== undefined && (
                              <>
                                {" "}
                                ·{" "}
                                {formatCallDuration(
                                  (event.details as { callDurationSec: number })
                                    .callDurationSec,
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {data.scorecardRow === null &&
              data.appointments.length === 0 &&
              data.events.length === 0 && (
                <div className="rounded-md bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                  No activity in this date range.
                </div>
              )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {sub && (
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? "default";
  if (tone === "success") {
    return (
      <Badge variant="outline" className="border-green-500/40 text-green-700 dark:text-green-400">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        {status}
      </Badge>
    );
  }
  if (tone === "danger") {
    return (
      <Badge variant="outline" className="border-destructive/40 text-destructive">
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {status}
    </Badge>
  );
}

function eventIcon(eventType: string): React.ComponentType<{ className?: string }> {
  if (eventType.startsWith("dial_") || eventType.startsWith("call_")) return Phone;
  if (eventType.startsWith("sms_")) return MessageSquare;
  if (eventType.startsWith("appointment")) return Calendar;
  if (eventType === "connected") return CheckCircle2;
  return Phone;
}

function eventLabel(eventType: string): string {
  switch (eventType) {
    case "dial_outbound":
      return "Outbound call";
    case "call_inbound":
      return "Inbound call";
    case "sms_outbound":
      return "SMS sent";
    case "sms_inbound":
      return "SMS received";
    case "connected":
      return "Connected";
    case "appointment_booked":
      return "Appointment booked";
    case "appointment_status_change":
      return "Appointment status changed";
    default:
      return eventType;
  }
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

function formatCallDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${min}m` : `${min}m ${s}s`;
}
