"use client";

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

interface Closer {
  _id: Id<"closers">;
  name: string;
}

interface FilterBarProps {
  dateRange: string;
  customStart?: number;
  customEnd?: number;
  /** Atomic range update — sets dateRange plus custom bounds together. */
  onRangeChange: (dateRange: string, customStart?: number, customEnd?: number) => void;
  closerId: string;
  onCloserChange: (value: string) => void;
  closers: Closer[];
  isLoading?: boolean;
}

const PRESETS = [
  { value: "last_7_days", label: "7D" },
  { value: "last_30_days", label: "30D" },
  { value: "last_90_days", label: "90D" },
  { value: "this_month", label: "MTD" },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toDateInput(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fromDateInput(str: string, endOfDay: boolean): number | undefined {
  if (!str) return undefined;
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
    : new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

export function FilterBar({
  dateRange,
  customStart,
  customEnd,
  onRangeChange,
  closerId,
  onCloserChange,
  closers,
  isLoading,
}: FilterBarProps) {
  // Last 12 months as jump options, each with its exact bounds.
  const months = useMemo(() => {
    const now = new Date();
    const out: Array<{ key: string; label: string; start: number; end: number }> = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = d.getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1;
      out.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
        start,
        end,
      });
    }
    return out;
  }, []);

  const isCustom = dateRange === "custom";
  // Which month (if any) the current custom range exactly matches.
  const activeMonth = isCustom
    ? months.find((m) => m.start === customStart && m.end === customEnd)
    : undefined;
  const isArbitraryCustom = isCustom && !activeMonth;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* preset segmented control */}
      <div
        className={cn(
          "flex items-center gap-0.5 rounded-md border border-zinc-200 bg-white p-0.5",
          isLoading && "pointer-events-none opacity-60",
        )}
      >
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => onRangeChange(p.value)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              dateRange === p.value ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-900",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* month jump */}
      <Select
        value={activeMonth?.key ?? ""}
        onValueChange={(key) => {
          const m = months.find((mm) => mm.key === key);
          if (m) onRangeChange("custom", m.start, m.end);
        }}
        disabled={isLoading}
      >
        <SelectTrigger className={cn("h-8 w-[150px] bg-white text-xs", activeMonth && "border-zinc-900")}>
          <SelectValue placeholder="Jump to month" />
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m.key} value={m.key} className="text-xs">
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* custom range */}
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-md border bg-white px-2 py-1",
          isArbitraryCustom ? "border-zinc-900" : "border-zinc-200",
        )}
      >
        <input
          type="date"
          value={toDateInput(isCustom ? customStart : undefined)}
          max={toDateInput(customEnd) || undefined}
          onChange={(e) => {
            const start = fromDateInput(e.target.value, false);
            if (start != null) onRangeChange("custom", start, customEnd ?? Date.now());
          }}
          disabled={isLoading}
          className="bg-transparent text-xs text-zinc-700 outline-none [color-scheme:light]"
          aria-label="Custom range start"
        />
        <span className="text-xs text-zinc-300">→</span>
        <input
          type="date"
          value={toDateInput(isCustom ? customEnd : undefined)}
          min={toDateInput(customStart) || undefined}
          onChange={(e) => {
            const end = fromDateInput(e.target.value, true);
            if (end != null) onRangeChange("custom", customStart ?? end, end);
          }}
          disabled={isLoading}
          className="bg-transparent text-xs text-zinc-700 outline-none [color-scheme:light]"
          aria-label="Custom range end"
        />
      </div>

      <div className="flex-1" />

      {/* closer filter */}
      <Select value={closerId} onValueChange={onCloserChange} disabled={isLoading}>
        <SelectTrigger className="h-8 w-[160px] bg-white text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">All closers</SelectItem>
          {closers.map((closer) => (
            <SelectItem key={closer._id} value={closer._id} className="text-xs">
              {closer.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
