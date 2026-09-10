"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookingEvidenceList } from "../../../setters/components/BookingEvidenceList";

export interface DrillSelection {
  kind: "lane" | "person";
  lane: "dm" | "outbound" | "confirmation" | "self_booked_uncontacted" | "unattributed";
  id?: string;
  name: string;
}

interface DrillRecord {
  key: string;
  startTime: number;
  dayKey: string;
  bookedDayKey: string | null;
  bookedAtInferred: boolean;
  closerName: string;
  title: string;
  eventName: string | null;
  lane: DrillSelection["lane"];
  reason: string | null;
  attributedBy: string;
  credit: string[];
  dmPerson: string | null;
  token: string | null;
  touches: Array<{ name: string; kind: "dial" | "sms"; at: number; reached: boolean; afterBooking: boolean }>;
  verdict: { result: "showed" | "no_show" | "rescheduled" | "unknown"; source: "human" | "recording" | "calendar_color" | null; due: boolean };
  colour: string;
  leadInClose: boolean;
  isFollowUp: boolean;
}


function matches(r: DrillRecord, s: DrillSelection): boolean {
  if (r.lane !== s.lane) return false;
  if (s.kind === "lane" || !s.id) return true;
  if (s.lane === "dm") return (r.dmPerson ?? "no name on the link") === s.id;
  if (s.lane === "self_booked_uncontacted") return r.closerName === s.name;
  if (s.lane === "unattributed") return r.reason === s.id;
  return r.credit.includes(s.name);
}

/** One person's (or one lane's) bookings with the evidence behind each. */
export function SetterTeamDrill({
  selection,
  records,
  timezone,
  onClose,
}: {
  selection: DrillSelection | null;
  records: DrillRecord[];
  timezone: string;
  onClose: () => void;
}) {
  const rows = selection ? records.filter((r) => matches(r, selection)).sort((a, b) => b.startTime - a.startTime) : [];

  return (
    <Dialog open={selection !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {selection?.name ?? ""}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {rows.length} booking{rows.length === 1 ? "" : "s"}
            </span>
          </DialogTitle>
        </DialogHeader>
        <BookingEvidenceList rows={rows} timezone={timezone} />
      </DialogContent>
    </Dialog>
  );
}
