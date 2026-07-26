import React from 'react';
import type { SelfPerformance, LeaderboardRow } from '../convex';

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `$${Math.round(n).toLocaleString()}`;
const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${Math.round(n)}%`;

const RAG: Record<string, string> = {
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  red: 'text-red-600',
  na: 'text-gray-400',
};

function Metric({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-[#fafafa] border border-gray-200/60 rounded-lg p-4">
      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </div>
      <div className={'text-2xl font-bold font-mono leading-tight ' + (tone ?? 'text-black')}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * The closer's own month, plus where they sit on the team.
 *
 * Shows their own economics but not the team's — no ad spend, no rep comp, and
 * no Net or ROAS for anyone else. From another rep's Net you can solve back to
 * cost-per-booked and from there approximate the ad budget, which is the
 * number managers most often want kept in.
 */
export function PerformanceStats({
  perf,
  board,
}: {
  perf: SelfPerformance | null;
  board: LeaderboardRow[];
}) {
  if (!perf) {
    return <p className="text-[13px] text-gray-400">No numbers yet this month.</p>;
  }

  const t = perf.totals;
  const nothingYet = perf.daysSubmitted === 0;

  return (
    <div className="space-y-6">
      {nothingYet && (
        <p className="text-[12px] text-gray-500">
          Nothing here until you submit a day — these are your reported numbers,
          not our estimate of them.
        </p>
      )}

      <div className="grid grid-cols-4 gap-3">
        <Metric label="Cash collected" value={money(t.cash)} sub={`${t.closes} closes`} />
        <Metric
          label="Avg deal"
          value={money(perf.avgDeal)}
          sub={perf.avgCash !== null ? `${money(perf.avgCash)} collected per close` : undefined}
        />
        <Metric label="Calls taken" value={String(t.taken)} sub={`${t.booked} booked`} />
        <Metric
          label="Goal"
          value={perf.pctGoal === null ? '—' : pct(perf.pctGoal)}
          sub={perf.goal ? `of ${money(perf.goal)}` : 'no goal set'}
          tone={perf.pctGoal !== null && perf.pctGoal >= 100 ? 'text-emerald-600' : undefined}
        />
      </div>

      <div>
        <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2.5">
          Your rates
        </div>
        <div className="grid grid-cols-4 gap-3">
          {([
            ['Booked', perf.rates.bookedPct, perf.rag.bookedPct, perf.targets.bookedPct],
            ['Show', perf.rates.showPct, perf.rag.showPct, perf.targets.showPct],
            ['Offer → Close', perf.rates.offerClosePct, perf.rag.offerClosePct, perf.targets.offerClosePct],
            ['Close', perf.rates.closePct, perf.rag.closePct, perf.targets.closePct],
          ] as const).map(([label, value, rag, target]) => (
            <div key={label} className="bg-[#fafafa] border border-gray-200/60 rounded-lg p-4">
              <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                {label}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={'text-2xl font-bold font-mono leading-tight ' + (RAG[rag] ?? 'text-black')}>
                  {pct(value)}
                </span>
                <span className="text-[11px] text-gray-400 font-mono">/ {target}%</span>
              </div>
            </div>
          ))}
        </div>
        {!perf.capacityReliable && (
          <p className="mt-2 text-[11px] text-gray-400">
            Booked % needs a Slots figure to measure against — fill it in on your
            daily numbers and it will appear.
          </p>
        )}
      </div>

      <div>
        <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2.5">
          Team this month
        </div>
        <div className="bg-[#fafafa] border border-gray-200/60 rounded-lg overflow-hidden">
          {board.length === 0 && (
            <p className="px-4 py-6 text-[13px] text-gray-400">
              Nobody has submitted a day yet this month.
            </p>
          )}
          {board.map((r, i) => (
            <div
              key={r.closerId}
              className={
                'flex items-center gap-3 px-4 py-3 ' +
                (i > 0 ? 'border-t border-gray-200/60 ' : '') +
                (r.isYou ? 'bg-white' : '')
              }
            >
              <span className="w-5 text-[12px] font-mono text-gray-400">{i + 1}</span>
              <span className={'flex-1 text-[13px] ' + (r.isYou ? 'font-semibold text-black' : 'text-gray-700')}>
                {r.name}
                {r.isYou && <span className="ml-1.5 text-[11px] text-gray-400">you</span>}
              </span>
              <span className="w-16 text-right text-[12px] font-mono text-gray-500">
                {pct(r.closePct)}
              </span>
              <span className="w-24 text-right text-[13px] font-mono font-semibold text-black">
                {money(r.cash)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
