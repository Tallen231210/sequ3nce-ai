import React, { useState, useEffect, useCallback } from 'react';
import {
  type CloserInfo,
  getCloserPerformance,
  getCloserDailyEntries,
  saveCloserDailyEntry,
  getTeamLeaderboardForCloser,
  getCloserYearPerformance,
  type SelfPerformance,
  type SelfYearPerformance,
  type DailyEntryRow,
  type LeaderboardRow,
} from '../convex';
import { PerformanceDayForm } from './PerformanceDayForm';
import { PerformanceGrid } from './PerformanceGrid';
import { PerformanceStats } from './PerformanceStats';
import { PerformanceYear } from './PerformanceYear';

type Section = 'today' | 'history' | 'stats' | 'year';

const SECTIONS: Array<[Section, string]> = [
  ['today', 'Today'],
  ['history', 'Previous days'],
  ['stats', 'My stats'],
  ['year', 'Year'],
];

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map((s) => parseInt(s, 10));
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/**
 * Where closers report their day.
 *
 * The manager board counts only what's submitted here, so this is the source
 * of the team's numbers rather than a supplement to them. Everything arrives
 * pre-filled from what the meeting bot recorded, which makes a normal day a
 * glance and a tap — but nothing counts until it's submitted.
 */
export function PerformanceView({ closerInfo }: { closerInfo: CloserInfo }) {
  const [section, setSection] = useState<Section>('today');
  const [monthKey] = useState(currentMonthKey);

  const [perf, setPerf] = useState<SelfPerformance | null>(null);
  const [rows, setRows] = useState<DailyEntryRow[]>([]);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [yearData, setYearData] = useState<SelfYearPerformance | null>(null);
  const [yearLoading, setYearLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingDay, setSavingDay] = useState<string | null>(null);
  const [errorDay, setErrorDay] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    const [p, entries, lb] = await Promise.all([
      getCloserPerformance(closerInfo.closerId, monthKey),
      getCloserDailyEntries(closerInfo.closerId, monthKey),
      getTeamLeaderboardForCloser(closerInfo.closerId, monthKey),
    ]);
    setPerf(p);
    setRows(entries?.rows ?? []);
    setBoard(lb?.rows ?? []);
    setLoading(false);
  }, [closerInfo.closerId, monthKey]);

  useEffect(() => { void load(); }, [load]);

  // Fetched only once the Year tab is opened — it reads a year of the team's
  // daily rows, which is no small query to run for a tab nobody clicked.
  useEffect(() => {
    if (section !== 'year') return;
    let cancelled = false;
    setYearLoading(true);
    void getCloserYearPerformance(closerInfo.closerId, year).then((d) => {
      if (cancelled) return;
      setYearData(d);
      setYearLoading(false);
    });
    return () => { cancelled = true; };
  }, [section, year, closerInfo.closerId]);

  const submitDay = async (dayKey: string, values: Record<string, number | null>) => {
    setSavingDay(dayKey);
    setErrorDay((e) => ({ ...e, [dayKey]: null }));
    const res = await saveCloserDailyEntry(closerInfo.closerId, dayKey, values);
    if (!res.success) {
      setErrorDay((e) => ({ ...e, [dayKey]: res.error ?? 'Could not save' }));
      setSavingDay(null);
      return;
    }
    // Reload rather than patch locally: a manager may have corrected the day
    // since it loaded, and their figure is the one that counts.
    await load();
    setSavingDay(null);
  };

  // Editing a cell submits that day: a closer correcting a number IS a closer
  // telling us the day is right, so it needs no separate confirm action.
  const commitCell = (dayKey: string, key: string, value: number | null) =>
    submitDay(dayKey, { [key]: value });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[13px] text-gray-400">
        Loading your numbers…
      </div>
    );
  }

  const today = rows[0] ?? null;
  const previous = rows.slice(1);
  const outstanding = rows.filter((r) => !r.confirmedAt).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">My numbers</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">
            What you submit here is what your team's board shows
          </p>
        </div>
        {perf && (
          <div className="text-right">
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
              Submitted
            </div>
            <div className="text-[20px] font-bold text-black font-mono leading-tight">
              {perf.daysSubmitted}/{perf.daysElapsed}
            </div>
          </div>
        )}
      </div>

      {outstanding > 0 && (
        <div className="mb-5 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
          <p className="text-[12px] text-amber-800 leading-relaxed">
            <span className="font-semibold">
              {outstanding} day{outstanding === 1 ? '' : 's'} not submitted.
            </span>{' '}
            Days you don't submit don't count toward your totals or the team
            board — they aren't estimated for you.
          </p>
        </div>
      )}

      <nav className="flex gap-1 border-b border-gray-200 mb-5">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={
              'relative px-3.5 py-2 text-[13px] font-medium transition-colors ' +
              (section === id
                ? 'text-black after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-black'
                : 'text-gray-500 hover:text-black')
            }
          >
            {label}
            {id === 'history' && outstanding > 1 && (
              <span className="ml-1.5 text-[10px] text-amber-600 font-semibold">
                {outstanding - (today && !today.confirmedAt ? 1 : 0)}
              </span>
            )}
          </button>
        ))}
      </nav>

      {section === 'today' && today && (
        <div className="bg-[#fafafa] border border-gray-200/60 rounded-lg p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-black">
              {dayLabel(today.dayKey)}
            </h2>
            {today.confirmedAt && (
              <span className="text-[11px] font-medium text-emerald-600">
                Submitted
              </span>
            )}
          </div>

          {/* The prompt has to differ. Asking someone to "confirm" a row of
              zeros we never recorded is how you teach them the tool is wrong —
              and telling someone who already submitted that "nothing is filled
              in" contradicts the filled-in form directly below it. */}
          <p className="text-[12px] text-gray-500 leading-relaxed mb-4">
            {today.confirmedAt
              ? 'You’ve submitted today. Change anything that needs correcting and hit Update — you can do this any time, including weeks from now.'
              : today.measuredExists
                ? 'These are the calls we recorded today. Check them, fix anything that’s off, and submit.'
                : 'We only capture numbers automatically when the meeting bot joins your calls — it didn’t today, so nothing is filled in. Enter your day below.'}
          </p>

          <PerformanceDayForm
            row={today}
            saving={savingDay === today.dayKey}
            error={errorDay[today.dayKey] ?? null}
            onSubmit={(v) => void submitDay(today.dayKey, v)}
          />
        </div>
      )}

      {section === 'history' && (
        <PerformanceGrid
          rows={previous}
          savingDay={savingDay}
          errors={errorDay}
          onCommit={(d, k, v) => void commitCell(d, k, v)}
          onConfirm={(d) => void submitDay(d, {})}
        />
      )}

      {section === 'stats' && (
        <PerformanceStats perf={perf} board={board} />
      )}

      {section === 'year' && (
        yearLoading && !yearData ? (
          <div className="text-[13px] text-gray-400 py-8 text-center">
            Loading your year…
          </div>
        ) : (
          <PerformanceYear data={yearData} onYearChange={setYear} />
        )
      )}
    </div>
  );
}
