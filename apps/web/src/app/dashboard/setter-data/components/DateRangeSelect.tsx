"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomRangeControl } from "@/components/CustomRangeControl";

// Max preset is 90 days: metric reads are budgeted (Convex caps a
// transaction at 32k docs / 16 MiB) for ≤90d on the largest orgs. A
// 12-month option would need lead-count rollups first (Phase 2). Custom
// ranges are allowed to exceed that — the queries clamp loudly and say so
// in the UI rather than failing silently.
const PRESETS: Array<{ id: string; label: string; days: number }> = [
  { id: "today", label: "Today", days: 1 },
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface DateRangeSelectProps {
  rangeStart: number;
  rangeEnd: number;
  onChange: (start: number, end: number) => void;
}

/**
 * Preset dropdown plus an ad-hoc calendar. Presets emit rolling windows
 * ending now; "Custom range" opens the shared calendar and emits exact
 * day-bounded timestamps. The active label is derived from the range
 * itself, so a custom range never masquerades as a preset.
 */
export function DateRangeSelect({
  rangeStart,
  rangeEnd,
  onChange,
}: DateRangeSelectProps) {
  const [customMode, setCustomMode] = useState(false);

  // Match current range against a preset: rolling windows end within a few
  // minutes of now and span the preset's days (1-day tolerance).
  const endsNow = Math.abs(Date.now() - rangeEnd) < 10 * 60 * 1000;
  const elapsedDays = Math.round((rangeEnd - rangeStart) / MS_PER_DAY);
  const matchedPreset =
    !customMode && endsNow
      ? PRESETS.find((p) => Math.abs(p.days - elapsedDays) <= 1)
      : undefined;

  const isCustom = customMode || !matchedPreset;

  function handleSelect(presetId: string) {
    if (presetId === "custom") {
      setCustomMode(true);
      return;
    }
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setCustomMode(false);
    const now = Date.now();
    onChange(now - preset.days * MS_PER_DAY, now);
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={isCustom ? "custom" : matchedPreset!.id}
        onValueChange={handleSelect}
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      {isCustom && (
        <CustomRangeControl
          range={{ start: rangeStart, end: rangeEnd }}
          onChange={(r) => {
            if (r) {
              onChange(r.start, r.end);
            } else {
              // Cleared: fall back to the 7-day default.
              setCustomMode(false);
              const now = Date.now();
              onChange(now - 7 * MS_PER_DAY, now);
            }
          }}
        />
      )}
    </div>
  );
}
