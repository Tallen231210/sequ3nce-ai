"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useUser } from "@clerk/nextjs";
import { Activity } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { flagText } from "../../../../convex/lib/eodCrossCheck";

// ============================================================================
// Data health, this week so far: the accuracy score, what it is made of, and
// the lists that move it. Same numbers the Monday post carries. Hidden for
// teams without the setter_teams flag (the query returns null).
// ============================================================================

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const named = (rows: Array<{ name: string; count: number }>) => rows.map((r) => `${r.name} ${r.count}`).join(", ");

function humanDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export type DataHealthWeekView = NonNullable<FunctionReturnType<typeof api.dataHealthQueries.getDataHealthWeek>>;
export type EodChecksView = NonNullable<FunctionReturnType<typeof api.setterEodCrossCheck.getEodCrossCheckThisWeek>>;

export function DataHealthCard() {
  const { user } = useUser();
  const clerkId = user?.id;
  const data = useQuery(api.dataHealthQueries.getDataHealthWeek, clerkId ? { clerkId } : "skip");
  const checks = useQuery(api.setterEodCrossCheck.getEodCrossCheckThisWeek, clerkId ? { clerkId } : "skip");
  // Hidden while loading too — most teams don't have the flag, and a
  // placeholder card that vanishes would jump the page.
  if (data === null || data === undefined) return null;
  return (
    <DataHealthView data={data} checks={checks ?? null}>
      <WeeklyPostRow />
    </DataHealthView>
  );
}

/** The card itself, given the week's data — also what the dev preview renders. */
/** Per setter: days filed of days due, and each flagged day with both numbers. */
function EodChecks({ checks }: { checks: EodChecksView }) {
  const rows = checks.byRoster.filter((r) => r.daysFiled > 0 || r.daysDue > 0);
  if (rows.length === 0) return null;
  return (
    <div className="border-t border-border px-5 py-4 text-[12px]">
      <div className="mb-1 font-medium">EODs vs Close and the calendar</div>
      <ul className="space-y-1">
        {rows.map((r) => {
          const flagged = r.days.filter((d) => d.flags.length > 0);
          return (
            <li key={r.rosterId}>
              <span className="font-medium">{r.name}</span>{" "}
              <span className={r.daysFiled < r.daysDue ? "text-amber-700" : "text-muted-foreground"}>filed {r.daysFiled} of {r.daysDue} due</span>
              {r.daysFiled > 0 && flagged.length === 0 && <span className="text-muted-foreground"> · all within tolerance</span>}
              {flagged.length > 0 && (
                <ul className="ml-3 mt-0.5 space-y-0.5 text-amber-800">
                  {flagged.map((d) => (
                    <li key={d.dayKey}>
                      {humanDay(d.dayKey)} — {d.flags.map(flagText).join(" · ")}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {checks.truncated.length > 0 && <p className="mt-1 text-amber-700">Partial: some reads hit their cap ({checks.truncated.join(", ")}).</p>}
    </div>
  );
}

export function DataHealthView({ data, checks, children }: { data: DataHealthWeekView; checks?: EodChecksView | null; children?: React.ReactNode }) {
  const a = data.accuracy;
  const drags: string[] = [];
  if (data.drags.untaggedSelfBooks.total > 0) drags.push(`Self-booked calls with no tag: ${data.drags.untaggedSelfBooks.total} (${named(data.drags.untaggedSelfBooks.byCloser)})`);
  if (data.drags.missingInitials.total > 0) drags.push(`Sets credited from Close only, initials missing: ${data.drags.missingInitials.total} (${named(data.drags.missingInitials.bySetter)})`);
  if (data.drags.notRecolored.total > 0) drags.push(`Calls not recoloured after the call: ${data.drags.notRecolored.total} (${named(data.drags.notRecolored.byCloser)})`);
  if (data.drags.handMadeUntagged > 0) drags.push(`Hand-made bookings with no tag and no Close touch: ${data.drags.handMadeUntagged}`);
  if (data.drags.leadMissing > 0) drags.push(`Funnel bookings with no lead in Close: ${data.drags.leadMissing}`);
  for (const e of data.drags.eodMissed) if (e.days.length > 0) drags.push(`${e.name}'s EOD not filed: ${e.days.map(humanDay).join(", ")}`);

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Data health</span>
        <span className="text-xs text-muted-foreground">
          week of {humanDay(data.weekStartKey)}, so far
        </span>
      </div>
      <div className="grid grid-cols-1 gap-5 px-5 py-4 md:grid-cols-[auto_1fr]">
        <div className="flex items-start gap-5">
          <div>
            <div className="text-3xl font-semibold tabular-nums">{pct(a.score)}</div>
            <div className="text-[11px] text-muted-foreground">
              {a.allKnown} of {a.due} due bookings fully accounted for
            </div>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[12px] tabular-nums">
            <dt className="text-muted-foreground">Source known</dt>
            <dd className="text-right">{pct(a.sourcePct)}</dd>
            <dt className="text-muted-foreground">Contact known</dt>
            <dd className="text-right">{pct(a.contactPct)}</dd>
            <dt className="text-muted-foreground">Show known</dt>
            <dd className="text-right">{pct(a.showPct)}</dd>
            <dt className="text-muted-foreground">Bookings</dt>
            <dd className="text-right">{data.bookings}</dd>
          </dl>
        </div>
        <div className="text-[12px]">
          <div className="mb-1 font-medium">What moves it</div>
          {drags.length === 0 ? (
            <p className="text-muted-foreground">Nothing dragging the score down this week.</p>
          ) : (
            <ul className="space-y-0.5 text-muted-foreground">
              {drags.map((d) => (
                <li key={d}>• {d}</li>
              ))}
            </ul>
          )}
          {data.truncated.length > 0 && <p className="mt-1 text-amber-700">Partial: some reads hit their cap ({data.truncated.join(", ")}).</p>}
        </div>
      </div>
      {checks && <EodChecks checks={checks} />}
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
