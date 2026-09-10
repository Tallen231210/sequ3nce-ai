"use client";

// Finished calls with no outcome on record, by closer — the list to hand a
// closer and ask "what happened?". A verdict comes from the recording (the
// bot on the call) or the colour the closer sets on the calendar after it;
// each line says which of those is missing.

import type { BookingsData } from "../lib/cards";
import { humanDay } from "../lib/format";

type Rec = BookingsData["records"][number];

function why(r: Rec): string {
  const rec = r.recorded ? "recording found but it couldn't tell" : "no recording";
  const colour = r.colour.startsWith("uncolored")
    ? "calendar not coloured"
    : r.colour.startsWith("no-show")
      ? `calendar red${r.colour.includes("set before the call") ? ", set before the call" : ""} — red isn't read as a no-show while it also means "didn't close"; a recording would settle it`
      : r.colour.includes("set before the call")
        ? `calendar ${r.colour}`
        : r.colour.startsWith("left")
          ? `calendar ${r.colour} (not a post-call colour)`
          : `calendar: ${r.colour}`;
  return `${rec} · ${colour}`;
}

export function NoOutcomePanel({ records, timezone }: { records: Rec[]; timezone: string }) {
  const open = records.filter((r) => !r.isFollowUp && r.verdict.due && r.verdict.result === "unknown");
  if (open.length === 0) return null;
  const byCloser = new Map<string, Rec[]>();
  for (const r of open) byCloser.set(r.closerName, [...(byCloser.get(r.closerName) ?? []), r]);
  const closers = Array.from(byCloser.entries()).sort((a, b) => b[1].length - a[1].length);
  const when = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone });
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold">Calls with no outcome · {open.length}</h2>
        <p className="text-xs text-muted-foreground">
          Finished calls where nothing says whether the prospect showed: no recording that could tell, and no dark green or yellow on the calendar after the call. Red is listed here too, because this team uses red for &quot;didn&apos;t close&quot; as well as no-show, so only a recording can settle a red call. The bot being on the call clears a line for good.
        </p>
      </div>
      <div className="px-5 py-2">
        {closers.map(([closer, rows]) => (
          <div key={closer} className="py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {closer} · {rows.length}
            </h3>
            <ul>
              {rows
                .slice()
                .sort((a, b) => b.startTime - a.startTime)
                .map((r) => (
                  <li key={r.key} className="border-b border-border/60 py-2 text-sm last:border-b-0">
                    <span className="font-medium">{r.title}</span>
                    <span className="text-muted-foreground"> · {humanDay(r.dayKey)} {when(r.startTime)}</span>
                    <span className="block text-xs text-muted-foreground">{why(r)}</span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
