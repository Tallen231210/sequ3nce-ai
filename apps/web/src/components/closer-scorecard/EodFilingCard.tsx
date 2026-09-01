"use client";

// Who has filed their EOD TODAY — by name, at a glance. Zion's explicit
// ask: the old board buried this. Green = filed (with the time), amber =
// hasn't yet. Yesterday's line only names genuine misses (worked but never
// filed); a closer with no recorded activity didn't miss anything.

import React from "react";

interface Filed {
  name: string;
  at: number;
}

function timeOf(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EodFilingCard({
  filedToday,
  notYetToday,
  missedYesterday,
  filedYesterday,
}: {
  filedToday: Filed[];
  notYetToday: string[];
  missedYesterday: string[];
  filedYesterday: string[];
}) {
  const total = filedToday.length + notYetToday.length;
  if (total === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">
          EOD check-ins today
          <span className="ml-2 font-normal text-muted-foreground">
            {filedToday.length} of {total} filed
          </span>
        </h3>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {filedToday.map((f) => (
          <span
            key={f.name}
            title={`Filed at ${timeOf(f.at)}`}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
          >
            ✓ {f.name}
            <span className="font-normal opacity-70">{timeOf(f.at)}</span>
          </span>
        ))}
        {notYetToday.map((name) => (
          <span
            key={name}
            title="Hasn't submitted today's EOD yet"
            className="inline-flex items-center rounded-full border border-amber-600/30 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
          >
            {name} — not yet
          </span>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {missedYesterday.length > 0 ? (
          <>
            Yesterday:{" "}
            <span className="font-medium text-rose-600">
              {missedYesterday.join(", ")}
            </span>{" "}
            worked but never filed.
          </>
        ) : filedYesterday.length > 0 ? (
          <>Yesterday: everyone who worked filed. ✓</>
        ) : (
          <>Yesterday: no EODs were due.</>
        )}
      </p>
    </div>
  );
}
