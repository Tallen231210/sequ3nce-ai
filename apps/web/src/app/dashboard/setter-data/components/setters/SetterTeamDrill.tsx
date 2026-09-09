"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  closerName: string;
  title: string;
  eventName: string | null;
  lane: DrillSelection["lane"];
  attributedBy: string;
  credit: string[];
  dmPerson: string | null;
  token: string | null;
  touches: Array<{ name: string; kind: "dial" | "sms"; at: number; reached: boolean }>;
  verdict: { result: "showed" | "no_show" | "rescheduled" | "unknown"; source: "human" | "recording" | "calendar_color" | null; due: boolean };
  colour: string;
  leadInClose: boolean;
  isFollowUp: boolean;
}

const VERDICT_LABEL: Record<DrillRecord["verdict"]["result"], string> = {
  showed: "Showed",
  no_show: "No-show",
  rescheduled: "Rescheduled",
  unknown: "Unknown",
};
const SOURCE_LABEL: Record<string, string> = {
  human: "logged by the closer",
  recording: "from the recording",
  calendar_color: "from the calendar colour",
};
const BY_LABEL: Record<string, string> = {
  event_name: "booking link",
  tag: "initials on the title",
  crm_activity: "Close activity",
  hand_created: "hand-made event",
  none: "nothing to go on",
};

function matches(r: DrillRecord, s: DrillSelection): boolean {
  if (r.lane !== s.lane) return false;
  if (s.kind === "lane" || !s.id) return true;
  if (s.lane === "dm") return (r.dmPerson ?? "no name on the link") === s.id;
  if (s.lane === "self_booked_uncontacted") return r.closerName === s.name;
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
  const when = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const short = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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
        {rows.length === 0 && <p className="py-6 text-sm text-muted-foreground">No bookings in this range.</p>}
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.key} className="space-y-1 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-medium">{r.title}</span>
                  <span className="ml-2 text-muted-foreground">
                    {when.format(r.startTime)} · {r.closerName}
                  </span>
                  {r.isFollowUp && <span className="ml-2 text-xs text-muted-foreground">follow-up</span>}
                </div>
                <span className="text-xs">
                  <b className={r.verdict.result === "showed" ? "text-emerald-600" : r.verdict.result === "no_show" ? "text-rose-600" : "text-muted-foreground"}>
                    {VERDICT_LABEL[r.verdict.result]}
                  </b>
                  {r.verdict.source && <span className="ml-1 text-muted-foreground">({SOURCE_LABEL[r.verdict.source]})</span>}
                  {r.verdict.result === "unknown" && !r.verdict.due && <span className="ml-1 text-muted-foreground">(not due yet)</span>}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Link: {r.eventName ?? "none (hand-made)"} · Tag: {r.token ? `(${r.token})` : "none"} · Lead in Close: {r.leadInClose ? "yes" : "no"} · Calendar colour: {r.colour}
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">Credit: </span>
                {r.credit.length > 0 ? r.credit.join(", ") : r.dmPerson ?? "nobody"}
                <span className="text-muted-foreground"> · by {BY_LABEL[r.attributedBy] ?? r.attributedBy}</span>
              </div>
              {r.touches.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Close touches before the call:{" "}
                  {r.touches
                    .map((t) => `${t.name} ${t.kind === "dial" ? "called" : "texted"} ${short.format(t.at)}${t.reached ? " (reached)" : ""}`)
                    .join("; ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
