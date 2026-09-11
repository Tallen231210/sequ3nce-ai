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
          Who has filed their end of day?
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
            className="inline-flex items-center gap-1 rounded-full border border-foreground bg-foreground px-2.5 py-1 text-xs font-medium text-background"
          >
            ✓ {f.name}
            <span className="font-normal opacity-70">{timeOf(f.at)}</span>
          </span>
        ))}
        {notYetToday.map((name) => (
          <span
            key={name}
            title="Hasn't submitted today's EOD yet"
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground"
          >
            {name}
            <span className="font-normal text-muted-foreground">not yet</span>
          </span>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {missedYesterday.length > 0 ? (
          <>
            Yesterday:{" "}
            <span className="font-medium text-foreground">{missedYesterday.join(", ")}</span>{" "}
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
