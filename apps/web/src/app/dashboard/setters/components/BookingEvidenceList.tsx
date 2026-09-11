"use client";

// One booking per row with the evidence behind it: when, who, the verdict
// and its source, the booking link and tag, the Close touches. Shared by the
// old lane drill and the Setters page drawer — one rendering of the truth.

export interface EvidenceRecord {
  key: string;
  startTime: number;
  bookedDayKey: string | null;
  bookedAtInferred: boolean;
  closerName: string;
  title: string;
  eventName: string | null;
  attributedBy: string;
  credit: string[];
  dmPerson: string | null;
  token: string | null;
  touches: Array<{ name: string; kind: "dial" | "sms"; at: number; reached: boolean; afterBooking: boolean }>;
  verdict: { result: "showed" | "no_show" | "rescheduled" | "unknown"; source: "human" | "recording" | "calendar_color" | null; due: boolean };
  colour: string;
  leadInClose: boolean;
  isFollowUp: boolean;
  closed?: boolean;
  cash?: number;
}

const VERDICT_LABEL: Record<EvidenceRecord["verdict"]["result"], string> = {
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
  event_name: "the name in the booking link",
  tag: "the initials on the title",
  crm_activity: "their calls and texts in Close",
  hand_created: "a hand-typed calendar entry",
  none: "nothing to go on",
};

export function BookingEvidenceList({ rows, timezone }: { rows: EvidenceRecord[]; timezone: string }) {
  const when = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const short = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const bookedLabel = (r: EvidenceRecord) => {
    if (!r.bookedDayKey) return "an unknown day";
    const [y, m, d] = r.bookedDayKey.split("-").map(Number);
    const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return r.bookedAtInferred ? `about ${day}` : day;
  };
  if (rows.length === 0) return <p className="py-6 text-sm text-muted-foreground">No bookings in this range.</p>;
  return (
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
              {r.closed && <span className="ml-2 text-xs font-medium text-emerald-700">closed{r.cash ? ` · $${Math.round(r.cash).toLocaleString("en-US")}` : ""}</span>}
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
            Booked {bookedLabel(r)}
            {r.eventName ? ` through the "${r.eventName}" link` : " by hand on the calendar"}. Counts for{" "}
            <span className="text-foreground">{r.credit.length > 0 ? r.credit.join(", ") : (r.dmPerson ?? "nobody")}</span>, from {BY_LABEL[r.attributedBy] ?? r.attributedBy}.
          </div>
          {r.touches.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Before the call:{" "}
              {r.touches
                .map(
                  (t) =>
                    `${t.name} ${t.kind === "dial" ? "called" : "texted"} ${short.format(t.at)}${t.reached ? ", got through" : ""}${t.afterBooking ? "" : ", before they booked"}`,
                )
                .join("; ")}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
