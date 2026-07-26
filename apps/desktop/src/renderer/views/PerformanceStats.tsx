import React from 'react';
import type { SelfPerformance, LeaderboardRow } from '../convex';

const money = (n: number | null | undefined, compact = false) => {
  if (n === null || n === undefined) return '—';
  if (compact && Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
};
const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${Math.round(n)}%`;

const RAG: Record<string, string> = {
  green: 'text-emerald-600', amber: 'text-amber-600', red: 'text-red-600', na: 'text-gray-400',
};

const LABEL = 'text-[11px] font-medium text-gray-500 uppercase tracking-wider';
const CARD = 'bg-[#fafafa] border border-gray-200/60 rounded-lg';

function Metric({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: string;
}) {
  return (
    <div className={CARD + ' p-4'}>
      <div className={LABEL + ' mb-1.5'}>{label}</div>
      <div className={'text-2xl font-bold font-mono leading-tight ' + (tone ?? 'text-black')}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * Their funnel, with the loss at each step named.
 *
 * Same shape as the manager board: the count is the easy half, the number that
 * changes behaviour is how many were lost getting there.
 */
function Funnel({ t }: { t: SelfPerformance['totals'] }) {
  const stages = [
    { label: 'Slots', value: t.slots, lost: 0, lostLabel: '' },
    { label: 'Booked', value: t.booked, lost: Math.max(0, t.slots - t.booked), lostLabel: 'unfilled' },
    { label: 'Taken', value: t.taken, lost: Math.max(0, t.booked - t.taken), lostLabel: 'no-showed' },
    { label: 'Offers', value: t.offers, lost: Math.max(0, t.taken - t.offers), lostLabel: 'no offer' },
    { label: 'Closes', value: t.closes, lost: Math.max(0, t.offers - t.closes), lostLabel: "didn't close" },
  ];
  const max = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className={CARD + ' p-4'}>
      <div className={LABEL + ' mb-3'}>Your funnel</div>
      {stages.map((s, i) => (
        <div key={s.label}>
          {i > 0 && (
            <div className="flex items-center gap-2 py-1 pl-[104px] text-[10px]">
              <span className="font-mono text-gray-600">
                {stages[i - 1].value > 0 ? `${Math.round((s.value / stages[i - 1].value) * 100)}%` : '—'}
              </span>
              {s.lost > 0 && (
                <span className="text-gray-400">· {s.lost} {s.lostLabel}</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <span className={LABEL + ' w-[52px] text-right'}>{s.label}</span>
            <span className="w-[44px] text-right text-[15px] font-bold font-mono text-black">
              {s.value}
            </span>
            <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full bg-black rounded transition-all duration-500"
                style={{ width: `${Math.max((s.value / max) * 100, s.value > 0 ? 2 : 0)}%` }}
              />
            </div>
          </div>
        </div>
      ))}
      <div className="mt-3 pt-3 border-t border-gray-200/60 flex items-baseline gap-2 pl-[104px]">
        <span className={LABEL}>Cash</span>
        <span className="text-xl font-bold font-mono text-black">{money(t.cash)}</span>
      </div>
    </div>
  );
}

export function PerformanceStats({
  perf, board,
}: {
  perf: SelfPerformance | null;
  board: LeaderboardRow[];
}) {
  if (!perf) return <p className="text-[13px] text-gray-400">No numbers yet this month.</p>;

  const t = perf.totals;
  const p = perf.projection;
  const weekMax = Math.max(...(perf.weekCash ?? [0]), 1);

  return (
    <div className="space-y-5">
      {perf.daysSubmitted === 0 && (
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
          sub={perf.avgCash !== null ? `${money(perf.avgCash)} collected` : undefined}
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
        <div className={LABEL + ' mb-2.5'}>Your rates</div>
        <div className="grid grid-cols-4 gap-3">
          {([
            ['Booked', perf.rates.bookedPct, perf.rag.bookedPct, perf.targets.bookedPct],
            ['Show', perf.rates.showPct, perf.rag.showPct, perf.targets.showPct],
            ['Offer → Close', perf.rates.offerClosePct, perf.rag.offerClosePct, perf.targets.offerClosePct],
            ['Close', perf.rates.closePct, perf.rag.closePct, perf.targets.closePct],
          ] as const).map(([label, value, rag, target]) => (
            <div key={label} className={CARD + ' p-4'}>
              <div className={LABEL + ' mb-1.5'}>{label}</div>
              <div className="flex items-baseline gap-1.5">
                <span className={'text-2xl font-bold font-mono leading-tight ' + (RAG[rag] ?? 'text-black')}>
                  {pct(value)}
                </span>
                <span className="text-[11px] text-gray-400 font-mono">/ {target}%</span>
              </div>
              <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={'h-full rounded-full ' + (RAG[rag]?.replace('text-', 'bg-') ?? 'bg-black')}
                  style={{ width: `${Math.min(100, ((value ?? 0) / Math.max(target, 1)) * 100)}%` }}
                />
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

      <div className="grid grid-cols-[1fr_280px] gap-3 items-start">
        <Funnel t={t} />

        <div className="space-y-3">
          <div className={CARD + ' p-4'}>
            <div className="flex items-center justify-between mb-2">
              <span className={LABEL}>{p?.isFinal ? 'Final' : 'Pace'}</span>
              {!p?.isFinal && perf.goal ? (
                <span className={
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded ' +
                  (p.onTrack ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')
                }>
                  {p.onTrack ? 'On track' : 'Behind'}
                </span>
              ) : null}
            </div>
            <div className="text-2xl font-bold font-mono text-black leading-tight">
              {money(t.cash)}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              day {p?.daysElapsed} {perf.goal ? `of ${money(perf.goal)} goal` : ''}
            </div>
            {perf.goal ? (
              <>
                <div className="mt-2.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={'h-full rounded-full ' + ((p?.pctOfTarget ?? 0) >= 100 ? 'bg-emerald-500' : 'bg-black')}
                    style={{ width: `${Math.min(100, Math.max(0, p?.pctOfTarget ?? 0))}%` }}
                  />
                </div>
                <dl className="mt-3 space-y-1.5 text-[11px] border-t border-gray-200/60 pt-2.5">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Projected</dt>
                    <dd className="font-mono text-black">{money(p?.projectedCash)}</dd>
                  </div>
                  {p && p.daysLeft > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Needed / day</dt>
                      <dd className="font-mono text-black">{money(p.needPerDay)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Days left</dt>
                    <dd className="font-mono text-black">{p?.daysLeft}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="mt-2 text-[11px] text-gray-400">
                Ask your manager to set a monthly cash goal to see pace.
              </p>
            )}
          </div>

          {perf.prize && (
            <div className={
              'rounded-lg p-4 border ' +
              (perf.prize.unlocked
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-[#fafafa] border-gray-200/60')
            }>
              <div className={LABEL + ' mb-2'}>Team prize</div>
              <div className="flex items-center gap-2.5">
                {perf.prize.emoji && <span className="text-xl leading-none">{perf.prize.emoji}</span>}
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-black truncate">{perf.prize.name}</div>
                  <div className="text-[11px] text-gray-500 font-mono">
                    {money(perf.prize.collected)} / {money(perf.prize.target)}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={'h-full rounded-full ' + (perf.prize.unlocked ? 'bg-emerald-500' : 'bg-black')}
                  style={{ width: `${Math.min(100, Math.max(0, perf.prize.pct))}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-gray-500">
                {perf.prize.unlocked
                  ? 'Unlocked'
                  : `${money(perf.prize.remaining)} to go — team total`}
              </p>
            </div>
          )}

          <div className={CARD + ' p-4'}>
            <div className={LABEL + ' mb-3'}>Your cash by week</div>
            <div className="flex items-end gap-1.5">
              {(perf.weekCash ?? []).map((c, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] font-mono text-gray-400">
                    {c > 0 ? money(c, true) : ''}
                  </span>
                  <div className="flex h-12 w-full items-end">
                    <div
                      className="w-full bg-black/20 rounded-sm"
                      style={{ height: `${Math.max((c / weekMax) * 100, c > 0 ? 6 : 2)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-gray-400">W{i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className={LABEL + ' mb-2.5'}>Team this month</div>
        <div className={CARD + ' overflow-hidden'}>
          {board.length === 0 && (
            <p className="px-4 py-6 text-[13px] text-gray-400">
              Nobody has submitted a day yet this month.
            </p>
          )}
          {board.map((r, i) => (
            <div
              key={r.closerId}
              className={
                'flex items-center gap-3 px-4 py-2.5 ' +
                (i > 0 ? 'border-t border-gray-200/60 ' : '') +
                (r.isYou ? 'bg-white' : '')
              }
            >
              <span className="w-5 text-[12px] font-mono text-gray-400">{i + 1}</span>
              <span className={'flex-1 text-[13px] ' + (r.isYou ? 'font-semibold text-black' : 'text-gray-700')}>
                {r.name}
                {r.isYou && <span className="ml-1.5 text-[11px] text-gray-400">you</span>}
              </span>
              <span className="w-14 text-right text-[12px] font-mono text-gray-500">{r.taken}</span>
              <span className="w-14 text-right text-[12px] font-mono text-gray-500">{pct(r.closePct)}</span>
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
