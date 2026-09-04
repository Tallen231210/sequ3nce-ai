"use client";

import React, { useState, useEffect, useRef } from 'react';
import type { DailyEntryRow } from '@/lib/closer/client';
import { dealValueLabels, getCloserInfo } from "@/lib/closer/session";

/** Team-specific name for the contract-value field (see session.ts). */
const dealLabels = () => dealValueLabels(getCloserInfo());

/**
 * `width` matters more than it looks. Each cell holds an <input>, and an input
 * contributes no content width to table layout — so the browser sizes these
 * columns from the HEADER text alone. "Cash" is a short word, which starved
 * the column and rendered 11000 as "1100(" on a narrow window. The desktop app
 * never hit this because it controlled its own window size.
 */
interface GridColumn {
  key: string;
  label: string;
  width: string;
  money?: boolean;
  title?: string;
}

const BASE_COLUMNS: GridColumn[] = [
  { key: 'slots', label: 'Slots', width: 'min-w-[64px]' },
  { key: 'booked', label: 'Booked', width: 'min-w-[72px]' },
  { key: 'taken', label: 'Taken', width: 'min-w-[68px]' },
  { key: 'offers', label: 'Offers', width: 'min-w-[68px]' },
  { key: 'closes', label: 'Closes', width: 'min-w-[68px]' },
  { key: 'cash', label: 'Cash', money: true, width: 'min-w-[104px]' },
  { key: 'contractValue', label: 'Contract', money: true, width: 'min-w-[104px]' },
];

/**
 * The scorecard fields (follow-ups, tier pitches) were on the Today form but
 * not here, so a closer going back to Monday had no box to put them in —
 * E2's team hit exactly that. Tier columns follow the team's configured
 * prices, same as the Today form; no prices, no tier columns.
 */
export function gridColumns(tierPrices: number[] | null | undefined): GridColumn[] {
  const tiers: GridColumn[] = (tierPrices ?? []).slice(0, 3).map((price, i) => ({
    key: `tier${i + 1}Pitched`,
    label: `@ $${price >= 1000 ? `${Math.round(price / 100) / 10}k` : price}`,
    title: `Calls where you pitched the $${price.toLocaleString()} tier`,
    width: 'min-w-[76px]',
  }));
  const labels = dealLabels();
  return [
    ...BASE_COLUMNS.map((c) => (c.key === 'contractValue' ? { ...c, label: labels.short, title: labels.long } : c)),
    { key: 'fuBooked', label: 'FU booked', title: 'Follow-up calls you scheduled', width: 'min-w-[86px]' },
    { key: 'fuShown', label: 'FU shown', title: 'Follow-ups where they showed', width: 'min-w-[84px]' },
    ...tiers,
  ];
}

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n)}%`);

function dayCell(dayKey: string) {
  const [y, m, d] = dayKey.split('-').map((s) => parseInt(s, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return {
    num: d,
    wd: dt.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
    weekend: [0, 6].includes(dt.getUTCDay()),
  };
}

/** The value to display: their entry, else our reading, else blank. */
function cellValue(row: DailyEntryRow, key: string): string {
  const reported = row.reported?.[key];
  if (typeof reported === 'number') return String(reported);
  if (row.measuredExists) return String(row.measured[key] ?? 0);
  // A submitted day with nothing behind it still counts — as zero. Leaving it
  // blank reads as "no data", which is the opposite of what submitting meant.
  if (row.confirmedAt) return '0';
  return '';
}

/**
 * One editable cell.
 *
 * Saves on blur, and saving a cell submits that day — the same action, because
 * a closer correcting a number is exactly a closer telling us the day is
 * right. Escape reverts.
 */
function Cell({
  row, col, disabled, onCommit,
}: {
  row: DailyEntryRow;
  col: GridColumn;
  disabled: boolean;
  onCommit: (key: string, value: number | null) => void;
}) {
  const initial = cellValue(row, col.key);
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  // Escape calls setDraft and blur in the same tick, so onBlur's closure still
  // holds the typed value and would commit the edit we just abandoned. A ref
  // is readable synchronously; the state isn't.
  const escaped = useRef(false);

  useEffect(() => { setDraft(cellValue(row, col.key)); }, [row.confirmedAt, row.dayKey, initial]);

  const corrected = row.managerCorrected?.[col.key];
  const isCorrected = typeof corrected === 'number';
  const isReported = typeof row.reported?.[col.key] === 'number';

  return (
    <td className="p-0 border-l border-gray-100 first:border-l-0">
      <input
        ref={ref}
        type="number"
        disabled={disabled}
        value={isCorrected ? String(corrected) : draft}
        readOnly={isCorrected}
        title={
          isCorrected
            ? 'Your manager set this value'
            : row.measuredExists
              ? `We recorded ${row.measured[col.key] ?? 0}`
              : 'Nothing recorded — enter your number'
        }
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            escaped.current = true;
            setDraft(initial);
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={() => {
          if (escaped.current) { escaped.current = false; setDraft(initial); return; }
          if (isCorrected || draft === initial) return;
          const t = draft.trim();
          onCommit(col.key, t === '' ? null : Number(t.replace(/[$,\s]/g, '')));
        }}
        className={
          'w-full px-2.5 py-2 text-[13px] font-mono text-right bg-transparent ' +
          'focus:outline-none focus:bg-white focus:ring-1 focus:ring-inset focus:ring-black ' +
          (isCorrected
            ? 'text-amber-700 cursor-not-allowed'
            : isReported
              ? 'text-black'
              : 'text-gray-400')
        }
      />
    </td>
  );
}

/**
 * The month as a spreadsheet.
 *
 * Every number on screen at once, editable in place — a closer correcting last
 * Tuesday shouldn't have to open anything. Grey figures are ours and count for
 * nothing; black ones are theirs and count. Amber is a manager's correction and
 * is read-only, because a closer overwriting their manager silently would make
 * the correction pointless.
 */
export function PerformanceGrid({
  rows,
  savingDay,
  errors,
  tierPrices,
  onCommit,
  onConfirm,
}: {
  rows: DailyEntryRow[];
  savingDay: string | null;
  errors: Record<string, string | null>;
  tierPrices?: number[] | null;
  onCommit: (dayKey: string, key: string, value: number | null) => void;
  onConfirm: (dayKey: string) => void;
}) {
  const anyError = Object.entries(errors).find(([, e]) => !!e);
  const COLUMNS = gridColumns(tierPrices);

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[11px] text-gray-400">
          Click any cell to edit. Grey is what we recorded and doesn&apos;t count
          until you submit the day.
        </p>
        {anyError && (
          <p className="text-[12px] text-red-600">{anyError[1]}</p>
        )}
      </div>

      <div className="border border-gray-200/60 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse">
          <thead>
            <tr className="bg-[#fafafa] border-b border-gray-200">
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider w-[92px]">
                Day
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  title={c.title}
                  className={
                    'px-2.5 py-2 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider border-l border-gray-100 ' +
                    c.width
                  }
                >
                  {c.label}
                </th>
              ))}
              <th className="px-2.5 py-2 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider border-l border-gray-100 w-[60px]">
                Show
              </th>
              <th className="px-2.5 py-2 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider border-l border-gray-100 w-[60px]">
                Close
              </th>
              <th className="px-2 py-2 border-l border-gray-100 w-[76px]" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { num, wd, weekend } = dayCell(row.dayKey);
              const submitted = !!row.confirmedAt;
              const saving = savingDay === row.dayKey;

              // Rates off whichever numbers currently apply to this day.
              const v = (k: string) => {
                const c = row.managerCorrected?.[k];
                if (typeof c === 'number') return c;
                const r = row.reported?.[k];
                if (typeof r === 'number') return r;
                return row.measuredExists ? (row.measured[k] ?? 0) : 0;
              };
              const booked = v('booked');
              const taken = v('taken');
              const closes = v('closes');

              return (
                <tr
                  key={row.dayKey}
                  className={
                    'border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60 ' +
                    (weekend && !submitted ? 'bg-gray-50/40' : '')
                  }
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={
                        'inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle ' +
                        (submitted ? 'bg-emerald-500' : 'bg-gray-300')
                      }
                      title={submitted ? 'Submitted' : 'Not submitted'}
                    />
                    <span className={'text-[13px] font-mono ' + (submitted ? 'text-black' : 'text-gray-400')}>
                      {num}
                    </span>
                    <span className="ml-1.5 text-[11px] text-gray-400">{wd}</span>
                  </td>

                  {COLUMNS.map((c) => (
                    <Cell
                      key={c.key}
                      row={row}
                      col={c}
                      disabled={saving}
                      onCommit={(k, val) => onCommit(row.dayKey, k, val)}
                    />
                  ))}

                  <td className="px-2.5 py-2 text-right text-[12px] font-mono text-gray-500 border-l border-gray-100">
                    {pct(booked > 0 ? (taken / booked) * 100 : null)}
                  </td>
                  <td className="px-2.5 py-2 text-right text-[12px] font-mono text-gray-500 border-l border-gray-100">
                    {pct(taken > 0 ? (closes / taken) * 100 : null)}
                  </td>

                  <td className="px-2 py-2 text-right border-l border-gray-100">
                    {saving ? (
                      <span className="text-[11px] text-gray-400">saving…</span>
                    ) : submitted ? (
                      <span className="text-[11px] text-emerald-600">✓</span>
                    ) : (
                      // Explicit confirm for a day where our numbers are already
                      // right — otherwise agreeing with us requires pretending
                      // to edit something.
                      <button
                        type="button"
                        onClick={() => onConfirm(row.dayKey)}
                        className="text-[11px] text-gray-500 hover:text-black underline underline-offset-2"
                      >
                        submit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
