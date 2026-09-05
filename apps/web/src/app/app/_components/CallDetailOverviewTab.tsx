"use client";

import React from 'react';
import type { CallHistoryItem, AmmoItem } from '@/lib/closer/client';
import { CallFactsInlineEditor, type SavedFacts } from './CallFactsInlineEditor';
import { dealValueLabels, getCloserInfo } from "@/lib/closer/session";

/** Team-specific name for the contract-value field (see session.ts). */
const dealLabels = () => dealValueLabels(getCloserInfo());

interface CallDetailOverviewTabProps {
  call: CallHistoryItem;
  ammoItems: AmmoItem[];
  isLoadingAmmo: boolean;
  closerId: string;
  /** Teammate's call — the facts editor only makes sense on your own. */
  readOnly?: boolean;
  /** The closer saved new figures; the sheet updates the call it holds. */
  onFactsSaved?: (facts: SavedFacts) => void;
}

export function CallDetailOverviewTab({ call, ammoItems, isLoadingAmmo, closerId, readOnly = false, onFactsSaved }: CallDetailOverviewTabProps) {
  const talkPercent = (() => {
    const closer = call.closerTalkTime || 0;
    const prospect = call.prospectTalkTime || 0;
    const total = closer + prospect;
    return total > 0 ? Math.round((closer / total) * 100) : null;
  })();

  return (
    <div className="space-y-5">
      {/* AI Summary */}
      {call.summary && (
        <DetailSection title="AI Summary">
          <SummaryDisplay summary={call.summary} />
        </DetailSection>
      )}

      {/* Ammo Analysis — only ever produced by our own meeting bot, which
          captures prospect quotes live as the call happens. A Fathom call was
          recorded by something else entirely, so there is nothing to show and
          an empty "No ammo items recorded" panel just advertises a feature
          this product line doesn't include. */}
      {call.source !== 'fathom' && (
      <DetailSection title="Ammo Analysis">
        {isLoadingAmmo ? (
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
            <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-[13px] text-gray-500">Loading...</span>
          </div>
        ) : ammoItems.length === 0 ? (
          <p className="text-[13px] text-gray-400 p-3 bg-gray-50 rounded-lg">No ammo items recorded</p>
        ) : (
          <div className="space-y-1.5">
            {ammoItems.map((item) => (
              <AmmoItemRow key={item._id} item={item} />
            ))}
          </div>
        )}
      </DetailSection>
      )}

      {/* Post-Call Data */}
      <DetailSection title="Post-Call Data">
        <div className="space-y-1.5 p-3 bg-gray-50 rounded-lg">
          <DataRow label="Outcome" value={formatOutcome(call.outcome)} />
          {talkPercent !== null && (
            <DataRow label="Talk Ratio" value={`${talkPercent}% closer / ${100 - talkPercent}% prospect`} />
          )}
          {call.contractValue != null && call.contractValue > 0 && (
            <DataRow label={dealLabels().long} value={`$${call.contractValue.toLocaleString()}`} />
          )}
          {call.cashCollected != null && call.cashCollected > 0 && (
            <DataRow label="Cash Collected" value={`$${call.cashCollected.toLocaleString()}`} />
          )}
          <DataRow label="Recording Type" value={call.recordingType === 'video' ? 'Video' : 'Audio'} />
        </div>
        {/* Nobody fills in a form after every call, so these come off the
            recording. The closer is the only person who knows for certain what
            was charged on the day, and this is the one screen they're already
            looking at. */}
        {!readOnly && (
          <CallFactsInlineEditor
            callId={call._id}
            closerId={closerId}
            outcome={call.outcome}
            cashCollected={call.cashCollected}
            contractValue={call.contractValue}
            outcomeSource={call.outcomeSource}
            onSaved={onFactsSaved}
          />
        )}
      </DetailSection>
    </div>
  );
}

// --- Sub-components (extracted from original CallDetailSheet) ---

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}

function SummaryDisplay({ summary }: { summary: string }) {
  const items = summary
    .split(/[•·]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const colonIdx = s.indexOf(':');
      if (colonIdx > 0 && colonIdx < 30) {
        return { label: s.slice(0, colonIdx).trim(), value: s.slice(colonIdx + 1).trim() };
      }
      return { label: '', value: s };
    });

  if (items.length <= 1 || items.every((i) => !i.label)) {
    return (
      <div className="p-3 bg-gray-50 rounded-lg text-[13px] text-gray-700 leading-relaxed">
        {summary}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3 bg-gray-50 rounded-lg">
      {items.map((item, i) => (
        <div key={i} className={!item.label ? 'col-span-2' : ''}>
          {item.label ? (
            <>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{item.label}</span>
              <p className="text-[13px] text-gray-700 leading-snug mt-0.5">{item.value || '\u2014'}</p>
            </>
          ) : (
            <p className="text-[13px] text-gray-700 leading-relaxed">{item.value}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-gray-500">{label}</span>
      <span className="text-[12px] font-medium text-black">{value}</span>
    </div>
  );
}

function AmmoItemRow({ item }: { item: AmmoItem }) {
  const typeConfig: Record<string, { label: string; text: string; bg: string; border: string }> = {
    emotional: { label: 'Emotional', text: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
    urgency: { label: 'Urgency', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
    budget: { label: 'Budget', text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
    commitment: { label: 'Commitment', text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
    objection_preview: { label: 'Objection', text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
    pain_point: { label: 'Pain Point', text: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  };

  const tc = typeConfig[item.type] || { label: item.type, text: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };

  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-lg border ${tc.border} ${tc.bg}`}>
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tc.text} ${tc.bg}`}>
        {tc.label}
      </span>
      <p className="text-[12px] text-gray-700 line-clamp-3 flex-1">{item.text}</p>
    </div>
  );
}

function formatOutcome(outcome?: string): string {
  const map: Record<string, string> = {
    closed: 'Closed',
    lost: 'Lost',
    no_show: 'No Show',
    follow_up: 'Follow Up',
  };
  return outcome ? (map[outcome] || outcome) : 'Pending';
}
