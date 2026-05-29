"use client";

import { useState } from "react";
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
import {
  Loader2,
  Phone,
  MessageSquare,
  CheckCircle2,
  UserPlus,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { CallEventDetailPanel } from "../CallEventDetailPanel";

interface LeadDrillPanelProps {
  leadId: Id<"setterLeads"> | null;
  onClose: () => void;
}

const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dial_outbound: Phone,
  call_inbound: Phone,
  sms_outbound: MessageSquare,
  sms_inbound: MessageSquare,
  connected: CheckCircle2,
  contact_assigned: UserPlus,
};

const EVENT_LABELS: Record<string, string> = {
  dial_outbound: "Outbound call",
  call_inbound: "Inbound call",
  sms_outbound: "SMS sent",
  sms_inbound: "SMS received",
  connected: "Connected (call ≥ threshold)",
  appointment_booked: "Appointment booked",
  appointment_status_change: "Appointment status changed",
  opportunity_stage_change: "Pipeline stage changed",
  contact_assigned: "Reassigned to setter",
};

export function LeadDrillPanel({ leadId, onClose }: LeadDrillPanelProps) {
  const { clerkId } = useTeam();
  const data = useQuery(
    api.setterData.getLeadActivity,
    leadId && clerkId ? { clerkId, leadId } : "skip",
  );
  // Track which events are expanded so the user can drill into multiple
  // calls' transcripts in sequence without each click collapsing the
  // last one.
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  function toggleEvent(eventId: string) {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  return (
    <Dialog open={leadId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lead activity</DialogTitle>
        </DialogHeader>

        {leadId && data === undefined && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* Lead summary */}
            <div className="rounded-md border border-border bg-muted/30 p-4">
              <div className="font-medium">{data.lead.name || "Unnamed lead"}</div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {data.lead.email && (
                  <div>
                    <span className="text-foreground">Email:</span> {data.lead.email}
                  </div>
                )}
                {data.lead.phone && (
                  <div>
                    <span className="text-foreground">Phone:</span> {data.lead.phone}
                  </div>
                )}
                {data.lead.assignedToName && (
                  <div>
                    <span className="text-foreground">Assigned:</span>{" "}
                    {data.lead.assignedToName}
                  </div>
                )}
                {data.lead.source && (
                  <div>
                    <span className="text-foreground">Source:</span> {data.lead.source}
                  </div>
                )}
                <div>
                  <span className="text-foreground">Added:</span>{" "}
                  {new Date(data.lead.dateAdded).toLocaleString()}
                </div>
                <div>
                  <span className="text-foreground">Dials:</span>{" "}
                  {data.lead.dialCount}
                </div>
              </div>
              {data.lead.tags && data.lead.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {data.lead.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Activity timeline */}
            <div>
              <div className="mb-2 text-sm font-semibold">Recent activity</div>
              {data.events.length === 0 ? (
                <div className="rounded-md bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  No activity yet on this lead.
                </div>
              ) : (
                <ul className="space-y-2">
                  {data.events.map((event) => {
                    const Icon = EVENT_ICONS[event.eventType] ?? Phone;
                    const isCallEvent =
                      event.eventType === "dial_outbound" ||
                      event.eventType === "call_inbound";
                    const isExpandable = isCallEvent && !!event.transcript;
                    const isExpanded = expandedEvents.has(event.eventId);
                    return (
                      <li
                        key={event.eventId}
                        className="rounded-md border border-border bg-card px-3 py-2.5 text-sm"
                      >
                        <button
                          type="button"
                          onClick={
                            isExpandable
                              ? () => toggleEvent(event.eventId)
                              : undefined
                          }
                          disabled={!isExpandable}
                          className={`flex w-full gap-3 text-left ${
                            isExpandable
                              ? "cursor-pointer"
                              : "cursor-default"
                          }`}
                        >
                          {isExpandable ? (
                            isExpanded ? (
                              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            )
                          ) : (
                            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">
                              {EVENT_LABELS[event.eventType] ?? event.eventType}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {new Date(event.occurredAt).toLocaleString()}
                              {event.setterName && ` · ${event.setterName}`}
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
                        </button>
                        {isExpandable && isExpanded && event.transcript && (
                          <CallEventDetailPanel transcript={event.transcript} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatCallDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${min}m` : `${min}m ${s}s`;
}
