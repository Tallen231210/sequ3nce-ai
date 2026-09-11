"use client";

// Finished calls with no outcome on record, by closer — the list to hand a
// closer and ask "what happened?". A verdict comes from the recording (the
// bot on the call) or the colour the closer sets on the calendar after it;
// each line says which of those is missing.

import type { BookingsData } from "../lib/cards";
import { humanDay } from "../lib/format";

type Rec = BookingsData["records"][number];

/** What we looked at, and what it failed to tell us — one plain sentence. */
function why(r: Rec): string {
  const rec = r.recorded ? "There is a recording, but it can't tell us who joined." : "Nothing recorded the call.";
  const colour = r.colour.startsWith("uncolored")
    ? "The calendar was never coloured after it."
    : r.colour.startsWith("no-show")
      ? `The calendar is red${r.colour.includes("set before the call") ? ", and it was red before the call started" : ""}, and this team also uses red for "didn't close".`
      : r.colour.includes("set before the call")
        ? "The calendar colour was set before the call started, so it says nothing about how it went."
        : r.colour.startsWith("left")
          ? "The calendar was left on its booking colour."
          : `The calendar says: ${r.colour}.`;
  return `${rec} ${colour}`;
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
        <h2 className="text-sm font-semibold">Did they show up? · {open.length}</h2>
        <p className="text-xs text-muted-foreground">These calls are over and nothing tells us whether the prospect turned up. Ask the closer, or let the bot into the next one.</p>
        <details className="mt-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">Why are these here?</summary>
          <p className="mt-1 max-w-3xl">
            Two things can answer the question: a recording with someone on it, or the closer colouring the call dark green or yellow after it finishes. Red calls are listed too,
            because this team uses red for &quot;didn&apos;t close&quot; as well as for a no-show, so red alone can&apos;t settle it. Letting the recording bot into a call answers
            it for good.
          </p>
        </details>
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
