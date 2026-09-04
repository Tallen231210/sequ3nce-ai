"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { tierHas } from '@/lib/tiers';
import type {
  CloserInfo,
  CloserStats,
  AnalyticsSummary,
  LostDealsData,
  ObjectionAnalysisData,
} from '@/lib/closer/client';
import {
  getCloserStats,
  getAnalyticsSummary,
  getLostDealsByObjection,
  getObjectionAnalysis,
} from '@/lib/closer/client';
import { DateRangePicker } from './DateRangePicker';
import { dealValueLabels, getCloserInfo } from "@/lib/closer/session";

/** Team-specific name for the contract-value field (see session.ts). */
const dealLabels = () => dealValueLabels(getCloserInfo());

interface StatsViewProps {
  closerInfo: CloserInfo;
}

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'custom', label: 'Custom' },
] as const;

export function StatsView({ closerInfo }: StatsViewProps) {
  // Talk ratio comes from diarising the call audio. Without a recording it is
  // structurally unmeasurable, not merely zero.
  const canMeasureTalkRatio = tierHas(closerInfo.productTier, "callIntelligence");
  const [period, setPeriod] = useState('week');
  const [customStart, setCustomStart] = useState<number | null>(null);
  const [customEnd, setCustomEnd] = useState<number | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [stats, setStats] = useState<CloserStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [lostDeals, setLostDeals] = useState<LostDealsData | null>(null);
  const [objections, setObjections] = useState<ObjectionAnalysisData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (period === 'custom' && (!customStart || !customEnd)) return;
    loadAll();
  }, [period, customStart, customEnd, closerInfo.closerId]);

  async function loadAll() {
    setIsLoading(true);
    const extra = period === 'custom' && customStart && customEnd
      ? { customStart, customEnd }
      : undefined;
    try {
      const [s, a, l, o] = await Promise.all([
        getCloserStats(closerInfo.closerId, period, extra?.customStart, extra?.customEnd),
        getAnalyticsSummary(closerInfo.closerId, closerInfo.teamId, period, extra?.customStart, extra?.customEnd),
        getLostDealsByObjection(closerInfo.closerId, closerInfo.teamId, period, extra?.customStart, extra?.customEnd),
        getObjectionAnalysis(closerInfo.closerId, closerInfo.teamId, period, extra?.customStart, extra?.customEnd),
      ]);
      setStats(s);
      setAnalytics(a);
      setLostDeals(l);
      setObjections(o);
    } catch (error) {
      console.error('[Stats] Failed to load data:', error);
    }
    setIsLoading(false);
  }

  const handlePeriodChange = useCallback((value: string) => {
    setPeriod(value);
    if (value === 'custom') {
      setShowDatePicker(true);
    } else {
      setShowDatePicker(false);
    }
  }, []);

  const handleDateRangeApply = useCallback((start: number, end: number) => {
    setCustomStart(start);
    setCustomEnd(end);
    setShowDatePicker(false);
  }, []);

  const handleDateRangeClear = useCallback(() => {
    setCustomStart(null);
    setCustomEnd(null);
    setPeriod('week');
    setShowDatePicker(false);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1200px] p-6 lg:p-8">
      {/* Header + Period Selector */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Performance</h1>
        <div className="relative flex gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handlePeriodChange(opt.value)}
              className={`text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-colors ${
                period === opt.value
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {opt.value === 'custom' && customStart && customEnd
                ? `${new Date(customStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(customEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : opt.label}
            </button>
          ))}
          {showDatePicker && (
            <div className="absolute top-full right-0 mt-2 z-50">
              <DateRangePicker
                onApply={handleDateRangeApply}
                onClear={handleDateRangeClear}
                initialStart={customStart}
                initialEnd={customEnd}
              />
            </div>
          )}
        </div>
      </div>

      {/* Stat Cards — 4 columns */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <StatCard
          icon={<PhoneIcon />}
          title={periodLabel('Calls', period)}
          value={String(stats?.callsThisPeriod ?? 0)}
        />
        <StatCard icon={<TargetIcon />} title="Close Rate" value={`${Math.round(stats?.closeRate ?? 0)}%`} />
        <StatCard icon={<DollarIcon />} title="Cash Collected" value={formatCurrency(stats?.cashCollected ?? 0)} />
        <StatCard icon={<DocIcon />} title={dealLabels().long} value={formatCurrency(stats?.totalContractValue ?? 0)} />
        <StatCard icon={<ClockIcon />} title="Avg Call Duration" value={formatDuration(stats?.avgCallDuration ?? 0)} />
        {/* Talk ratio is measured from the recording's audio. With no
            recording it is permanently 0%, which reads as "you never speak"
            rather than "we can't measure this". */}
        {canMeasureTalkRatio && (
          <StatCard icon={<WaveformIcon />} title="Talk Ratio" value={`${Math.round(stats?.avgTalkRatio ?? 0)}%`} />
        )}
        <StatCard
          icon={<DollarIcon />}
          title="Revenue / Call"
          value={`${formatCurrency(stats?.revenuePerCallCash ?? 0)} / ${formatCurrency(stats?.revenuePerCallContract ?? 0)}`}
          subtitle="cash / contract"
          trend={stats?.revenuePerCallTrend}
        />
        <StatCard
          icon={<DollarIcon />}
          title="Revenue / Sit"
          value={`${formatCurrency(stats?.revenuePerSitCash ?? 0)} / ${formatCurrency(stats?.revenuePerSitContract ?? 0)}`}
          subtitle="excl. no-shows"
          trend={stats?.revenuePerSitTrend}
        />
      </div>

      {/* Team Comparison */}
      <TeamComparisonSection stats={stats} canMeasureTalkRatio={canMeasureTalkRatio} />

      {/* Money Overview */}
      <MoneyOverviewSection analytics={analytics} />

      {/* Lost Deals */}
      <LostDealsSection data={lostDeals} />

      {/* Objection Handling */}
      <ObjectionHandlingSection data={objections} />

      {/* Insights */}
      <InsightsSection insights={objections?.insights} />

      <div className="h-10" />
    </div>
  );
}

// --- Team Comparison Section ---

function TeamComparisonSection({
  stats,
  canMeasureTalkRatio,
}: {
  stats: CloserStats | null;
  /** False without a recording — talk ratio is diarised from audio. */
  canMeasureTalkRatio: boolean;
}) {
  if (!stats) return null;

  const rows = [
    {
      label: 'Close Rate',
      yours: `${Math.round(stats.closeRate)}%`,
      team: `${Math.round(stats.teamAvgCloseRate)}%`,
      yourVal: stats.closeRate,
      teamVal: stats.teamAvgCloseRate,
    },
    {
      label: 'Cash Collected',
      yours: formatCurrency(stats.cashCollected),
      team: formatCurrency(stats.teamAvgCash),
      yourVal: stats.cashCollected,
      teamVal: stats.teamAvgCash,
    },
    {
      label: 'Calls Taken',
      yours: String(stats.callsThisPeriod),
      team: stats.teamAvgCalls.toFixed(1),
      yourVal: stats.callsThisPeriod,
      teamVal: stats.teamAvgCalls,
    },
    {
      label: 'Avg Duration',
      yours: formatDuration(stats.avgCallDuration),
      team: formatDuration(stats.teamAvgDuration),
      yourVal: stats.avgCallDuration,
      teamVal: stats.teamAvgDuration,
    },
    ...(canMeasureTalkRatio
      ? [
          {
            label: 'Talk Ratio',
            yours: `${Math.round(stats.avgTalkRatio)}%`,
            team: `${Math.round(stats.teamAvgTalkRatio)}%`,
            yourVal: stats.avgTalkRatio,
            teamVal: stats.teamAvgTalkRatio,
          },
        ]
      : []),
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">You vs Team Average</span>
        {stats.teamSize > 0 && (
          <span className="text-[11px] text-gray-400">{stats.teamSize} closers</span>
        )}
      </div>
      <div className="bg-[#fafafa] border border-gray-200/60 rounded-lg p-4 space-y-4">
        {rows.map((row) => (
          <ComparisonRow key={row.label} {...row} />
        ))}
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  yours,
  team,
  yourVal,
  teamVal,
}: {
  label: string;
  yours: string;
  team: string;
  yourVal: number;
  teamVal: number;
}) {
  const maxVal = Math.max(yourVal, teamVal, 1);

  return (
    <div>
      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">{label}</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[12px] text-black mb-1">You: {yours}</div>
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-black rounded-full transition-all duration-500"
              style={{ width: `${Math.max((yourVal / maxVal) * 100, 1)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="text-[12px] text-gray-500 mb-1">Team: {team}</div>
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.max((teamVal / maxVal) * 100, 1)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Money Overview Section ---

function MoneyOverviewSection({ analytics }: { analytics: AnalyticsSummary | null }) {
  return (
    <div className="mb-8">
      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2.5">Money Overview</div>
      {analytics ? (
        <div className="grid grid-cols-3 gap-3">
          <TrendCard
            title="Total Pitched"
            value={formatCurrency(analytics.totalPitched)}
            trend={analytics.trends.pitched}
          />
          <TrendCard
            title="Total Closed"
            value={formatCurrency(analytics.totalClosed)}
            trend={analytics.trends.closed}
          />
          <TrendCard
            title="Left on Table"
            value={formatCurrency(analytics.leftOnTable)}
            trend={analytics.trends.leftOnTable}
            invertTrend
          />
        </div>
      ) : (
        <div className="text-sm text-gray-500 text-center py-5">No data for this period</div>
      )}
    </div>
  );
}

function TrendCard({
  title,
  value,
  trend,
  invertTrend = false,
}: {
  title: string;
  value: string;
  trend: number;
  invertTrend?: boolean;
}) {
  const isPositive = trend >= 0;
  const showGreen = invertTrend ? !isPositive : isPositive;

  return (
    <div className="bg-white border border-gray-200/60 rounded-lg p-3.5">
      <div className="text-2xl font-bold text-black font-mono leading-tight mb-1">{value}</div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{title}</span>
        {trend !== 0 && (
          <span
            className="text-[10px] font-medium flex items-center gap-0.5"
            style={{ color: showGreen ? '#22883a' : '#dc2626' }}
          >
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
              {isPositive ? (
                <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M12.293 14.707a1 1 0 010-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              )}
            </svg>
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

// --- Lost Deals Section ---

function LostDealsSection({ data }: { data: LostDealsData | null }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
          Where You're Losing Money
        </span>
        {data && data.totalDeals > 0 && (
          <span className="text-[11px] text-gray-400">
            {data.totalDeals} deals &middot; {formatCurrency(data.totalLost)}
          </span>
        )}
      </div>

      {data && data.objections.length > 0 ? (
        <div className="bg-[#fafafa] border border-gray-200/60 rounded-lg p-4">
          {/* Problem area badges */}
          {data.problemAreas.length > 0 && (
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {data.problemAreas.map((area) => (
                <span
                  key={area}
                  className="text-[10px] font-medium px-2 py-0.5 rounded bg-red-50 text-red-600"
                >
                  {area}
                </span>
              ))}
            </div>
          )}

          {/* Objection rows */}
          <div className="space-y-3">
            {data.objections.map((obj) => (
              <ObjectionBarRow
                key={obj.objection}
                objection={obj}
                maxAmount={data.objections[0]?.lostAmount || 1}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500 text-center py-5">No lost deals this period</div>
      )}
    </div>
  );
}

function ObjectionBarRow({
  objection,
  maxAmount,
}: {
  objection: { objectionLabel: string; lostAmount: number; dealCount: number; trend: number };
  maxAmount: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-medium text-black">{objection.objectionLabel}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold text-red-600">{formatCurrency(objection.lostAmount)}</span>
          <span className="text-[10px] text-gray-500">
            {objection.dealCount} deal{objection.dealCount !== 1 ? 's' : ''}
          </span>
          {objection.trend !== 0 && (
            <span
              className="text-[9px] font-medium"
              style={{ color: objection.trend > 0 ? '#dc2626' : '#22883a' }}
            >
              {objection.trend > 0 ? '+' : ''}{Math.round(objection.trend)}%
            </span>
          )}
        </div>
      </div>
      <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-red-400/40 rounded-full transition-all duration-500"
          style={{ width: `${Math.max((objection.lostAmount / maxAmount) * 100, 2)}%` }}
        />
      </div>
    </div>
  );
}

// --- Objection Handling Section ---

function ObjectionHandlingSection({ data }: { data: ObjectionAnalysisData | null }) {
  const itemsWithRate = data?.lostObjections.filter((i) => i.overcomeRate != null) ?? [];

  return (
    <div className="mb-8">
      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2.5">
        Objection Handling
      </div>

      {itemsWithRate.length > 0 ? (
        <div className="bg-[#fafafa] border border-gray-200/60 rounded-lg p-4 space-y-3">
          {itemsWithRate.map((item) => (
            <OvercomeRateRow key={item.objection} item={item} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-500 text-center py-5">Not enough data yet</div>
      )}
    </div>
  );
}

function OvercomeRateRow({
  item,
}: {
  item: { objectionLabel: string; overcomeRate?: number };
}) {
  const rate = item.overcomeRate ?? 0;
  const color = rate >= 60 ? '#22883a' : rate >= 40 ? '#d9a300' : '#dc2626';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-medium text-black">{item.objectionLabel}</span>
        <span className="text-[12px] font-semibold" style={{ color }}>{rate}%</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(rate, 1)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// --- Insights Section ---

function InsightsSection({ insights }: { insights?: string[] }) {
  if (!insights || insights.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2.5">Insights</div>
      <div className="space-y-2">
        {insights.map((insight, i) => (
          <div key={i} className="flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg">
            <svg className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM4 11a1 1 0 100-2H3a1 1 0 000 2h1zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM7.757 14.243a1 1 0 10-1.414 1.414l.707.707a1 1 0 001.414-1.414l-.707-.707zM14.95 13.536a1 1 0 10-1.414 1.414l.707.707a1 1 0 001.414-1.414l-.707-.707zM10 6a4 4 0 00-1 7.874V15a1 1 0 102 0v-1.126A4 4 0 0010 6z" />
            </svg>
            <span className="text-[12px] text-gray-600">{insight}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Stat Card ---

function StatCard({ icon, title, value, subtitle, trend }: { icon: React.ReactNode; title: string; value: string; subtitle?: string; trend?: number | null }) {
  return (
    <div className="bg-white border border-gray-200/60 rounded-lg p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-gray-500">{icon}</div>
        {trend !== undefined && trend !== null && (
          <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${
            trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : 'text-gray-400'
          }`}>
            {trend > 0 ? (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
              </svg>
            ) : trend < 0 ? (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
              </svg>
            ) : null}
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-black font-mono leading-tight mb-1">{value}</div>
      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{title}</div>
      {subtitle && <div className="text-[9px] text-gray-400 mt-0.5">{subtitle}</div>}
    </div>
  );
}

// --- Helpers ---

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  if (minutes === 0 && secs === 0) return '\u2014';
  return `${minutes}m ${secs}s`;
}

function periodLabel(base: string, period: string): string {
  switch (period) {
    case 'today': return `${base} Today`;
    case 'week': return `${base} This Week`;
    case 'month': return `${base} This Month`;
    case 'last30': return `${base} (30 Days)`;
    default: return base;
  }
}

// --- Icons ---

function PhoneIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.736 6.979C9.208 6.193 9.696 6 10 6c.304 0 .792.193 1.264.979a1 1 0 001.715-1.029C12.279 4.784 11.232 4 10 4s-2.279.784-2.979 1.95c-.285.475-.507 1-.67 1.55H6a1 1 0 000 2h.013a9.358 9.358 0 000 1H6a1 1 0 100 2h.351c.163.55.385 1.075.67 1.55C7.721 15.216 8.768 16 10 16s2.279-.784 2.979-1.95a1 1 0 10-1.715-1.029c-.472.786-.96.979-1.264.979-.304 0-.792-.193-1.264-.979a5.35 5.35 0 01-.491-.971h2.226a1 1 0 100-2H8.092a7.45 7.45 0 010-1h3.378a1 1 0 100-2H8.245c.157-.354.348-.677.491-.971z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
    </svg>
  );
}

function WaveformIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M10 2a1 1 0 011 1v14a1 1 0 11-2 0V3a1 1 0 011-1zM6 6a1 1 0 011 1v6a1 1 0 11-2 0V7a1 1 0 011-1zM14 6a1 1 0 011 1v6a1 1 0 11-2 0V7a1 1 0 011-1zM2 9a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM18 9a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
    </svg>
  );
}
