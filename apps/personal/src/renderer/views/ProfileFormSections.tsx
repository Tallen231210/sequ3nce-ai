import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { B2CProfile, MyLatestVerificationRequest } from '../convex';
import { getMyLatestVerificationRequest } from '../convex';
import { StatsVerificationModal } from './statsVerification/StatsVerificationModal';

// ==================== Tag Input Component ====================

interface TagInputProps {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  maxTags: number;
  suggestions: string[];
  placeholder?: string;
}

const INDUSTRY_SUGGESTIONS = [
  'Coaching', 'SaaS', 'Real Estate', 'Info Products', 'E-commerce',
  'Solar', 'Insurance', 'Financial Services', 'Health & Wellness', 'Agency',
];

const SKILL_SUGGESTIONS = [
  'Objection Handling', 'One-Call Closing', 'High-Ticket Closing',
  'Follow-Up Sequences', 'Tonality', 'SPIN Selling', 'Consultative Selling',
  'Inbound Closing', 'Outbound Closing', 'Discovery',
];

const TICKET_RANGES = ['$1k-$3k', '$3k-$10k', '$10k-$25k', '$25k-$50k', '$50k+'];

export { INDUSTRY_SUGGESTIONS, SKILL_SUGGESTIONS, TICKET_RANGES };

export function TagInput({ label, tags, onChange, maxTags, suggestions, placeholder }: TagInputProps) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed) || tags.length >= maxTags) return;
    onChange([...tags, trimmed]);
    setInput('');
    setShowSuggestions(true);
    inputRef.current?.focus();
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const filteredSuggestions = suggestions.filter(
    (s) => !tags.includes(s) && s.toLowerCase().includes(input.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300">
        {label}
        <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">
          ({tags.length}/{maxTags})
        </span>
      </label>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, i) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-3 py-1 text-[12px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="ml-0.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      {tags.length < maxTags && (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && input.trim()) {
                e.preventDefault();
                addTag(input);
              }
            }}
            placeholder={placeholder || `Add ${label.toLowerCase()}...`}
            className="w-full px-3 py-2 text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 placeholder-gray-400 dark:placeholder-gray-500"
          />

          {/* Suggestions dropdown */}
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(suggestion)}
                  className="w-full text-left px-3 py-2 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== Social Links Section ====================

interface SocialLinksProps {
  links: {
    linkedin?: string;
    twitter?: string;
    instagram?: string;
    website?: string;
    calendly?: string;
  };
  onChange: (links: SocialLinksProps['links']) => void;
}

const SOCIAL_FIELDS: { key: keyof SocialLinksProps['links']; label: string; placeholder: string }[] = [
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/yourname' },
  { key: 'twitter', label: 'X (Twitter)', placeholder: 'https://x.com/yourhandle' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
  { key: 'website', label: 'Website', placeholder: 'https://yourwebsite.com' },
  { key: 'calendly', label: 'Calendly', placeholder: 'https://calendly.com/yourname' },
];

export function SocialLinksSection({ links, onChange }: SocialLinksProps) {
  return (
    <div className="space-y-3">
      <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300">
        Social Links
      </label>
      {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
        <div key={key}>
          <label className="block text-[12px] text-gray-500 dark:text-gray-400 mb-1">{label}</label>
          <input
            type="url"
            value={links[key] || ''}
            onChange={(e) => onChange({ ...links, [key]: e.target.value })}
            placeholder={placeholder}
            className="w-full px-3 py-2 text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 placeholder-gray-400 dark:placeholder-gray-500"
          />
        </div>
      ))}
    </div>
  );
}

// ==================== Ticket Range Selector ====================

interface TicketRangeProps {
  value: string | null;
  onChange: (range: string) => void;
}

export function TicketRangeSelector({ value, onChange }: TicketRangeProps) {
  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300">
        Ticket Range
      </label>
      <div className="flex flex-wrap gap-2">
        {TICKET_RANGES.map((range) => (
          <button
            key={range}
            type="button"
            onClick={() => onChange(range)}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
              value === range
                ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
            {range}
          </button>
        ))}
      </div>
    </div>
  );
}

// ==================== Stats Section ====================

type ManualStats = B2CProfile['manualStats'];
type AutoStats = B2CProfile['autoStats'];

interface StatsSectionProps {
  userId: string;
  autoStats: AutoStats;
  manualStats: ManualStats;
  statsSource: "auto" | "manual" | "combined";
  isManuallyVerified: boolean;
  isVip?: boolean;
  onStatsSourceChange: (source: "auto" | "manual" | "combined") => void;
  onManualStatsChange: (stats: ManualStats) => void;
}

function formatStatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}k`;
  return `$${amount.toLocaleString()}`;
}

export function StatsSection({
  userId,
  autoStats,
  manualStats,
  statsSource,
  isManuallyVerified,
  isVip,
  onStatsSourceChange,
  onManualStatsChange,
}: StatsSectionProps) {
  const updateManualStat = (key: string, value: string) => {
    const num = value === '' ? undefined : Number(value);
    if (num !== undefined && isNaN(num)) return;
    onManualStatsChange({ ...manualStats, [key]: num });
  };

  const showCombinedOption = autoStats !== null && manualStats !== null;
  const activeStyle = 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white';
  const inactiveStyle = 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500';

  return (
    <div className="space-y-4">
      {/* Source toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onStatsSourceChange('auto')}
          className={`flex-1 px-3 py-2.5 text-[12px] font-medium rounded-lg border transition-colors ${statsSource === 'auto' ? activeStyle : inactiveStyle}`}
        >
          From Calls
        </button>
        <button
          type="button"
          onClick={() => onStatsSourceChange('manual')}
          className={`flex-1 px-3 py-2.5 text-[12px] font-medium rounded-lg border transition-colors ${statsSource === 'manual' ? activeStyle : inactiveStyle}`}
        >
          Manual
        </button>
        {showCombinedOption && (
          <button
            type="button"
            onClick={() => onStatsSourceChange('combined')}
            className={`flex-1 px-3 py-2.5 text-[12px] font-medium rounded-lg border transition-colors ${statsSource === 'combined' ? activeStyle : inactiveStyle}`}
          >
            Combined
          </button>
        )}
      </div>

      {statsSource === 'auto' ? (
        /* Auto stats — read-only display */
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
          {autoStats ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307z" clipRule="evenodd" />
                </svg>
                <span className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                  Verified by Sequ3nce
                </span>
              </div>
              <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-3">
                Computed from {autoStats.callsCompleted} recorded call{autoStats.callsCompleted !== 1 ? 's' : ''}.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <AutoStatCard label="Close Rate" value={autoStats.closeRate !== null ? `${autoStats.closeRate}%` : '—'} />
                <AutoStatCard label="Cash Collected" value={formatStatCurrency(autoStats.cashCollected)} />
                <AutoStatCard label="Calls" value={autoStats.callsCompleted.toLocaleString()} />
                <AutoStatCard label="Avg Deal" value={autoStats.avgDealSize !== null ? formatStatCurrency(autoStats.avgDealSize) : '—'} />
                <AutoStatCard label="Avg Duration" value={autoStats.avgDuration !== null ? `${Math.round(autoStats.avgDuration / 60)}m` : '—'} />
                <AutoStatCard label="Talk Ratio" value={autoStats.talkRatio !== null ? `${autoStats.talkRatio}%` : '—'} />
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-[13px] text-gray-500 dark:text-gray-400">
                No recorded calls yet. Record calls using the Sequ3nce bot to build verified stats.
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                Or switch to &quot;Manual&quot; to enter your stats.
              </p>
            </div>
          )}
        </div>
      ) : statsSource === 'combined' ? (
        /* Combined mode — manual baseline + auto on top */
        <>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
            <p className="text-[12px] text-emerald-700 dark:text-emerald-400">
              Your verified baseline stats plus data from {autoStats?.callsCompleted ?? 0} call{autoStats?.callsCompleted !== 1 ? 's' : ''} recorded through Sequ3nce. Stats grow as you take more calls.
            </p>
          </div>

          <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Baseline Stats (editable)
          </p>
          <div className="grid grid-cols-3 gap-3">
            <ManualStatInput
              label="Cash Collected ($)"
              value={manualStats?.cashCollected}
              onChange={(v) => updateManualStat('cashCollected', v)}
              placeholder="2340000"
            />
            <ManualStatInput
              label="Close Rate (%)"
              value={manualStats?.closeRate}
              onChange={(v) => updateManualStat('closeRate', v)}
              placeholder="36"
              max={100}
            />
            <ManualStatInput
              label="Calls Completed"
              value={manualStats?.callsCompleted}
              onChange={(v) => updateManualStat('callsCompleted', v)}
              placeholder="847"
              integer
            />
          </div>

          <VerificationStatusBlock
            userId={userId}
            isManuallyVerified={isManuallyVerified}
            isVip={isVip}
            manualStats={manualStats}
          />
        </>
      ) : (
        /* Manual stats — editable fields */
        <>
          <div className="grid grid-cols-3 gap-3">
            <ManualStatInput
              label="Cash Collected ($)"
              value={manualStats?.cashCollected}
              onChange={(v) => updateManualStat('cashCollected', v)}
              placeholder="2340000"
            />
            <ManualStatInput
              label="Close Rate (%)"
              value={manualStats?.closeRate}
              onChange={(v) => updateManualStat('closeRate', v)}
              placeholder="36"
              max={100}
            />
            <ManualStatInput
              label="Calls Completed"
              value={manualStats?.callsCompleted}
              onChange={(v) => updateManualStat('callsCompleted', v)}
              placeholder="847"
              integer
            />
          </div>

          <VerificationStatusBlock
            userId={userId}
            isManuallyVerified={isManuallyVerified}
            isVip={isVip}
            manualStats={manualStats}
          />
        </>
      )}
    </div>
  );
}

function VerificationStatusBlock({
  userId,
  isManuallyVerified,
  manualStats,
  isVip,
}: {
  userId: string;
  isManuallyVerified: boolean;
  manualStats: ManualStats;
  isVip?: boolean;
}) {
  const [latest, setLatest] = useState<MyLatestVerificationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const res = await getMyLatestVerificationRequest(userId);
    if (res && !('error' in res)) {
      setLatest(res);
    } else {
      setLatest(null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (isManuallyVerified) {
    // Gold Check: VIP (annual) members' verification renders gold.
    if (isVip) {
      return (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/15 border border-yellow-300 dark:border-yellow-700/60 rounded-lg">
          <svg className="w-4 h-4 text-yellow-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zM15.61 10.186a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
          </svg>
          <span className="text-[12px] font-semibold text-yellow-700 dark:text-yellow-400">
            Gold Verified — VIP member, stats certified by Sequ3nce.
          </span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
        <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307z" clipRule="evenodd" />
        </svg>
        <span className="text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
          Your stats have been verified by Sequ3nce.
        </span>
      </div>
    );
  }

  const isPending = latest?.status === 'pending';

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
      <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-2">
        Self-reported stats show a &quot;Self-Reported&quot; label on your public profile instead of the verified badge.
      </p>
      {loading ? (
        <span className="text-[11px] text-gray-400 dark:text-gray-500">Checking status…</span>
      ) : isPending ? (
        <div className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-600 dark:text-gray-300">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          Verification pending — submitted {formatSubmittedAt(latest!.submittedAt)}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          Submit for verification
        </button>
      )}
      {latest?.status === 'rejected' && latest.rejectionReason && (
        <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">
          Last submission was rejected: {latest.rejectionReason}
        </p>
      )}

      {showModal && (
        <StatsVerificationModal
          userId={userId}
          initialStats={{
            cashCollected: manualStats?.cashCollected,
            closeRate: manualStats?.closeRate,
            callsCompleted: manualStats?.callsCompleted,
          }}
          onClose={() => setShowModal(false)}
          onSubmitted={() => {
            setShowModal(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function formatSubmittedAt(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function AutoStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
      <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function ManualStatInput({
  label, value, onChange, placeholder, max, integer,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: string) => void;
  placeholder: string;
  max?: number;
  integer?: boolean;
}) {
  return (
    <div>
      <label className="block text-[12px] text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input
        type="number"
        value={value !== undefined ? value : ''}
        onChange={(e) => {
          let v = e.target.value;
          if (integer) v = v.replace(/\./g, '');
          if (max !== undefined && Number(v) > max) v = String(max);
          onChange(v);
        }}
        placeholder={placeholder}
        min={0}
        max={max}
        step={integer ? 1 : 'any'}
        className="w-full px-3 py-2 text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 placeholder-gray-400 dark:placeholder-gray-500"
      />
    </div>
  );
}
