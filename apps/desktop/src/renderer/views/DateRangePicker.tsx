import React, { useState, useCallback } from 'react';

interface DateRangePickerProps {
  onApply: (startDate: number, endDate: number) => void;
  onClear: () => void;
  initialStart?: number | null;
  initialEnd?: number | null;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isInRange(day: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  const d = day.getTime();
  return d >= startOfDay(start).getTime() && d <= endOfDay(end).getTime();
}

/**
 * Lightweight inline date range picker — no external dependencies.
 * Renders a month grid with click-to-select start/end dates.
 */
export function DateRangePicker({ onApply, onClear, initialStart, initialEnd }: DateRangePickerProps) {
  const [viewDate, setViewDate] = useState(() => {
    if (initialStart) return new Date(initialStart);
    return new Date();
  });
  const [rangeStart, setRangeStart] = useState<Date | null>(
    initialStart ? new Date(initialStart) : null
  );
  const [rangeEnd, setRangeEnd] = useState<Date | null>(
    initialEnd ? new Date(initialEnd) : null
  );
  const [picking, setPicking] = useState<'start' | 'end'>('start');

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // First day of the month and how many days in it
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build the calendar grid (6 rows x 7 cols max)
  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const handleDayClick = useCallback((day: Date) => {
    if (picking === 'start') {
      setRangeStart(day);
      setRangeEnd(null);
      setPicking('end');
    } else {
      // If the user clicked before the start, swap
      if (day.getTime() < (rangeStart?.getTime() ?? 0)) {
        setRangeEnd(rangeStart);
        setRangeStart(day);
      } else {
        setRangeEnd(day);
      }
      setPicking('start');
    }
  }, [picking, rangeStart]);

  const handleApply = useCallback(() => {
    if (!rangeStart || !rangeEnd) return;
    onApply(startOfDay(rangeStart).getTime(), endOfDay(rangeEnd).getTime());
  }, [rangeStart, rangeEnd, onApply]);

  const handleClear = useCallback(() => {
    setRangeStart(null);
    setRangeEnd(null);
    setPicking('start');
    onClear();
  }, [onClear]);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const today = startOfDay(new Date());

  const formatShort = (d: Date | null) =>
    d ? `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}` : '—';

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-[280px]">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-[13px] font-semibold text-black">
          {MONTHS[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} className="h-8" />;
          }

          const isStart = rangeStart && isSameDay(cell, rangeStart);
          const isEnd = rangeEnd && isSameDay(cell, rangeEnd);
          const inRange = isInRange(cell, rangeStart, rangeEnd);
          const isToday = isSameDay(cell, today);
          const isFuture = cell.getTime() > today.getTime();

          return (
            <button
              key={cell.toISOString()}
              onClick={() => !isFuture && handleDayClick(cell)}
              disabled={isFuture}
              className={`h-8 text-[12px] font-medium rounded-md transition-colors relative ${
                isStart || isEnd
                  ? 'bg-black text-white'
                  : inRange
                    ? 'bg-gray-100 text-black'
                    : isToday
                      ? 'text-black font-bold'
                      : isFuture
                        ? 'text-gray-300 cursor-default'
                        : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>

      {/* Selected range display + actions */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
        <div className="text-[11px] text-gray-500">
          {rangeStart && rangeEnd
            ? `${formatShort(rangeStart)} – ${formatShort(rangeEnd)}`
            : rangeStart
              ? `${formatShort(rangeStart)} – pick end`
              : 'Pick a start date'}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="px-2 py-1 text-[11px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            Clear
          </button>
          <button
            onClick={handleApply}
            disabled={!rangeStart || !rangeEnd}
            className="px-3 py-1 text-[11px] font-semibold text-white bg-black rounded-md hover:bg-gray-800 disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
