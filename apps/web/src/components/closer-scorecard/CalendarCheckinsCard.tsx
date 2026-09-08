"use client";

// Who has recolored their calendar after the call — by name, at a glance.
// Sits under the EOD check-ins card and reads the same way: green = every
// booking whose call is over has been recolored, amber = some still carry
// the pre-call color. Yesterday's line names the closers with bookings still
// not recolored. "Can't verify" is the small bucket of bookings colored
// before we started watching; it empties within a week and is never a miss.

import React from "react";

interface Pending {
  title: string;
  startTime: number;
  label: string;
}

interface DayCheckins {
  due: number;
  done: number;
  unverified: number;
  pending: Pending[];
}

interface CloserRow {
  closerId: string;
  name: string;
  yesterday: DayCheckins;
  today: DayCheckins;
}

function timeOf(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function pillTitle(day: DayCheckins): string {
  if (day.pending.length === 0) {
    return day.unverified > 0
      ? `${day.unverified} colored before we started watching — can't verify`
      : "Every booking whose call is over has been recolored";
  }
  return day.pending
    .map((p) => `${timeOf(p.startTime)} ${p.title} — ${p.label}`)
    .join("\n");
}

export function CalendarCheckinsCard({ closers }: { closers: CloserRow[] }) {
  const dueToday = closers.reduce((n, c) => n + c.today.due, 0);
  const doneToday = closers.reduce((n, c) => n + c.today.done, 0);
  const unverifiedToday = closers.reduce((n, c) => n + c.today.unverified, 0);
  const dueYesterday = closers.reduce((n, c) => n + c.yesterday.due, 0);
  if (dueToday + dueYesterday === 0) return null;

  const todayRows = closers.filter((c) => c.today.due > 0);
  const missedYesterday = closers.filter((c) => c.yesterday.pending.length > 0);
  const allPending = closers.flatMap((c) => [
    ...c.yesterday.pending.map((p) => ({ ...p, name: c.name, day: "Yesterday" })),
    ...c.today.pending.map((p) => ({ ...p, name: c.name, day: "Today" })),
  ]);

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">
          Calendar check-ins today
          <span className="ml-2 font-normal text-muted-foreground">
            {dueToday === 0
              ? "no calls over yet"
              : `${doneToday} of ${dueToday} recolored after the call`}
            {unverifiedToday > 0 && ` · ${unverifiedToday} can't verify`}
          </span>
        </h3>
      </div>

      {todayRows.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {todayRows.map((c) =>
            c.today.pending.length === 0 ? (
              <span
                key={c.closerId}
                title={pillTitle(c.today)}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              >
                ✓ {c.name}
                <span className="font-normal opacity-70">
                  {c.today.done}/{c.today.due}
                </span>
              </span>
            ) : (
              <span
                key={c.closerId}
                title={pillTitle(c.today)}
                className="inline-flex items-center gap-1 rounded-full border border-amber-600/30 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
              >
                {c.name}
                <span className="font-normal opacity-70">
                  {c.today.done}/{c.today.due} — {c.today.pending.length} to recolor
                </span>
              </span>
            ),
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {missedYesterday.length > 0 ? (
          <>
            Yesterday:{" "}
            <span className="font-medium text-rose-600">
              {missedYesterday
                .map((c) => `${c.name} (${c.yesterday.pending.length})`)
                .join(", ")}
            </span>{" "}
            still not recolored after the call.
          </>
        ) : dueYesterday > 0 ? (
          <>Yesterday: every booking was recolored. ✓</>
        ) : (
          <>Yesterday: no bookings were due.</>
        )}
      </p>

      {allPending.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Show the {allPending.length} booking{allPending.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1.5 space-y-0.5">
            {allPending.map((p, i) => (
              <li key={`${p.name}-${p.startTime}-${i}`} className="flex gap-2">
                <span className="w-36 shrink-0 tabular-nums text-muted-foreground">
                  {p.day} {timeOf(p.startTime)}
                </span>
                <span className="shrink-0 font-medium">{p.name}</span>
                <span className="truncate">{p.title}</span>
                <span className="shrink-0 text-muted-foreground">— {p.label}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
