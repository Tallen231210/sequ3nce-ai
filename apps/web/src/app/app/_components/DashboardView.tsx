"use client";

import React, { useEffect, useState, useRef } from 'react';
import { OutcomeQueue } from './OutcomeQueue';
import { CollectionsQueue } from './CollectionsQueue';
import type { CloserInfo, CloserStats, CalendarEvent, CallHistoryItem } from '@/lib/closer/client';
import { getCloserStats, getCalendarEvents, getCallHistory, createBotForMeeting } from '@/lib/closer/client';
import { extractProspectName } from './schedule/scheduleUtils';
import { ScheduleMeetingModal } from './schedule/ScheduleMeetingModal';

interface DashboardViewProps {
  closerInfo: CloserInfo;
  onNavigate: (item: string) => void;
}

export function DashboardView({ closerInfo, onNavigate }: DashboardViewProps) {
  const [stats, setStats] = useState<CloserStats | null>(null);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [recentCalls, setRecentCalls] = useState<CallHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    // Re-arm on every run. React's development double-mount fires the cleanup
    // below and then re-runs this effect on the SAME component instance, so a
    // ref left at false silently discards every response that follows and the
    // view sits on "Loading…" forever. Setting it here rather than only at
    // useRef(true) makes the mount and unmount symmetrical.
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    loadAllData();
  }, [closerInfo.closerId]);

  async function loadAllData() {
    setIsLoading(true);
    try {
      const [statsResult, , callsResult] = await Promise.all([
        getCloserStats(closerInfo.closerId, 'week'),
        loadTodayEvents(),
        getCallHistory(closerInfo.closerId, 5),
      ]);

      if (!mountedRef.current) return;
      setStats(statsResult);
      setRecentCalls(callsResult);
    } catch (error) {
      console.error('[Dashboard] Failed to load data:', error);
    }
    if (mountedRef.current) setIsLoading(false);
  }

  async function loadTodayEvents(): Promise<void> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86400000);

    const events = await getCalendarEvents(
      closerInfo.email,
      closerInfo.teamId,
      startOfDay.getTime(),
      endOfDay.getTime()
    );

    if (mountedRef.current) {
      setTodayEvents(events.sort((a, b) => a.startTime - b.startTime));
    }
  }

  async function handleJoinConfirm(event: CalendarEvent) {
    if (!event.meetingUrl) return;
    const prospectName = extractProspectName(event, closerInfo.email);
    await createBotForMeeting(closerInfo.closerId, closerInfo.teamId, event.meetingUrl, event.title, prospectName);
    window.open(event.meetingUrl, '_blank');
    setSelectedEvent(null);
  }

  const greeting = getGreeting(closerInfo.name);
  const dateStr = formatDate(new Date());

  return (
    <div className="mx-auto w-full max-w-[1200px] p-6 lg:p-8">
      {/* Welcome Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black">{greeting}</h1>
        <p className="text-sm text-gray-500 mt-1">{dateStr}</p>
      </div>

      {/* Above the stats on purpose. These calls are missing FROM those very
          numbers, so showing the numbers first would have a closer reading a
          close rate that's wrong in a way the fix is sitting right below. */}
      <div className="mb-6">
        <OutcomeQueue closerInfo={closerInfo} />
      </div>

      {/* Below the outcome queue, because a missing outcome is the older debt:
          those calls aren't in the numbers at all yet. Both panels hide
          themselves when there's nothing to do, so most days neither appears. */}
      <div className="mb-6">
        <CollectionsQueue />
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <StatCard
          icon={<PhoneIcon />}
          title="Calls This Week"
          value={String(stats?.callsThisPeriod ?? 0)}
        />
        <StatCard
          icon={<TargetIcon />}
          title="Close Rate"
          value={`${Math.round(stats?.closeRate ?? 0)}%`}
        />
        <StatCard
          icon={<DollarIcon />}
          title="Cash Collected"
          value={formatCurrency(stats?.cashCollected ?? 0)}
        />
        <StatCard
          icon={<ClockIcon />}
          title="Avg Call"
          value={formatDurationShort(stats?.avgCallDuration ?? 0)}
        />
      </div>

      {/* Today's Schedule */}
      <SectionHeader
        title="TODAY'S SCHEDULE"
        actionLabel={todayEvents.length > 0 ? 'View All' : undefined}
        onAction={() => onNavigate('schedule')}
      />
      <div className="mb-8">
        {todayEvents.length === 0 ? (
          <EmptyState icon={<CalendarEmptyIcon />} text="No calls scheduled today" />
        ) : (
          <div className="bg-[#fafafa] border border-gray-200/60 rounded-lg overflow-hidden">
            {todayEvents.slice(0, 5).map((event, i) => (
              <React.Fragment key={event._id || i}>
                {i > 0 && <div className="border-t border-gray-200/60 mx-4" />}
                <ScheduleRow event={event} onJoinRequest={setSelectedEvent} />
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Recent Calls */}
      <SectionHeader
        title="RECENT CALLS"
        actionLabel={recentCalls.length > 0 ? 'View All' : undefined}
        onAction={() => onNavigate('calls')}
      />
      <div className="mb-8">
        {recentCalls.length === 0 ? (
          <EmptyState icon={<PhoneIcon />} text="No recent calls" />
        ) : (
          <div className="bg-[#fafafa] border border-gray-200/60 rounded-lg overflow-hidden">
            {recentCalls.slice(0, 5).map((call, i) => (
              <React.Fragment key={call._id || i}>
                {i > 0 && <div className="border-t border-gray-200/60 mx-4" />}
                <CallRow call={call} />
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
      {/* Meeting confirmation modal */}
      {selectedEvent && (
        <ScheduleMeetingModal
          event={selectedEvent}
          closerInfo={closerInfo}
          onConfirm={handleJoinConfirm}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

// --- Sub-components ---

function StatCard({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200/60 rounded-lg p-3.5">
      <div className="text-gray-500 mb-2.5">{icon}</div>
      <div className="text-2xl font-bold text-black font-mono leading-tight mb-1">{value}</div>
      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{title}</div>
    </div>
  );
}

function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{title}</span>
      {actionLabel && (
        <button
          onClick={onAction}
          className="text-[11px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="bg-[#fafafa] border border-gray-200/60 rounded-lg py-6 flex flex-col items-center gap-1.5">
      <span className="text-gray-400">{icon}</span>
      <span className="text-sm text-gray-500">{text}</span>
    </div>
  );
}

function ScheduleRow({ event, onJoinRequest }: { event: CalendarEvent; onJoinRequest: (event: CalendarEvent) => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-[13px] font-medium font-mono text-gray-600 w-[80px] shrink-0">
        {formatEventTime(event.startTime)}
      </span>
      <span className="text-[13px] text-black truncate flex-1">{event.title}</span>
      {event.meetingUrl && (
        <button
          onClick={() => onJoinRequest(event)}
          className="text-[11px] font-semibold text-white bg-black px-3 py-1 rounded-md hover:bg-gray-800 transition-colors shrink-0"
        >
          Join
        </button>
      )}
    </div>
  );
}

function CallRow({ call }: { call: CallHistoryItem }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-[13px] font-medium text-black truncate flex-1">
        {call.prospectName || 'Unknown'}
      </span>
      <span className="text-[12px] font-mono text-gray-500">
        {formatDurationShort(call.duration)}
      </span>
      <OutcomeBadge outcome={call.outcome} />
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome?: string }) {
  const config = getOutcomeConfig(outcome);
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
      style={{ color: config.color, backgroundColor: config.bg }}
    >
      {config.label}
    </span>
  );
}

// --- Helpers ---

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  const firstName = name.split(' ')[0] || 'there';
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 17) return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDurationShort(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m ${secs}s`;
}

function formatEventTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getOutcomeConfig(outcome?: string): { label: string; color: string; bg: string } {
  switch (outcome) {
    case 'closed':
      return { label: 'Closed', color: '#17a034', bg: '#f0fdf0' };
    case 'lost':
      return { label: 'Not Closed', color: '#dc2626', bg: '#fef2f2' };
    case 'no_show':
      return { label: 'No Show', color: '#808080', bg: '#f3f3f3' };
    case 'follow_up':
      return { label: 'Follow Up', color: '#3366cc', bg: '#edf2ff' };
    default:
      return { label: 'Pending', color: '#808080', bg: '#f3f3f3' };
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

function CalendarEmptyIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}
