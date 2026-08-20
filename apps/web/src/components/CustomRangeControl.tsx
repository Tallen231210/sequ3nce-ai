"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { DateRangePicker } from "@/components/DateRangePicker";

export interface CustomRange {
  start: number;
  end: number;
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

/**
 * The button + popover pair every tab uses for ad-hoc date ranges.
 *
 * One component so the calendar behaves identically everywhere: same
 * open/close rules, same label format, same clear semantics. Wraps the
 * existing DateRangePicker calendar rather than reinventing it.
 */
export function CustomRangeControl({
  range,
  onChange,
}: {
  range: CustomRange | null;
  onChange: (range: CustomRange | null) => void;
}) {
  const [open, setOpen] = useState(range === null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Click-away closes without applying — the button reopens it.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          "inline-flex h-9 items-center gap-1.5 rounded-md border bg-white px-3 text-sm transition-colors " +
          (range
            ? "border-zinc-900 text-zinc-900"
            : "border-zinc-200 text-zinc-500 hover:text-zinc-900")
        }
      >
        <CalendarDays className="h-3.5 w-3.5" />
        {range ? `${fmt(range.start)} – ${fmt(range.end)}` : "Pick dates"}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg">
          <DateRangePicker
            initialStart={range?.start ?? null}
            initialEnd={range?.end ?? null}
            onApply={(start, end) => {
              onChange({ start, end });
              setOpen(false);
            }}
            onClear={() => {
              onChange(null);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
