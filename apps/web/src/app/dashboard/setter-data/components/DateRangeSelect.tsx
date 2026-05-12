"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRESETS: Array<{ id: string; label: string; days: number }> = [
  { id: "today", label: "Today", days: 1 },
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "365d", label: "Last 12 months", days: 365 },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface DateRangeSelectProps {
  rangeStart: number;
  rangeEnd: number;
  onChange: (start: number, end: number) => void;
}

/**
 * Compact preset dropdown for date ranges. Phase 1 keeps it minimal —
 * 5 fixed presets, no custom calendar. We can wire in the full
 * DateRangePicker (apps/web/src/components/DateRangePicker.tsx) later
 * if managers need ad-hoc ranges; the queries already accept arbitrary
 * rangeStart/rangeEnd.
 */
export function DateRangeSelect({
  rangeStart,
  rangeEnd,
  onChange,
}: DateRangeSelectProps) {
  // Match current range against a preset by approximate days (within 1d
  // tolerance for clock drift). Falls through to "Last 7 days" as the
  // default visible label if nothing matches.
  const elapsedDays = Math.round((rangeEnd - rangeStart) / MS_PER_DAY);
  const matchedPreset =
    PRESETS.find((p) => Math.abs(p.days - elapsedDays) <= 1) ?? PRESETS[1];

  function handleSelect(presetId: string) {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const now = Date.now();
    onChange(now - preset.days * MS_PER_DAY, now);
  }

  return (
    <Select value={matchedPreset.id} onValueChange={handleSelect}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRESETS.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
