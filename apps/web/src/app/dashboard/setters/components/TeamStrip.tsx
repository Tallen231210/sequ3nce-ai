"use client";

import type { BookingsData } from "../lib/cards";
import { int, money, pct } from "../lib/format";

/** One column per team type: what each team booked and how those calls went. */
export function TeamStrip({ strip, basis, notes = [] }: { strip: BookingsData["strip"]; basis: string; notes?: string[] }) {
  const rows: Array<{ label: string; hint: string; cell: (c: BookingsData["strip"][number]) => string }> = [
    { label: "Bookings", hint: "Calls in the range credited to this team", cell: (c) => int(c.bookings) },
    { label: "Showed", hint: "Proven shows", cell: (c) => int(c.showed) },
    { label: "No-show", hint: "Proven no-shows", cell: (c) => int(c.noShow) },
    { label: "Rescheduled", hint: "Moved to another time, so the call never happened in this range", cell: (c) => int(c.rescheduled) },
    { label: "Unknown", hint: "No evidence yet either way", cell: (c) => int(c.unknown) },
    { label: "Outcome known", hint: "Finished calls we can say showed or didn't, over all finished calls. Showed, no-show, rescheduled and unknown add up to that total.", cell: (c) => (c.due > 0 ? `${int(c.outcomeKnown)} of ${int(c.due)}` : "—") },
    { label: "Show rate", hint: "Showed over showed plus no-show — shown only when at least half the finished calls have an outcome", cell: (c) => (c.showRatePct === null && c.outcomeKnown > 0 ? "not enough outcomes" : pct(c.showRatePct)) },
    { label: "Closes", hint: "Taken calls logged closed, follow-ups included", cell: (c) => int(c.closes) },
    { label: "Cash", hint: "Cash collected on those closes", cell: (c) => money(c.cash) },
    { label: "Coverage", hint: "Self-booked funnel calls contacted over all of them", cell: (c) => (c.coverage ? `${pct(c.coverage.pct)} · ${c.coverage.contacted}/${c.coverage.newSelfBooks}` : "—") },
  ];
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold">By team</h2>
          <p className="text-xs text-muted-foreground">Who set the calls in this range, and how they went. Working hours: {basis}.</p>
          {notes.map((n) => (
            <p key={n} className="mt-0.5 text-xs text-muted-foreground">{n}</p>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2 font-medium" />
              {strip.map((c) => (
                <th key={c.team} className="px-5 py-2 text-right font-semibold normal-case tracking-normal text-foreground">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border last:border-b-0">
                <td className="px-5 py-2 text-muted-foreground" title={r.hint}>
                  {r.label}
                </td>
                {strip.map((c) => (
                  <td key={c.team} className="px-5 py-2 text-right">
                    {r.cell(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
