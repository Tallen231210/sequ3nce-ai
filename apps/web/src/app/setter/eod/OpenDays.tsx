"use client";

// ============================================================================
// The days still sitting open, with the two ways to close one.
//
// This sits at the TOP of the form on purpose. The moment a day off is ever
// dealt with is not the day off — nobody opens a work app on their day off —
// it's the morning they come back to four open days. One tap each.
// ============================================================================

export interface OpenDay {
  dayKey: string;
  filed: boolean;
  off: { by: "self" | "manager"; byName: string | null; note: string | null } | null;
  /**
   * The server's answer to "would anybody chase you for this day": over,
   * after you joined, unfiled, unmarked, and the CRM saw you working it.
   * Never re-derived here — the app offering to close a day the dashboard
   * isn't asking about is the same disagreement this release exists to end.
   */
  open: boolean;
}

function humanDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function OpenDays({
  days,
  busy,
  onFile,
  onOff,
}: {
  days: OpenDay[];
  busy: boolean;
  onFile: (dayKey: string) => void;
  onOff: (dayKey: string) => void;
}) {
  const open = days.filter((d) => d.open);
  if (open.length === 0) return null;

  return (
    <div className="mb-5 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <p className="mb-2 text-[12px] font-medium text-neutral-700">
        {open.length === 1 ? "1 day still open" : `${open.length} days still open`}
      </p>
      <ul className="space-y-1.5">
        {open.slice(0, 7).map((d) => (
          <li key={d.dayKey} className="flex items-center justify-between gap-2">
            <span className="text-[13px] tabular-nums text-neutral-600">{humanDay(d.dayKey)}</span>
            <span className="flex shrink-0 gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => onFile(d.dayKey)}
                className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-[12px] font-medium text-neutral-800 transition-colors hover:border-neutral-900 disabled:opacity-50"
              >
                File
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onOff(d.dayKey)}
                className="rounded-md border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900 disabled:opacity-50"
              >
                Didn&apos;t work
              </button>
            </span>
          </li>
        ))}
      </ul>
      {open.length > 7 && (
        <p className="mt-2 text-[11px] text-neutral-500">
          …and {open.length - 7} more further back — pick them from the day list above.
        </p>
      )}
    </div>
  );
}
