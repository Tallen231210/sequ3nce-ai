"use client";

import React from 'react';
import type { SelfYearPerformance, YearMonthRow } from '@/lib/closer/client';
import { dealValueLabels, getCloserInfo } from "@/lib/closer/session";

/** Team-specific name for the contract-value field (see session.ts). */
const dealLabels = () => dealValueLabels(getCloserInfo());

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CHART_H = 132;

const money = (n: number) =>
  n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;
const fullMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n)}%`);

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-gray-200/60 rounded-lg px-4 py-3">
      <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-1 text-[22px] font-bold text-black font-mono leading-none">
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}

/**
 * Cash by month.
 *
 * Bar heights are computed in pixels against a fixed container, not as
 * percentages — a percentage height against a parent with no resolved height
 * collapses to nothing, which has silently blanked two charts in this app.
 */
function YearChart({ months }: { months: YearMonthRow[] }) {
  const max = Math.max(1, ...months.map((m) => m.totals.cash));

  return (
    <div className="border border-gray-200/60 rounded-lg p-4">
      <div className="flex items-end gap-1.5" style={{ height: CHART_H }}>
        {months.map((m) => {
          const h = m.hasData ? Math.max(2, Math.round((m.totals.cash / max) * CHART_H)) : 0;
          return (
            <div key={m.monthKey} className="flex-1 flex flex-col justify-end h-full group relative">
              {m.hasData && (
                <div className="absolute inset-x-0 -top-1 text-center text-[10px] font-mono text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  {money(m.totals.cash)}
                </div>
              )}
              <div
                style={{ height: h }}
                className={
                  'w-full rounded-sm transition-colors ' +
                  (m.isCurrent ? 'bg-black' : m.hasData ? 'bg-gray-300 group-hover:bg-gray-400' : '')
                }
                title={m.hasData ? `${MONTHS[m.monthIndex - 1]} — ${fullMoney(m.totals.cash)}` : ''}
              />
              {/* A month with nothing submitted gets a baseline tick, not a zero
                  bar — no data and a zero month must not look the same. */}
              {!m.hasData && !m.isFuture && (
                <div className="w-full h-px bg-gray-200" />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-2">
        {months.map((m) => (
          <div
            key={m.monthKey}
            className={
              'flex-1 text-center text-[10px] ' +
              (m.isCurrent ? 'text-black font-medium' : 'text-gray-400')
            }
          >
            {MONTHS[m.monthIndex - 1]}
          </div>
        ))}
      </div>
    </div>
  );
}

const COLS = [
  { key: 'booked', label: 'Booked' },
  { key: 'taken', label: 'Taken' },
  { key: 'offers', label: 'Offers' },
  { key: 'closes', label: 'Closes' },
] as const;

/**
 * The closer's year.
 *
 * Same reported-only rule as everywhere else — a month counts what they
 * submitted, nothing more — so this can never disagree with their manager's
 * board. Ad-spend columns are absent by design: net and cost per call would
 * let anyone back-solve the team's ad budget.
 */
export function PerformanceYear({
  data,
  onYearChange,
}: {
  data: SelfYearPerformance | null;
  onYearChange: (year: number) => void;
}) {
  if (!data) {
    return (
      <div className="text-[13px] text-gray-400 py-8 text-center">
        Couldn&apos;t load your year.
      </div>
    );
  }

  const { months, yearTotals } = data;
  const best = months.find((m) => m.monthKey === data.bestMonthKey) ?? null;
  const visible = months.filter((m) => m.hasData || m.isCurrent);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onYearChange(data.year - 1)}
            className="px-2 py-1 text-[13px] text-gray-400 hover:text-black transition-colors"
            aria-label="Previous year"
          >
            ‹
          </button>
          <span className="text-[15px] font-semibold text-black font-mono w-14 text-center">
            {data.year}
          </span>
          <button
            type="button"
            disabled={data.year >= data.currentYear}
            onClick={() => onYearChange(data.year + 1)}
            className="px-2 py-1 text-[13px] text-gray-400 hover:text-black disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
            aria-label="Next year"
          >
            ›
          </button>
        </div>
        <p className="text-[11px] text-gray-400">
          Only days you submitted are counted
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <Tile
          label="Cash"
          value={fullMoney(yearTotals.cash)}
          sub={`${yearTotals.closes} close${yearTotals.closes === 1 ? '' : 's'}`}
        />
        <Tile
          label={dealLabels().long}
          value={fullMoney(yearTotals.contractValue)}
          sub={
            yearTotals.closes > 0
              ? `${fullMoney(yearTotals.contractValue / yearTotals.closes)} avg deal`
              : undefined
          }
        />
        <Tile
          label="Avg / month"
          value={money(data.avgCashPerActiveMonth)}
          sub={`across ${data.activeMonths} month${data.activeMonths === 1 ? '' : 's'}`}
        />
        <Tile
          label="Best month"
          value={best ? MONTHS[best.monthIndex - 1] : '—'}
          sub={best ? fullMoney(best.totals.cash) : undefined}
        />
      </div>

      <YearChart months={months} />

      {visible.length === 0 ? (
        <p className="text-[12px] text-gray-400 text-center py-8">
          Nothing submitted in {data.year} yet.
        </p>
      ) : (
        <div className="mt-4 border border-gray-200/60 rounded-lg overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="bg-[#fafafa] border-b border-gray-200">
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Month
                </th>
                <th className="px-2.5 py-2 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider border-l border-gray-100">
                  Days
                </th>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    className="px-2.5 py-2 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider border-l border-gray-100"
                  >
                    {c.label}
                  </th>
                ))}
                <th className="px-2.5 py-2 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider border-l border-gray-100">
                  Cash
                </th>
                <th className="px-2.5 py-2 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider border-l border-gray-100">
                  Show
                </th>
                <th className="px-2.5 py-2 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider border-l border-gray-100">
                  Close
                </th>
                <th className="px-2.5 py-2 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider border-l border-gray-100">
                  Goal
                </th>
                <th className="px-2.5 py-2 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider border-l border-gray-100 w-[66px]">
                  MoM
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr
                  key={m.monthKey}
                  className={
                    'border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60 ' +
                    (m.isCurrent ? 'bg-gray-50/40' : '')
                  }
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={'text-[13px] ' + (m.isCurrent ? 'font-semibold text-black' : 'text-black')}>
                      {MONTHS[m.monthIndex - 1]}
                    </span>
                    {m.isCurrent && (
                      <span className="ml-1.5 text-[10px] text-gray-400">so far</span>
                    )}
                  </td>
                  <td className="px-2.5 py-2 text-right text-[12px] font-mono text-gray-500 border-l border-gray-100">
                    {m.daysSubmitted}
                    <span className="text-gray-300">/{m.daysInMonth}</span>
                  </td>
                  {COLS.map((c) => (
                    <td
                      key={c.key}
                      className="px-2.5 py-2 text-right text-[13px] font-mono text-black border-l border-gray-100"
                    >
                      {m.totals[c.key]}
                    </td>
                  ))}
                  <td className="px-2.5 py-2 text-right text-[13px] font-mono font-semibold text-black border-l border-gray-100">
                    {fullMoney(m.totals.cash)}
                  </td>
                  <td className="px-2.5 py-2 text-right text-[12px] font-mono text-gray-500 border-l border-gray-100">
                    {pct(m.rates.showPct)}
                  </td>
                  <td className="px-2.5 py-2 text-right text-[12px] font-mono text-gray-500 border-l border-gray-100">
                    {pct(m.rates.closePct)}
                  </td>
                  <td className="px-2.5 py-2 text-right text-[12px] font-mono border-l border-gray-100">
                    {m.pctGoal === null ? (
                      <span className="text-gray-300">—</span>
                    ) : (
                      <span className={m.pctGoal >= 100 ? 'text-emerald-600' : 'text-gray-500'}>
                        {Math.round(m.pctGoal)}%
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 py-2 text-right text-[12px] font-mono border-l border-gray-100">
                    {m.momPct === null ? (
                      <span className="text-gray-300">—</span>
                    ) : (
                      <span className={m.momPct >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                        {m.momPct >= 0 ? '+' : ''}
                        {Math.round(m.momPct)}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.truncated && (
        <p className="mt-3 text-[11px] text-amber-600">
          Your team has more days this year than we can read at once — figures
          above may be incomplete.
        </p>
      )}
    </div>
  );
}
