import React, { useEffect, useState, useCallback, useRef } from 'react';
import { usePoll } from '../lib/usePoll';
import type {
  CloserInfo,
  FeedbackCall,
  SharedMoment,
  CallComment,
  TranscriptSegment,
} from '../convex';
import {
  getFeedbackForCloser,
  getSharedMoments,
  getCommentsForCall,
  addCallComment,
  getUnreadFeedbackCount,
  getUnreadSharedMomentsCount,
  markFeedbackRead,
  markSharedMomentsSeen,
  refreshRecordingUrl,
  getTranscriptSegments,
} from '../convex';

interface CoachingViewProps {
  closerInfo: CloserInfo;
}

export function CoachingView({ closerInfo }: CoachingViewProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [feedbackCalls, setFeedbackCalls] = useState<FeedbackCall[]>([]);
  const [sharedMoments, setSharedMoments] = useState<SharedMoment[]>([]);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(true);
  const [isLoadingMoments, setIsLoadingMoments] = useState(true);
  const [unreadFeedback, setUnreadFeedback] = useState(0);
  const [unreadMoments, setUnreadMoments] = useState(0);

  // Call review overlay (feedback)
  const [reviewCallId, setReviewCallId] = useState<string | null>(null);
  const [reviewProspectName, setReviewProspectName] = useState('');

  // Moment review overlay (shared moments)
  const [selectedMoment, setSelectedMoment] = useState<SharedMoment | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Load data
  useEffect(() => {
    setIsLoadingFeedback(true);
    getFeedbackForCloser(closerInfo.closerId).then((f) => {
      if (!mountedRef.current) return;
      setFeedbackCalls(f);
      setIsLoadingFeedback(false);
    }).catch((err) => {
      console.error('[Coaching] Failed to load feedback:', err);
      if (mountedRef.current) setIsLoadingFeedback(false);
    });

    setIsLoadingMoments(true);
    getSharedMoments(closerInfo.closerId).then((m) => {
      if (!mountedRef.current) return;
      setSharedMoments(m);
      setIsLoadingMoments(false);
    }).catch((err) => {
      console.error('[Coaching] Failed to load moments:', err);
      if (mountedRef.current) setIsLoadingMoments(false);
    });
  }, [closerInfo.closerId]);

  // Poll unread counts — migrated to usePoll for backoff + jitter +
  // visibility-pause (task #348). Note: MeetingBotHub ALSO polls these
  // endpoints into a combined count for the sidebar badge. The
  // duplicate is a known Phase 2 cleanup; for now both run but with
  // jitter so they don't collide.
  usePoll(
    'coachingUnreadSplit',
    async () => {
      const [fc, mc] = await Promise.all([
        getUnreadFeedbackCount(closerInfo.closerId),
        getUnreadSharedMomentsCount(closerInfo.closerId),
      ]);
      if (!mountedRef.current) return;
      setUnreadFeedback(fc);
      setUnreadMoments(mc);
    },
    30_000,
  );

  // Mark shared moments as seen when tab switches to it
  useEffect(() => {
    if (activeTab === 1 && unreadMoments > 0) {
      markSharedMomentsSeen(closerInfo.closerId).then(() => setUnreadMoments(0));
    }
  }, [activeTab, unreadMoments, closerInfo.closerId]);

  function handleOpenFeedback(call: FeedbackCall) {
    setReviewCallId(call.callId);
    setReviewProspectName(call.prospectName);
    // Mark as read
    if (call.isUnread) {
      markFeedbackRead(call.callId, closerInfo.closerId).then(() => {
        setFeedbackCalls((prev) =>
          prev.map((c) => c.callId === call.callId ? { ...c, isUnread: false } : c)
        );
        setUnreadFeedback((c) => Math.max(0, c - 1));
      });
    }
  }

  function handleOpenMoment(moment: SharedMoment) {
    setSelectedMoment(moment);
  }

  function handleRefresh() {
    setIsLoadingFeedback(true);
    setIsLoadingMoments(true);
    getFeedbackForCloser(closerInfo.closerId).then((f) => {
      setFeedbackCalls(f);
      setIsLoadingFeedback(false);
    });
    getSharedMoments(closerInfo.closerId).then((m) => {
      setSharedMoments(m);
      setIsLoadingMoments(false);
    });
  }

  // Moment review overlay (shared moments — simplified, no comments)
  if (selectedMoment) {
    return (
      <MomentReviewPanel
        moment={selectedMoment}
        onClose={() => setSelectedMoment(null)}
      />
    );
  }

  // Call review overlay (feedback — full view with comments)
  if (reviewCallId) {
    return (
      <CallReviewPanel
        closerInfo={closerInfo}
        callId={reviewCallId}
        prospectName={reviewProspectName}
        onClose={() => setReviewCallId(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
        <h1 className="text-2xl font-bold text-black">Coaching</h1>
        <button onClick={handleRefresh} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 pb-3 shrink-0">
        <TabButton
          label="Your Feedback"
          active={activeTab === 0}
          badge={unreadFeedback}
          onClick={() => setActiveTab(0)}
        />
        <TabButton
          label="Shared with You"
          active={activeTab === 1}
          badge={unreadMoments}
          onClick={() => setActiveTab(1)}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        {activeTab === 0 ? (
          <FeedbackTab
            calls={feedbackCalls}
            isLoading={isLoadingFeedback}
            onOpen={handleOpenFeedback}
          />
        ) : (
          <SharedMomentsTab
            moments={sharedMoments}
            isLoading={isLoadingMoments}
            onOpen={handleOpenMoment}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({ label, active, badge, onClick }: {
  label: string;
  active: boolean;
  badge: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium rounded-lg transition-colors ${
        active
          ? 'bg-black text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
      {badge > 0 && (
        <span className={`min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full px-1 ${
          active ? 'bg-red-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// --- Feedback Tab ---

function FeedbackTab({
  calls,
  isLoading,
  onOpen,
}: {
  calls: FeedbackCall[];
  isLoading: boolean;
  onOpen: (call: FeedbackCall) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mb-2" />
        <span className="text-[13px] text-gray-500">Loading feedback...</span>
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
        <h3 className="text-[15px] font-medium text-gray-600 mb-1">No feedback yet</h3>
        <p className="text-[13px] text-gray-400">Manager feedback on your calls will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {calls.map((call) => (
        <button
          key={call.callId}
          onClick={() => onOpen(call)}
          className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all hover:bg-gray-50 ${
            call.isUnread ? 'border border-red-200 bg-red-50/30' : 'border border-transparent'
          }`}
        >
          {/* Unread dot */}
          <div className="w-2 shrink-0">
            {call.isUnread && <div className="w-2 h-2 bg-red-500 rounded-full" />}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[14px] font-semibold text-black truncate">{call.prospectName}</span>
              <span className="text-[11px] text-gray-400 shrink-0 ml-2">
                {formatRelativeDate(call.lastCommentAt)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] text-gray-500">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                </svg>
                {call.commentCount}
              </span>
              {call.latestCommentPreview && (
                <span className="text-[12px] text-gray-500 italic truncate">
                  {call.latestCommentPreview}
                </span>
              )}
            </div>
          </div>

          {/* Chevron */}
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ))}
    </div>
  );
}

// --- Shared Moments Tab ---

function SharedMomentsTab({
  moments,
  isLoading,
  onOpen,
}: {
  moments: SharedMoment[];
  isLoading: boolean;
  onOpen: (moment: SharedMoment) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mb-2" />
        <span className="text-[13px] text-gray-500">Loading moments...</span>
      </div>
    );
  }

  if (moments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
        </svg>
        <h3 className="text-[15px] font-medium text-gray-600 mb-1">No shared moments</h3>
        <p className="text-[13px] text-gray-400">Moments shared by your manager will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {moments.map((m, i) => (
        <div
          key={`${m.callId}-${i}`}
          onClick={() => onOpen(m)}
          className="p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <h4 className="text-[14px] font-semibold text-black mb-1">{m.title}</h4>
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            {m.closerName && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                {m.closerName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatTimestamp(m.startSeconds)} - {formatTimestamp(m.endSeconds)}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatShortDate(m.createdAt)}
            </span>
          </div>
          {m.notes && (
            <p className="mt-1.5 text-[12px] text-gray-500 italic line-clamp-2">{m.notes}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Moment Review Panel (simplified: video + transcript, no comments) ---

function MomentReviewPanel({
  moment,
  onClose,
}: {
  moment: SharedMoment;
  onClose: () => void;
}) {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    setIsLoadingTranscript(true);
    getTranscriptSegments(moment.callId).then((t) => {
      setTranscript(t);
      setIsLoadingTranscript(false);
    });

    refreshRecordingUrl(moment.callId).then((url) => {
      if (url) setVideoUrl(url);
    });
  }, [moment.callId]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      // Auto-seek to moment start
      if (moment.startSeconds > 0) {
        videoRef.current.currentTime = moment.startSeconds;
        setCurrentTime(moment.startSeconds);
      }
    }
  }, [moment.startSeconds]);

  const handlePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    handleSeek(pct * duration);
  }, [duration, handleSeek]);

  // Active transcript segment
  const activeSegmentIndex = (() => {
    if (!transcript.length || !currentTime) return -1;
    let idx = -1;
    for (let i = 0; i < transcript.length; i++) {
      if (transcript[i].timestamp <= currentTime) idx = i;
      else break;
    }
    return idx;
  })();

  // Auto-scroll transcript
  useEffect(() => {
    if (isPlaying && activeSegmentRef.current && transcriptContainerRef.current) {
      activeSegmentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeSegmentIndex, isPlaying]);

  // Moment highlight range on scrubber
  const momentStartFrac = duration > 0 ? (moment.startSeconds / duration) * 100 : 0;
  const momentEndFrac = duration > 0 ? (moment.endSeconds / duration) * 100 : 0;
  const momentWidthPct = momentEndFrac - momentStartFrac;

  return (
    <div className="flex flex-col h-full">
      {/* Header — moment title + metadata */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 shrink-0">
        <button onClick={onClose} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-[13px]">Back</span>
        </button>
        <div className="flex flex-col flex-1 min-w-0">
          <h2 className="text-[16px] font-bold text-black truncate">{moment.title}</h2>
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            {moment.closerName && <span>{moment.closerName}</span>}
            {moment.notes && (
              <>
                <span className="text-gray-300">·</span>
                <span className="truncate">{moment.notes}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Full-width video + transcript (no comments sidebar) */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Video player */}
        {videoUrl && (
          <div className="shrink-0 overflow-hidden">
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full block"
              style={{ height: 360, objectFit: 'cover' }}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
            {/* Custom controls */}
            <div className="px-3 pb-2 pt-1" style={{ backgroundColor: '#000' }}>
              <div className="flex items-center gap-3">
                {/* Play/Pause */}
                <button onClick={handlePlayPause} className="text-white hover:text-gray-300 transition-colors">
                  {isPlaying ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
                {/* Time */}
                <span className="text-[11px] text-gray-400 font-mono tabular-nums whitespace-nowrap">
                  {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
                </span>
                {/* Progress bar with yellow moment highlight */}
                <div className="flex-1 relative h-5 flex items-center cursor-pointer group" onClick={handleProgressClick}>
                  <div className="w-full h-1 bg-gray-700 rounded-full relative">
                    {/* Yellow moment highlight band */}
                    {duration > 0 && momentWidthPct > 0 && (
                      <div
                        className="absolute top-0 h-full rounded-full"
                        style={{
                          left: `${momentStartFrac}%`,
                          width: `${Math.max(momentWidthPct, 0.5)}%`,
                          backgroundColor: 'rgba(250, 204, 21, 0.5)',
                        }}
                      />
                    )}
                    {/* Progress fill */}
                    <div
                      className="absolute top-0 left-0 h-full rounded-full"
                      style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%', backgroundColor: '#fff' }}
                    />
                  </div>
                </div>
                {/* Volume */}
                <button
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.muted = !videoRef.current.muted;
                      setIsMuted(!isMuted);
                    }
                  }}
                  className="text-white hover:text-gray-300 transition-colors"
                >
                  {isMuted ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto" ref={transcriptContainerRef}>
          <div className="px-5 pt-4 pb-2">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Transcript</h3>
          </div>
          <div className="px-5 pb-5 space-y-0.5">
            {isLoadingTranscript ? (
              <div className="flex items-center gap-2 py-4">
                <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-[13px] text-gray-500">Loading transcript...</span>
              </div>
            ) : transcript.length === 0 ? (
              <p className="text-[13px] text-gray-400 py-4">No transcript available</p>
            ) : (
              transcript.map((seg, idx) => {
                const isCloser = seg.speaker?.toLowerCase() === 'you' || seg.speaker?.toLowerCase() === 'closer';
                const isActive = idx === activeSegmentIndex;
                return (
                  <div
                    key={seg._id}
                    ref={isActive ? activeSegmentRef : undefined}
                    onClick={() => handleSeek(seg.timestamp)}
                    className={`flex gap-3 text-[13px] leading-relaxed px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-orange-50 border-l-2 border-orange-400'
                        : 'hover:bg-gray-50 border-l-2 border-transparent'
                    }`}
                  >
                    <span className={`shrink-0 font-semibold ${isCloser ? 'text-orange-600' : 'text-blue-600'}`}>
                      {seg.speaker || 'Speaker'}
                    </span>
                    <span className={isActive ? 'text-gray-900 font-medium' : 'text-gray-700'}>{seg.text}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Call Review Panel (two-column: video+transcript left, comments right) ---

function CallReviewPanel({
  closerInfo,
  callId,
  prospectName,
  onClose,
}: {
  closerInfo: CloserInfo;
  callId: string;
  prospectName: string;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<CallComment[]>([]);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<CallComment | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Custom video player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    getCommentsForCall(callId).then((c) => {
      setComments(c);
      setIsLoading(false);
    });

    setIsLoadingTranscript(true);
    getTranscriptSegments(callId).then((t) => {
      setTranscript(t);
      setIsLoadingTranscript(false);
    });

    refreshRecordingUrl(callId).then((url) => {
      if (url) setVideoUrl(url);
    });
  }, [callId]);

  // Video event handlers
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) setDuration(videoRef.current.duration);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    handleSeek(pct * duration);
  }, [duration, handleSeek]);

  const handleSend = useCallback(async () => {
    if (!newComment.trim()) return;
    setIsSending(true);

    const ok = await addCallComment(
      callId,
      newComment.trim(),
      'closer',
      closerInfo.name,
      closerInfo.closerId,
      undefined,
      replyTo?._id
    );

    if (ok) {
      const updated = await getCommentsForCall(callId);
      setComments(updated);
      setNewComment('');
      setReplyTo(null);
    }
    setIsSending(false);
  }, [callId, newComment, replyTo, closerInfo]);

  // Group comments: top-level + replies
  const topLevelComments = comments.filter((c) => !c.parentCommentId);
  const repliesByParent = comments.reduce<Record<string, CallComment[]>>((acc, c) => {
    if (c.parentCommentId) {
      if (!acc[c.parentCommentId]) acc[c.parentCommentId] = [];
      acc[c.parentCommentId].push(c);
    }
    return acc;
  }, {});

  // Comments with timestamps for video markers
  const commentMarkers = comments
    .filter((c) => c.timestampSeconds != null && c.timestampSeconds > 0)
    .map((c) => c.timestampSeconds as number);

  // Find the active transcript segment based on current video time
  const activeSegmentIndex = (() => {
    if (!transcript.length || !currentTime) return -1;
    // Find the last segment whose timestamp is <= currentTime
    let idx = -1;
    for (let i = 0; i < transcript.length; i++) {
      if (transcript[i].timestamp <= currentTime) idx = i;
      else break;
    }
    return idx;
  })();

  // Auto-scroll transcript to active segment during playback
  useEffect(() => {
    if (isPlaying && activeSegmentRef.current && transcriptContainerRef.current) {
      activeSegmentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeSegmentIndex, isPlaying]);

  // Find the active comment (closest timestamp <= currentTime)
  const activeCommentId = (() => {
    if (!currentTime) return null;
    let best: CallComment | null = null;
    for (const c of topLevelComments) {
      if (c.timestampSeconds != null && c.timestampSeconds <= currentTime) {
        if (!best || c.timestampSeconds > (best.timestampSeconds || 0)) best = c;
      }
    }
    return best?._id || null;
  })();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 shrink-0">
        <button onClick={onClose} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-[13px]">Back</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h2 className="text-[16px] font-bold text-black truncate">{prospectName}</h2>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column — video + transcript */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
          {/* Custom video player */}
          {videoUrl && (
            <div className="shrink-0 overflow-hidden">
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full block"
                style={{ height: 320, objectFit: 'cover' }}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
              {/* Custom controls */}
              <div className="px-3 pb-2 pt-1" style={{ backgroundColor: '#000' }}>
                <div className="flex items-center gap-3">
                  {/* Play/Pause */}
                  <button onClick={handlePlayPause} className="text-white hover:text-gray-300 transition-colors">
                    {isPlaying ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                  {/* Time */}
                  <span className="text-[11px] text-gray-400 font-mono tabular-nums whitespace-nowrap">
                    {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
                  </span>
                  {/* Progress bar with comment markers */}
                  <div className="flex-1 relative h-5 flex items-center cursor-pointer group" onClick={handleProgressClick}>
                    {/* Track background */}
                    <div className="w-full h-1 bg-gray-700 rounded-full relative">
                      {/* Progress fill */}
                      <div
                        className="absolute top-0 left-0 h-full rounded-full"
                        style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%', backgroundColor: '#fff' }}
                      />
                      {/* Comment markers */}
                      {duration > 0 && commentMarkers.map((ts, i) => (
                        <div
                          key={i}
                          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-blue-500 rounded-full border border-blue-300 z-10 hover:scale-125 transition-transform"
                          style={{ left: `${(ts / duration) * 100}%`, marginLeft: -5 }}
                          onClick={(e) => { e.stopPropagation(); handleSeek(ts); }}
                          title={`Comment at ${formatTimestamp(ts)}`}
                        />
                      ))}
                    </div>
                  </div>
                  {/* Volume */}
                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.muted = !videoRef.current.muted;
                        setIsMuted(!isMuted);
                      }
                    }}
                    className="text-white hover:text-gray-300 transition-colors"
                  >
                    {isMuted ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Transcript */}
          <div className="flex-1 overflow-y-auto" ref={transcriptContainerRef}>
            <div className="px-5 pt-4 pb-2">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Transcript</h3>
            </div>
            <div className="px-5 pb-5 space-y-0.5">
              {isLoadingTranscript ? (
                <div className="flex items-center gap-2 py-4">
                  <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[13px] text-gray-500">Loading transcript...</span>
                </div>
              ) : transcript.length === 0 ? (
                <p className="text-[13px] text-gray-400 py-4">No transcript available</p>
              ) : (
                transcript.map((seg, idx) => {
                  const isCloser = seg.speaker?.toLowerCase() === 'you' || seg.speaker?.toLowerCase() === 'closer';
                  const isActive = idx === activeSegmentIndex;
                  return (
                    <div
                      key={seg._id}
                      ref={isActive ? activeSegmentRef : undefined}
                      onClick={() => handleSeek(seg.timestamp)}
                      className={`flex gap-3 text-[13px] leading-relaxed px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-orange-50 border-l-2 border-orange-400'
                          : 'hover:bg-gray-50 border-l-2 border-transparent'
                      }`}
                    >
                      <span className={`shrink-0 font-semibold ${isCloser ? 'text-orange-600' : 'text-blue-600'}`}>
                        {seg.speaker || 'Speaker'}
                      </span>
                      <span className={isActive ? 'text-gray-900 font-medium' : 'text-gray-700'}>{seg.text}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right column — comments */}
        <div className="w-[320px] shrink-0 flex flex-col overflow-hidden">
          {/* Comments header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
            <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider">Comments</h3>
            <span className="min-w-[22px] h-[22px] flex items-center justify-center text-[11px] font-bold rounded-full bg-gray-200 text-gray-600 px-1.5">
              {comments.length}
            </span>
          </div>

          {/* Comments list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : topLevelComments.length === 0 ? (
              <p className="text-[13px] text-gray-400 text-center py-8">No comments yet</p>
            ) : (
              topLevelComments.map((comment) => (
                <div key={comment._id}>
                  <CommentBubble
                    comment={comment}
                    isActive={comment._id === activeCommentId}
                    onReply={() => setReplyTo(comment)}
                    onSeek={comment.timestampSeconds ? () => handleSeek(comment.timestampSeconds!) : undefined}
                  />
                  {repliesByParent[comment._id]?.map((reply) => (
                    <div key={reply._id} className="ml-5 mt-1.5">
                      <CommentBubble comment={reply} isReply />
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Comment input */}
          <div className="px-4 py-3 border-t border-gray-200 shrink-0">
            {replyTo && (
              <div className="flex items-center gap-2 mb-2 text-[11px] text-gray-500">
                <span>Replying to {replyTo.authorName}</span>
                <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={replyTo ? 'Write a reply...' : 'Add a comment...'}
                className="flex-1 px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:border-gray-400"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                onClick={handleSend}
                disabled={!newComment.trim() || isSending}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors shrink-0 ${
                  newComment.trim() && !isSending
                    ? 'bg-orange-500 text-white hover:bg-orange-600'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {isSending ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin block" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentBubble({
  comment,
  isReply,
  isActive,
  onReply,
  onSeek,
}: {
  comment: CallComment;
  isReply?: boolean;
  isActive?: boolean;
  onReply?: () => void;
  onSeek?: () => void;
}) {
  const isManager = comment.authorType === 'manager';
  const bgColor = isManager ? 'bg-orange-50' : 'bg-blue-50';
  const borderColor = isManager ? 'border-l-orange-400' : 'border-l-blue-400';
  const nameColor = isManager ? 'text-orange-700' : 'text-blue-700';

  const hasTimestamp = onSeek && comment.timestampSeconds != null;

  return (
    <div
      onClick={hasTimestamp ? onSeek : undefined}
      className={`p-3 rounded-lg ${bgColor} border-l-[3px] ${borderColor} transition-shadow ${isActive ? 'ring-2 ring-blue-400 shadow-md' : ''} ${hasTimestamp ? 'cursor-pointer hover:brightness-95' : ''}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {isReply && (
            <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          )}
          <span className={`text-[12px] font-semibold ${nameColor}`}>{comment.authorName}</span>
          {comment.timestampSeconds != null && (
            <span className="text-[11px] text-blue-600 underline font-medium">
              {formatTimestamp(comment.timestampSeconds)}
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-400">{formatRelativeDate(comment.createdAt)}</span>
      </div>
      <p className="text-[13px] text-gray-700 leading-relaxed">{comment.content}</p>
      {onReply && !isReply && (
        <div className="flex justify-end mt-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onReply(); }}
            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 font-medium"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            Reply
          </button>
        </div>
      )}
    </div>
  );
}

// --- Helpers ---

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatShortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
