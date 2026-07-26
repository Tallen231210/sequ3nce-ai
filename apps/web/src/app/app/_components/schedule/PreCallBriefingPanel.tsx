"use client";

import React, { useEffect, useState } from 'react';
import {
  getCloserBriefing,
  type CloserBriefingResponse,
  type CloserInfo,
} from '@/lib/closer/client';

interface PreCallBriefingPanelProps {
  closerInfo: CloserInfo;
  calendarEventId: string;
}

/**
 * Pre-call briefing card inside ScheduleMeetingModal. Fetches the
 * matched setter call summary + talk-ratio via HTTP. Hides itself
 * entirely on no-match (no noisy empty-state inside the modal) — only
 * renders when we have a real briefing to show the closer.
 *
 * Loading state shows a small inline spinner above the join button.
 * Errors fall back to silent skip — manager sees no briefing rather
 * than a confusing "couldn't load briefing" toast.
 */
export function PreCallBriefingPanel({
  closerInfo,
  calendarEventId,
}: PreCallBriefingPanelProps) {
  const [data, setData] = useState<CloserBriefingResponse | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getCloserBriefing(
        closerInfo.email,
        closerInfo.teamId,
        calendarEventId,
      );
      if (!cancelled) setData(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [closerInfo.email, closerInfo.teamId, calendarEventId]);

  if (data === undefined) {
    return (
      <div className="w-full mb-4 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <div className="flex items-center gap-2 text-[12px] text-gray-500 dark:text-gray-400">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" />
          Loading prospect context…
        </div>
      </div>
    );
  }

  // Silent skip when there's no usable briefing (internal meeting,
  // unmatched prospect, no transcript yet). The modal stays clean.
  if (!data || !data.transcript || !data.transcript.aiSummary) {
    return null;
  }

  const t = data.transcript;
  const talkRatio = computeTalkRatio(t.setterTalkTimeSec, t.prospectTalkTimeSec);
  const callAge = humanAgo(t.occurredAt);

  return (
    <div className="w-full mb-4 px-4 py-3 bg-blue-50/60 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-lg">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-2">
        📞 Pre-call briefing
      </div>
      <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
        Qualifying call{data.setterName ? ` by ${data.setterName}` : ''}{' '}
        {callAge} · {t.direction === 'inbound' ? 'inbound' : 'outbound'}
        {typeof t.durationSec === 'number' &&
          ` · ${formatDurationShort(t.durationSec)}`}
      </div>
      <div className="text-[13px] text-gray-800 dark:text-gray-200 whitespace-pre-line leading-relaxed mb-3">
        {t.aiSummary}
      </div>
      {talkRatio && (
        <div>
          <div className="flex items-center gap-2 text-[11px] mb-1">
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              Setter {talkRatio.setterPct}%
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-blue-700 dark:text-blue-400 font-medium">
              Prospect {talkRatio.prospectPct}%
            </span>
          </div>
          <div className="flex h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="bg-emerald-500"
              style={{ width: `${talkRatio.setterPct}%` }}
            />
            <div
              className="bg-blue-500"
              style={{ width: `${talkRatio.prospectPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function computeTalkRatio(
  setterSec: number | undefined,
  prospectSec: number | undefined,
): { setterPct: number; prospectPct: number } | null {
  if (typeof setterSec !== 'number' || typeof prospectSec !== 'number') {
    return null;
  }
  const total = setterSec + prospectSec;
  if (total < 1) return null;
  const setterPct = Math.round((setterSec / total) * 100);
  return { setterPct, prospectPct: 100 - setterPct };
}

function formatDurationShort(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${min}m` : `${min}m ${s}s`;
}

function humanAgo(ts: number): string {
  const deltaMs = Date.now() - ts;
  if (deltaMs < 0) return 'just now';
  const min = Math.floor(deltaMs / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}
