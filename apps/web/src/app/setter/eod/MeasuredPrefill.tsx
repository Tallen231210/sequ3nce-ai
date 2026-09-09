"use client";

// The confirmation setter's form opens filled in from the calendar and
// Close. This is the note beside it: what was prefilled, and — once she has
// typed something different — where her number and the measured one
// disagree, with a one-tap way back to the measured value. Same idea as the
// closer form's "your calls add up to" notice.

import type { EodFieldView } from "../_components/SetterContext";

export interface Drift {
  field: EodFieldView;
  typed: number;
  measured: number;
}

export function MeasuredPrefill({
  loading,
  exists,
  linked,
  partial,
  drift,
  onUse,
}: {
  loading: boolean;
  exists: boolean;
  linked: boolean;
  partial: boolean;
  drift: Drift[];
  onUse: (key: string, value: number) => void;
}) {
  if (loading) {
    return <p className="text-[12px] text-neutral-400">Reading the calendar and Close for that day…</p>;
  }
  if (!linked) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
        Your CRM user isn&apos;t linked to your roster row yet, so nothing can be prefilled. Ask your manager to link
        it on the Setter EODs tab.
      </p>
    );
  }
  if (!exists) {
    return (
      <p className="text-[12px] text-neutral-400">
        Nothing measured for that day yet — no self-booked calls found on the calendar. Type what you know.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-neutral-500">
        Marked fields are prefilled from the calendar and Close{partial ? " (partial — some reads hit their cap)" : ""}.
        Change anything that&apos;s wrong; your numbers are what count.
      </p>
      {drift.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {drift.map((d) => (
            <div key={d.field.key} className="flex items-center justify-between gap-2 py-0.5">
              <span>
                {d.field.label}: you typed <b>{d.typed}</b>; the calendar and Close show <b>{d.measured}</b>.
              </span>
              <button
                type="button"
                onClick={() => onUse(d.field.key, d.measured)}
                className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
              >
                Use {d.measured}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
