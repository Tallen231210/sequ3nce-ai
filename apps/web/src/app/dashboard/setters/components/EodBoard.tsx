"use client";

// The filed EODs, one column per day, one row per setter — what the old
// Setter EODs tab showed, now on the Setters page for the same range. A
// cell carries the setter's own numbers; an amber mark means the
// cross-check found the day off against Close or the calendar (open the
// setter's card, EOD tab, for both numbers).

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { CrossCheckData } from "../lib/cards";

export function EodBoard({ clerkId, rangeStart, rangeEnd, checks }: { clerkId: string; rangeStart: number; rangeEnd: number; checks: CrossCheckData | null | undefined }) {
  const board = useQuery(api.setterEod.getEodBoard, { clerkId, rangeStartMs: rangeStart, rangeEndMs: rangeEnd });
  const flagsFor = (rosterId: string, dayKey: string): number => {
    const r = checks?.byRoster.find((x) => x.rosterId === rosterId);
    return r?.days.find((d) => d.dayKey === dayKey)?.flags.length ?? 0;
  };
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold">Filed EODs</h2>
        <p className="text-xs text-muted-foreground">
          What each setter typed on their end-of-day, by day. Hover a cell for every number and any note. An amber mark means that day disagrees with Close or the calendar beyond the team&apos;s tolerance; the setter&apos;s card (EOD tab) shows both numbers. Rosters and EOD links are under Settings → Roster.
        </p>
      </div>
      <div className="overflow-x-auto">
        {board === undefined ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !board || board.rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Nothing filed in this range yet.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-semibold">Setter</th>
                {board.dayKeys.map((dk: string) => (
                  <th key={dk} className="px-3 py-2.5 text-right font-semibold">
                    {dk.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row: { rosterId: string; name: string; entries: Record<string, Record<string, unknown> | undefined> }) => (
                <tr key={row.rosterId} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{row.name}</td>
                  {board.dayKeys.map((dk: string) => {
                    const e = row.entries[dk] as Record<string, number | string | undefined> | undefined;
                    const off = flagsFor(row.rosterId, dk);
                    const mark = off > 0 ? <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-800">{off} off</span> : null;
                    const n = (k: string) => (typeof e?.[k] === "number" ? String(e[k]) : "—");
                    return (
                      <td key={dk} className="whitespace-nowrap px-3 py-2.5 text-right align-top">
                        {e && e.formShape === "confirmation" ? (
                          <div
                            className="tabular-nums leading-snug"
                            title={`new self-books ${n("newSelfBooked")} · contacted ${n("contacted")} · reached ${n("reached")} · confirmed ${n("confirmed")} · rescheduled ${n("rescheduled")} · cancelled ${n("cancelled")} · on calendar ${n("confirmedOnCalendar")} · showed ${n("confirmedShowed")}${e.note ? `\n${e.note}` : ""}`}
                          >
                            <div className="font-semibold">
                              {n("contacted")}/{n("newSelfBooked")} contacted{mark}
                            </div>
                            <div className="text-[11px] text-muted-foreground">{n("reached")} reached · {n("confirmed")} confirmed</div>
                            <div className="text-[11px] text-muted-foreground">{n("confirmedShowed")}/{n("confirmedOnCalendar")} showed</div>
                          </div>
                        ) : e ? (
                          <div className="tabular-nums leading-snug" title={`dials ${n("dials")} · pick-ups ${n("pickUps")} · sets ${n("sets")} · on calendar ${n("callsOnCalendar")} · shown ${n("callsShown")} · closed ${n("callsClosed")} · new leads ${n("newLeadsHit")} · follow-ups ${n("followUps")}${e.note ? `\n${e.note}` : ""}`}>
                            <div className="font-semibold">
                              {n("sets")} sets{mark}
                            </div>
                            <div className="text-[11px] text-muted-foreground">{n("dials")} dials · {n("pickUps")} pick-ups</div>
                            <div className="text-[11px] text-muted-foreground">{n("callsShown")}/{n("callsOnCalendar")} showed</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
