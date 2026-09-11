"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useUser } from "@clerk/nextjs";
import { ClipboardCheck } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import { humanDay } from "../setters/lib/format";
import { missingRows } from "../../../../convex/lib/dataHealthRows";

// ============================================================================
// "Is the data complete?" — one question, one number, and a list of what is
// missing with the people who can fix it. The same facts the Monday post
// carries. Hidden for teams without the setter_teams flag (query returns null).
// ============================================================================

export type DataHealthWeekView = NonNullable<FunctionReturnType<typeof api.dataHealthQueries.getDataHealthWeek>>;
export type EodChecksView = NonNullable<FunctionReturnType<typeof api.setterEodCrossCheck.getEodCrossCheckThisWeek>>;

export function DataHealthCard() {
  const { user } = useUser();
  const clerkId = user?.id;
  const data = useQuery(api.dataHealthQueries.getDataHealthWeek, clerkId ? { clerkId } : "skip");
  const checks = useQuery(api.setterEodCrossCheck.getEodCrossCheckThisWeek, clerkId ? { clerkId } : "skip");
  // Hidden while loading too — most teams do not have the flag, and a
  // placeholder card that vanishes would jump the page.
  if (data === null || data === undefined) return null;
  return (
    <DataHealthView data={data} checks={checks ?? null}>
      <WeeklyPostRow />
    </DataHealthView>
  );
}

/** How much of the week is accounted for, with the key beside it. */
function ScoreBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted-foreground/25" role="img" aria-label={`${done} of ${total} complete`}>
        <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-foreground" />
          complete
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-muted-foreground/25" />
          missing something
        </span>
      </div>
    </>
  );
}

/** The card itself, given the week's data — also what the dev preview renders. */
export function DataHealthView({ data, checks, children }: { data: DataHealthWeekView; checks?: EodChecksView | null; children?: React.ReactNode }) {
  const a = data.accuracy;
  const rows = missingRows(data, checks);
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-5 py-3.5">
        <span className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Is the data complete?</h2>
        </span>
        <span className="text-xs text-muted-foreground">This week so far, from {humanDay(data.weekStartKey)}</span>
      </div>
      <div className="grid gap-x-8 gap-y-5 px-5 py-4 md:grid-cols-[minmax(0,17rem)_1fr]">
        <div>
          <div className="text-4xl font-semibold tabular-nums">{a.score === null ? "—" : `${a.score}%`}</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {a.due === 0 ? "No calls have finished yet this week." : `${a.allKnown} of ${a.due} finished calls have everything we need.`}
          </p>
          {a.due > 0 && <ScoreBar done={a.allKnown} total={a.due} />}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            A call is complete when we know three things: where it came from, who contacted them, and whether they showed up.
          </p>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What&apos;s missing, and who can fix it</h3>
          {rows.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing is missing this week.</p>
          ) : (
            <ul className="mt-1 divide-y divide-border/60">
              {rows.map((r) => (
                <li key={r.key} className="flex items-baseline justify-between gap-4 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm">{r.label}</span>
                    {r.detail.map((d) => (
                      <span key={d} className="block text-xs text-muted-foreground">
                        {d}
                      </span>
                    ))}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
          {data.claimedThisWeek > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {data.claimedThisWeek} {data.claimedThisWeek === 1 ? "booking was" : "bookings were"} claimed or assigned this week.
            </p>
          )}
          {(data.truncated.length > 0 || (checks?.truncated.length ?? 0) > 0) && (
            <p className="mt-2 text-xs text-muted-foreground">Part of this week was too busy to read in one go, so a few of these counts may be low.</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function hourLabel(h: number): string {
  const ampm = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${ampm}`;
}

/** The Monday post's switch. Channel is the setter scorecard's — one place to pick it. */
function WeeklyPostRow() {
  const { user } = useUser();
  const clerkId = user?.id;
  const config = useQuery(api.dataHealthNotifications.getConfig, clerkId ? { clerkId } : "skip");
  const save = useMutation(api.dataHealthNotifications.setConfig);
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(9);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setHour(config.hourLocal);
    }
  }, [config?.enabled, config?.hourLocal]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!config || !clerkId) return null;

  async function persist(next: { enabled?: boolean; hourLocal?: number }) {
    const previous = { enabled, hour };
    const e = next.enabled ?? enabled;
    const h = next.hourLocal ?? hour;
    setEnabled(e);
    setHour(h);
    setError(null);
    try {
      await save({ clerkId: clerkId!, enabled: e, hourLocal: h });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      // Put the control back where it was; the server is the truth.
      setEnabled(previous.enabled);
      setHour(previous.hour);
      setError(err instanceof ConvexError && typeof err.data === "string" ? err.data : "Couldn't save — try again");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3 text-[12px]">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={enabled} onChange={(e) => void persist({ enabled: e.target.checked })} />
        <span className="font-medium">Post this every Monday</span>
      </label>
      <select value={hour} onChange={(e) => void persist({ hourLocal: Number(e.target.value) })} className="rounded-md border border-border bg-background px-2 py-1">
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>
            {hourLabel(h)}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">
        to {config.channelName ? `#${config.channelName}` : "the setter scorecard channel"}
        {!config.channelReady && " — pick the scorecard channel above first"}
      </span>
      {saved && <span className="text-emerald-600">✓</span>}
      {error && <span className="text-rose-600">{error}</span>}
    </div>
  );
}
