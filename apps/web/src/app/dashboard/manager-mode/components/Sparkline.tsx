"use client";

/**
 * Six weeks of call volume, oldest bar first.
 *
 * Bars rather than a line because the values are counts, and a line between
 * two weekly totals implies days that were never measured. Scaled to the rep's
 * own peak — this answers "is their volume holding up", not "how do they
 * compare to everyone else", and a shared scale would flatten a quiet rep's
 * collapse into an invisible row of stubs.
 */
export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 0);

  // Never taken a call in six weeks. A row of empty bars would read as a
  // measurement; nothing at all is the honest answer.
  if (max === 0) {
    return (
      <span className="text-[10px] text-muted-foreground">no calls in 6 weeks</span>
    );
  }

  return (
    <span className="inline-flex h-5 items-end gap-[3px]" aria-hidden>
      {values.map((v, i) => {
        const pct = (v / max) * 100;
        return (
          <span
            key={i}
            title={`${v} call${v === 1 ? "" : "s"}`}
            className={
              "w-[5px] rounded-[1px] " +
              // The current week is partial, so it's drawn lighter — otherwise
              // a Monday reads as a collapse against six full weeks.
              (i === values.length - 1 ? "bg-foreground/35" : "bg-foreground/70")
            }
            style={{ height: `${Math.max(pct, v > 0 ? 12 : 4)}%` }}
          />
        );
      })}
    </span>
  );
}

/** "6 days ago" / "today" — coarse on purpose; the exact hour never matters. */
export function relativeDays(ts: number | null): string | null {
  if (!ts) return null;
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}
