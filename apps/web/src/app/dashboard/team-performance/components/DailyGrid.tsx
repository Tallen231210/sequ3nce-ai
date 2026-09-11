"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Loader2, PencilLine } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { EditableCell } from "./EditableCell";
import { fmtCurrency, fmtNum, fmtPct } from "../lib/format";
import { MONO } from "@/components/analytics/primitives/typography";

const BASE_FIELDS: Array<{ key: string; label: string; title?: string }> = [
 { key: "slots", label: "Slots" },
 { key: "booked", label: "Booked" },
 { key: "taken", label: "Taken" },
 { key: "offers", label: "Offers" },
 { key: "closes", label: "Closes" },
 { key: "cash", label: "Cash" },
];

/** Scorecard fields join the grid: follow-ups, plus one column per configured
 *  tier price. Same set the closer's own Previous-days grid edits, so a
 *  manager can correct exactly what a closer can enter. */
function gridFields(tierPrices: number[] | undefined) {
  const tiers = (tierPrices ?? []).slice(0, 3).map((price, i) => ({
    key: `tier${i + 1}Pitched`,
    label: `Pitched $${price >= 1000 ? `${Math.round(price / 100) / 10}k` : price}`,
    title: `Calls where the $${price.toLocaleString()} tier was pitched`,
  }));
  return [
    ...BASE_FIELDS,
    { key: "fuBooked", label: "Follow-ups booked", title: "Follow-up calls put on the calendar" },
    { key: "fuShown", label: "Follow-ups shown", title: "Follow-up calls the prospect turned up to" },
    ...tiers,
  ];
}

interface GridRow {
 dayKey: string;
  closerId: string;
  measured: Record<string, number>;
  /** What the closer submitted for this day. */
  reported: Record<string, number>;
  overridden: Record<string, number>;
  /** Set when the closer submitted the day at all, changed or not. */
  confirmedAt: number | null;
  missingOutcomes: number;
  measuredExists: boolean;
  updatedAt: number | null;
}

function dayLabel(dayKey: string): { day: string; weekday: string } {
  const [y, m, d] = dayKey.split("-").map((s) => parseInt(s, 10));
 const dt = new Date(Date.UTC(y, m - 1, d));
  return {
    day: String(d),
    weekday: dt.toLocaleDateString("en-US", {
 weekday: "short",
 timeZone: "UTC",
 }),
  };
}

const TH =
  "px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground whitespace-nowrap";

/**
 * Day-by-day numbers for one closer, editable in place.
 *
 * Every figure arrives pre-filled from what Sequ3nce measured. A manager can
 * correct any of them — reps miss calls with the bot, and a board nobody can
 * fix is a board nobody trusts — but corrections are marked, reversible, and
 * never overwrite the measurement.
 */
export function DailyGrid({ monthKey }: { monthKey: string }) {
 const { user } = useUser();
  const [closerId, setCloserId] = useState<string | null>(null);

  const data = useQuery(
    api.closerPerformanceMutations.getDailyGrid,
    user ? { clerkId: user.id, monthKey } : "skip",
 );
  const FIELDS = useMemo(() => gridFields(data?.tierPrices), [data?.tierPrices]);
  const setOverride = useMutation(
    api.closerPerformanceMutations.setDailyOverride,
  );

  const selected = closerId ?? data?.closers?.[0]?.closerId ?? null;

  const rows: GridRow[] = useMemo(
    () =>
      ((data?.rows ?? []) as GridRow[]).filter(
        (r) => selected === null || r.closerId === selected,
      ),
    [data, selected],
  );

  const totals = useMemo(() => {
    const acc: Record<string, number> = {
      slots: 0, booked: 0, taken: 0, offers: 0, closes: 0, cash: 0,
    };
    for (const r of rows) {
      for (const f of FIELDS) {
        // Only submitted days count, matching the board exactly.
        if (!r.confirmedAt && Object.keys(r.overridden).length === 0) continue;
        acc[f.key] +=
          r.overridden[f.key] ?? r.reported?.[f.key] ?? r.measured[f.key] ?? 0;
      }
    }
    return acc;
  }, [rows]);

  if (data === undefined) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-border bg-card">
 <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
 </div>
    );
  }
  if (!data) return null;

  const editedCount = rows.filter(
    (r) => Object.keys(r.overridden).length > 0,
  ).length;

  const showPct = totals.booked > 0 ? (totals.taken / totals.booked) * 100 : null;
  const closePct = totals.taken > 0 ? (totals.closes / totals.taken) * 100 : null;

  return (
    <div className="space-y-4">
 {/* Closer picker */}
      <div className="flex flex-wrap items-center gap-2">
 {data.closers.map((c: { closerId: string; name: string }) => (
          <button
            key={c.closerId}
            type="button"
 onClick={() => setCloserId(c.closerId)}
            className={
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors " +
 (selected === c.closerId
                ? "border-foreground bg-foreground text-background"
 : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")
 }
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* How editing works — one line, stated up front rather than as a
          tooltip nobody hovers. The detail sits behind the link. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          {data.canEdit
            ? "What your closers submitted. Click any number to correct it — corrections are underlined, and you can undo one at any time."
            : "What your closers submitted. Only managers can correct these."}
        </span>
        {data.canEdit && (
          <details className="inline">
            <summary className="cursor-pointer select-none underline-offset-2 hover:text-foreground hover:underline">How this works</summary>
            <p className="mt-1 max-w-3xl">
              On a day a closer hasn&apos;t submitted, we show what we measured instead. You can type a number on any day, including one where we recorded nothing at all —
              that happens when a rep takes calls without the bot running. What you type never overwrites what they submitted; hover a corrected number to see their figure.
            </p>
          </details>
        )}
      </div>

      {editedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
          <PencilLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
 {editedCount} {editedCount === 1 ? "day has" : "days have"}{" "}
 a manager correction
            </span>{" "}
 that don&apos;t match what Sequ3nce recorded. Totals and rates below
            use the entered values.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
 <div className="overflow-x-auto">
 <table className="w-full min-w-[720px]">
 <thead className="border-b border-border bg-muted/30">
 <tr>
                <th className={TH + " text-left"}>Day</th>
 {FIELDS.map((f) => (
                  <th key={f.key} className={TH + " text-right"}>
 {f.label}
                  </th>
                ))}
                <th className={TH + " text-right"} title="Calls we recorded with no post-call form. That day's closes and cash are short by this many calls.">
                  No form filled in
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
 {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={FIELDS.length + 2}
                    className="px-3 py-10 text-center text-sm text-muted-foreground"
 >
                    Nothing to show for this closer this month.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const { day, weekday } = dayLabel(r.dayKey);
                const isToday = r.dayKey === data.todayKey;
                return (
                  <tr
                    key={r.dayKey + r.closerId}
                    className={
                      "hover:bg-muted/30 " +
 (isToday ? "bg-muted/40 " : "") +
 // Nothing measured at all reads differently from a
                      // recorded zero, and a manager needs to tell them apart.
                      (!r.measuredExists && Object.keys(r.overridden).length === 0
                        ? "text-muted-foreground/60"
 : "")
 }
                  >
                    <td className="whitespace-nowrap px-3 py-2">
 <span className={`text-sm font-medium ${MONO}`}>
                        {day}
                      </span>
                      <span className="ml-1.5 text-xs text-muted-foreground">
 {weekday}
                      </span>
                      {isToday && (
                        <span className="ml-1.5 text-[10px] font-semibold text-emerald-600">
 TODAY
                        </span>
                      )}
                    </td>
                    {FIELDS.map((f) => (
                      <td key={f.key} className="px-3 py-2 text-right text-sm">
 <EditableCell
                          measured={r.measured[f.key] ?? 0}
                          reported={r.reported?.[f.key]}
                          override={r.overridden[f.key]}
                          field={f.key}
                          editable={data.canEdit}
                          onCommit={async (value) => {
                            await setOverride({
                              clerkId: user!.id,
                              closerId: r.closerId as never,
                              dayKey: r.dayKey,
                              field: f.key,
                              value,
                            });
                          }}
                        />
                      </td>
                    ))}
                    <td
                      className={
                        "px-3 py-2 text-right text-sm " + MONO + " " +
 (r.missingOutcomes > 0
                          ? "text-amber-700"
 : "text-muted-foreground")
 }
                      title={
                        r.missingOutcomes > 0
                          ? `${r.missingOutcomes} ${r.missingOutcomes === 1 ? "call" : "calls"} that day have no post-call form, so closes and cash are short`
                          : undefined
                      }
                    >
                      {r.missingOutcomes > 0 ? r.missingOutcomes : "—"}
 </td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-border bg-muted/30">
 <tr>
                  <td className="px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
 Total
                  </td>
                  {FIELDS.map((f) => (
                    <td
                      key={f.key}
                      className={`px-3 py-2.5 text-right text-sm font-semibold ${MONO}`}
                    >
                      {f.key === "cash"
 ? fmtCurrency(totals.cash)
                        : fmtNum(totals[f.key])}
                    </td>
                  ))}
                  <td />
                </tr>
                <tr className="border-t border-border">
 <td className="px-3 py-2 text-xs text-muted-foreground">
 Rates
                  </td>
                  <td colSpan={FIELDS.length + 1} className="px-3 py-2">
 <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
 <span>
                        Show{" "}
 <span className={`font-semibold ${MONO} text-foreground`}>
                          {fmtPct(showPct)}
                        </span>
                      </span>
                      <span>
                        Close{" "}
 <span className={`font-semibold ${MONO} text-foreground`}>
                          {fmtPct(closePct)}
                        </span>
                      </span>
                      <span>
                        Avg deal{" "}
                        <span className={`font-semibold ${MONO} text-foreground`}>
                          {fmtCurrency(
                            totals.closes > 0 ? totals.cash / totals.closes : null,
                          )}
                        </span>
                      </span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
