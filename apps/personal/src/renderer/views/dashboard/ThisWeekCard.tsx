import React from 'react';
import type { ThisWeekData } from '../../convex';

// ============================================================================
// "This week" — the first thing a member sees. A new member's first session
// used to be six empty channels and a checklist; this shows what is actually
// alive: the next (or live) coaching call, roles added this week, who's
// online, the newest post. Honest empty states, never padded.
// ============================================================================

interface ThisWeekCardProps {
  data: ThisWeekData | null;
  loading: boolean;
  onNavigate: (item: string) => void;
  onOpenCoachingCall: (callId: string) => void;
}

function formatCallTime(ms: number): string {
  const d = new Date(ms);
  const sameDay = new Date().toDateString() === d.toDateString();
  const day = sameDay ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} ${time}`;
}

export function ThisWeekCard({ data, loading, onNavigate, onOpenCoachingCall }: ThisWeekCardProps) {
  const pending = loading && !data;
  const call = data?.nextCoachingCall ?? null;
  const roles = data?.rolesThisWeek ?? null;
  const online = data?.onlineCount ?? 0;
  const post = data?.latestPosts?.[0] ?? null;
  const live = call?.status === 'live';

  return (
    <div className="mb-8" data-testid="this-week-card">
      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2.5">This week</div>
      <div className="grid grid-cols-4 gap-3">
        <Tile
          testId="this-week-coaching"
          label={live ? 'Happening now' : 'Next coaching call'}
          value={pending ? '…' : call ? call.title : 'No call scheduled yet'}
          sub={
            pending
              ? ''
              : call
                ? `${live ? 'Live now' : formatCallTime(call.scheduledStartTime)} · ${call.coachName}`
                : 'Calls post here first'
          }
          cta={call ? (live ? 'Join' : 'Details') : undefined}
          highlight={live}
          onClick={() => (call ? onOpenCoachingCall(call.callId) : onNavigate('community'))}
        />
        <Tile
          testId="this-week-roles"
          label="New roles this week"
          value={pending ? '…' : roles ? String(roles.total ?? roles.count) : '—'}
          sub={
            pending
              ? ''
              : roles && roles.feedTotal !== undefined && (roles.total ?? 0) > 0
                ? `${roles.count} hand-picked + ${roles.feedTotal} live feed`
                : roles && roles.count > 0
                  ? roles.topIndustries.join(', ')
                  : 'Fresh roles land every Monday'
          }
          cta="Job Board"
          onClick={() => onNavigate('jobboard')}
        />
        <Tile
          testId="this-week-online"
          label="Members online"
          value={pending ? '…' : String(online)}
          sub={
            pending
              ? ''
              : online === 0
                ? 'Quiet right now — say hi in General'
                : online === 1
                  ? '1 member online now'
                  : `${online} online now`
          }
          cta="Community"
          onClick={() => onNavigate('community')}
        />
        <Tile
          testId="this-week-post"
          label="Latest in the community"
          value={pending ? '…' : post ? post.authorName : 'Nothing yet this week'}
          sub={pending ? '' : post ? `${post.channelName} · ${post.snippet}` : 'Be the first to post'}
          cta={post ? 'Read' : 'Post'}
          onClick={() => onNavigate('community')}
        />
      </div>
    </div>
  );
}

interface TileProps {
  testId: string;
  label: string;
  value: string;
  sub: string;
  cta?: string;
  highlight?: boolean;
  onClick: () => void;
}

function Tile({ testId, label, value, sub, cta, highlight, onClick }: TileProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`text-left bg-white border rounded-lg p-3.5 transition-colors hover:border-gray-400 ${
        highlight ? 'border-black' : 'border-gray-200/60'
      }`}
    >
      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-[15px] font-semibold text-black leading-snug line-clamp-2">{value}</div>
      <div className="mt-1 text-[12px] text-gray-500 leading-snug line-clamp-2 min-h-[2.5em]">{sub}</div>
      {cta && <div className="mt-2 text-[12px] font-semibold text-black">{cta} →</div>}
    </button>
  );
}
