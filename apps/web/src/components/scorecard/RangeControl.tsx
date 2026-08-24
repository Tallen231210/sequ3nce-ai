"use client";

// Time-frame picker shared by all three scorecard mounts: recent Sat–Sat
// weeks, quick presets, and a pick-any-dates custom range.

import React, { useState } from "react";

export interface ScorecardRange {
  start: string;
  /** Inclusive. null = the classic Sat–Sat week starting at `start`. */
  end: string | null;
  label: string;
}

function isoAddDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function fmt(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function weekRange(sat: string, current: boolean): ScorecardRange {
  return {
    start: sat,
    end: null,
    label: current ? `This week · Sat ${fmt(sat)}` : `Week of Sat ${fmt(sat)}`,
  };
}

export function RangeControl({
  weeks,
  currentWeek,
  value,
  onChange,
}: {
  weeks: string[];
  currentWeek: string;
  value: ScorecardRange;
  onChange: (r: ScorecardRange) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState(value.end ? value.start : isoAddDays(todayIso(), -13));
  const [to, setTo] = useState(value.end ?? todayIso());

  const selectValue = value.end ? "custom" : value.start;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "last14") {
            const end = todayIso();
            const start = isoAddDays(end, -13);
            onChange({ start, end, label: `Last 14 days · ${fmt(start)} – ${fmt(end)}` });
            setCustomOpen(false);
          } else if (v === "last30") {
            const end = todayIso();
            const start = isoAddDays(end, -29);
            onChange({ start, end, label: `Last 30 days · ${fmt(start)} – ${fmt(end)}` });
            setCustomOpen(false);
          } else if (v === "custom") {
            setCustomOpen(true);
          } else {
            onChange(weekRange(v, v === currentWeek));
            setCustomOpen(false);
          }
        }}
        className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[12px] outline-none focus:border-neutral-900"
      >
        {weeks.map((w) => (
          <option key={w} value={w}>
            {w === currentWeek ? `This week (Sat ${fmt(w)})` : `Week of Sat ${fmt(w)}`}
          </option>
        ))}
        <option value="last14">Last 14 days</option>
        <option value="last30">Last 30 days</option>
        <option value="custom">Custom dates…</option>
      </select>

      {customOpen && (
        <span className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2 py-1">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-transparent text-[12px] outline-none"
          />
          <span className="text-[11px] text-neutral-400">to</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="bg-transparent text-[12px] outline-none"
          />
          <button
            onClick={() => {
              if (!from || !to || to < from) return;
              onChange({ start: from, end: to, label: `${fmt(from)} – ${fmt(to)}` });
            }}
            className="ml-1 rounded-md bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-neutral-800"
          >
            Apply
          </button>
        </span>
      )}
    </div>
  );
}
