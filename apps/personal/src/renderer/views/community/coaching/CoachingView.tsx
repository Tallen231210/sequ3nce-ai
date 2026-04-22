import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CloserInfo } from '../../../convex';
import {
  listCoachingCalls,
  cancelCoachingCall,
  startCoachingCall,
  joinCoachingCall,
  deleteCoachingCallRecording,
  type CoachingCall,
  type CoachingCallJoinResult,
} from '../../../convex';
import { CoachingCallCard } from './CoachingCallCard';
import { ScheduleCoachingCallModal } from './ScheduleCoachingCallModal';
import { CoachingCallRoom } from './CoachingCallRoom';
import { ReplayPlayerModal } from './ReplayPlayerModal';

const POLL_MS = 30_000;

interface CoachingViewProps {
  closerInfo: CloserInfo;
}

// Session state while the current user is inside a live call — holds the
// Daily room URL + token so the overlay can connect, plus the user's own
// profile photo URL to broadcast to other participants after join.
interface ActiveCallSession {
  call: CoachingCall;
  roomUrl: string;
  token: string;
  selfPhotoUrl: string | null;
}

export function CoachingView({ closerInfo }: CoachingViewProps) {
  const userId = closerInfo.b2cUserId || '';
  const isCoach =
    closerInfo.badges?.includes('coach') ||
    closerInfo.badges?.includes('founder') ||
    closerInfo.badges?.includes('admin') ||
    false;

  const [calls, setCalls] = useState<CoachingCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveCallSession | null>(null);
  const [replayCall, setReplayCall] = useState<CoachingCall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const res = await listCoachingCalls(undefined, 30);
    if (!mountedRef.current) return;
    if (Array.isArray(res)) {
      setCalls(res);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const interval = setInterval(() => {
      if (mountedRef.current) void load();
    }, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [load]);

  // Split calls by status for rendering
  const live = calls.filter((c) => c.status === 'live');
  const upcoming = calls
    .filter((c) => c.status === 'scheduled')
    .sort((a, b) => a.scheduledStartTime - b.scheduledStartTime);
  const past = calls
    .filter((c) => c.status === 'ended')
    .sort((a, b) => b.scheduledStartTime - a.scheduledStartTime)
    .slice(0, 5);

  // Before any Daily call (start or join), explicitly ask the OS for camera +
  // microphone access. On macOS, Electron's renderer-side getUserMedia fails
  // silently without this OS-level prompt first. Non-macOS platforms return
  // true without prompting (Chromium handles its own dialog).
  async function ensureMediaAccess(): Promise<boolean> {
    const el = (window as unknown as { electron?: { app?: { requestMediaAccess?: () => Promise<{ camera: boolean; microphone: boolean }> } } }).electron;
    const req = el?.app?.requestMediaAccess;
    if (!req) return true; // web / non-electron context — skip
    const { camera, microphone } = await req();
    if (!camera || !microphone) {
      setError(
        'Camera and microphone access are required to join coaching calls. ' +
        'Enable both in System Settings → Privacy & Security, then try again.'
      );
      return false;
    }
    return true;
  }

  async function handleStart(call: CoachingCall) {
    setError(null);
    if (!(await ensureMediaAccess())) return;
    const res = await startCoachingCall(call._id, userId);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    await load();
    setActiveSession({
      call: { ...call, status: 'live' },
      roomUrl: res.roomUrl,
      token: res.token,
      selfPhotoUrl: res.selfPhotoUrl ?? null,
    });
  }

  async function handleJoin(call: CoachingCall) {
    setError(null);
    if (!(await ensureMediaAccess())) return;
    const res = await joinCoachingCall(call._id, userId);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    setActiveSession({
      call,
      roomUrl: res.roomUrl,
      token: res.token,
      selfPhotoUrl: res.selfPhotoUrl ?? null,
    });
  }

  async function handleCancel(call: CoachingCall) {
    if (!confirm(`Cancel "${call.title}"?`)) return;
    const res = await cancelCoachingCall(call._id, userId);
    if (res.error) {
      setError(res.error);
      return;
    }
    await load();
  }

  async function handleDeleteRecording(call: CoachingCall) {
    setError(null);
    const res = await deleteCoachingCallRecording(call._id, userId);
    if (res.error) {
      setError(res.error);
      return;
    }
    await load();
  }

  function handleLeaveRoom() {
    setActiveSession(null);
    void load();
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Coaching Calls
          </h2>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-0.5">
            Live group sessions with Sequ3nce coaches. Join live, or catch up on replays.
          </p>
        </div>
        {isCoach && (
          <button
            onClick={() => setShowScheduleModal(true)}
            className="shrink-0 px-4 py-2 text-[13px] font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity"
          >
            + Schedule a call
          </button>
        )}
      </div>

      {error && (
        <div className="mx-6 mt-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-[12px] text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
        {loading ? (
          <div className="py-12 flex justify-center">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-black rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Live now */}
            {live.length > 0 && (
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                  Live now
                </h3>
                <div className="space-y-2">
                  {live.map((c) => (
                    <CoachingCallCard
                      key={c._id}
                      call={c}
                      currentUserId={userId}
                      onJoin={handleJoin}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Upcoming */}
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Upcoming
              </h3>
              {upcoming.length === 0 ? (
                <div className="py-8 text-center text-[13px] text-gray-400 dark:text-gray-500">
                  No upcoming calls scheduled.
                  {isCoach && (
                    <>
                      {' '}
                      <button
                        onClick={() => setShowScheduleModal(true)}
                        className="underline hover:text-gray-900 dark:hover:text-white"
                      >
                        Schedule one →
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((c) => (
                    <CoachingCallCard
                      key={c._id}
                      call={c}
                      currentUserId={userId}
                      onStart={handleStart}
                      onCancel={handleCancel}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Past (most recent 5) */}
            {past.length > 0 && (
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                  Recent
                </h3>
                <div className="space-y-2">
                  {past.map((c) => (
                    <CoachingCallCard
                      key={c._id}
                      call={c}
                      currentUserId={userId}
                      isFounder={isCoach}
                      onWatchReplay={setReplayCall}
                      onDeleteRecording={handleDeleteRecording}
                    />
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
                  Looking for older sessions? See the full replay library in{' '}
                  <span className="font-medium">Community → Training → Past coaching calls</span>.
                </p>
              </section>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showScheduleModal && (
        <ScheduleCoachingCallModal
          coachUserId={userId}
          onClose={() => setShowScheduleModal(false)}
          onSaved={() => {
            setShowScheduleModal(false);
            void load();
          }}
        />
      )}

      {activeSession && (
        <CoachingCallRoom
          call={activeSession.call}
          currentUserId={userId}
          roomUrl={activeSession.roomUrl}
          token={activeSession.token}
          selfPhotoUrl={activeSession.selfPhotoUrl}
          onLeave={handleLeaveRoom}
        />
      )}

      {replayCall && (
        <ReplayPlayerModal
          call={replayCall}
          onClose={() => setReplayCall(null)}
        />
      )}
    </div>
  );
}
