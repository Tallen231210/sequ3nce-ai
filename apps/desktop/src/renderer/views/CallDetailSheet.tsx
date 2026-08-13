import React, { useEffect, useState, useRef, useCallback } from 'react';
import type {
  CloserInfo,
  CallHistoryItem,
  TranscriptSegment,
  AmmoItem,
  CallAnalysis,
} from '../convex';
import {
  getTranscriptSegments,
  getAmmoByCall,
  flagCallForReview,
  unflagCall,
  refreshRecordingUrl,
  createSharedLink,
  getCallAnalysis,
} from '../convex';
import { CallClassificationBar } from './CallClassificationBar';
import { CallDetailChapters } from './CallDetailChapters';
import { CallDetailOverviewTab } from './CallDetailOverviewTab';
import { CallDetailAnalysisTab } from './CallDetailAnalysisTab';
import { CallDetailTranscriptTab } from './CallDetailTranscriptTab';

type TabId = 'overview' | 'analysis' | 'transcript';

interface CallDetailSheetProps {
  closerInfo: CloserInfo;
  call: CallHistoryItem;
  onClose: () => void;
  onCallUpdated: (call: CallHistoryItem) => void;
}

export function CallDetailSheet({
  closerInfo,
  call,
  onClose,
  onCallUpdated,
}: CallDetailSheetProps) {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [ammoItems, setAmmoItems] = useState<AmmoItem[]>([]);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(true);
  const [isLoadingAmmo, setIsLoadingAmmo] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | null>(call.recordingUrl || null);
  const [isRefreshingUrl, setIsRefreshingUrl] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Analysis polling state — fetches analysis independently so it updates when backend finishes
  const [polledAnalysis, setPolledAnalysis] = useState<CallAnalysis | undefined>(call.callAnalysis);

  // Flag state
  const [isFlagged, setIsFlagged] = useState(call.flaggedForReview || false);
  const [reviewStatus, setReviewStatus] = useState(call.reviewStatus || null);
  const [isFlagging, setIsFlagging] = useState(false);

  // Share link state
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mountedRef = useRef(true);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastTimeUpdateRef = useRef(0);

  const hasVideo = call.recordingType === 'video' && !!call.recordingUrl;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  // Load transcript + ammo
  useEffect(() => {
    let active = true;
    setIsLoadingTranscript(true);
    getTranscriptSegments(call._id).then((t) => {
      if (active) { setTranscript(t); setIsLoadingTranscript(false); }
    });

    setIsLoadingAmmo(true);
    getAmmoByCall(call._id).then((a) => {
      if (active) { setAmmoItems(a); setIsLoadingAmmo(false); }
    });

    // Refresh recording URL if video
    if (hasVideo) {
      setIsRefreshingUrl(true);
      refreshRecordingUrl(call._id).then((url) => {
        if (active) {
          if (url) setVideoUrl(url);
          setIsRefreshingUrl(false);
        }
      });
    }

    return () => { active = false; };
  }, [call._id, hasVideo]);

  // Poll for analysis when it's not available yet (backend generates it ~65s after call ends)
  useEffect(() => {
    // Already have analysis — no polling needed
    if (polledAnalysis) return;
    // Only poll for recent calls (within 5 minutes) that have an outcome
    if (!call.outcome || !isRecentCall(call.endedAt || call.startedAt)) return;

    let active = true;
    const poll = () => {
      getCallAnalysis(call._id).then((analysis) => {
        if (!active) return;
        if (analysis) {
          setPolledAnalysis(analysis);
          // Also update the parent so call history list reflects the new data
          onCallUpdated({ ...call, callAnalysis: analysis });
        }
      });
    };

    // Poll every 5 seconds
    const intervalId = setInterval(poll, 5000);
    // Also poll immediately in case analysis completed between page load and now
    poll();

    return () => { active = false; clearInterval(intervalId); };
  }, [call._id, call.outcome, call.endedAt, call.startedAt, polledAnalysis]);

  function handleSeek(time: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play().catch(() => {});
    }
  }

  async function handleToggleFlag() {
    setIsFlagging(true);
    if (isFlagged && reviewStatus !== 'reviewed') {
      const ok = await unflagCall(call._id, closerInfo.closerId);
      if (ok) {
        setIsFlagged(false);
        onCallUpdated({ ...call, flaggedForReview: false });
      }
    } else {
      const ok = await flagCallForReview(call._id, closerInfo.closerId);
      if (ok) {
        setIsFlagged(true);
        setReviewStatus(null);
        onCallUpdated({ ...call, flaggedForReview: true, reviewStatus: undefined });
      }
    }
    setIsFlagging(false);
  }

  async function handleShareLink() {
    setIsCreatingLink(true);
    setShareError(false);
    const result = await createSharedLink(call._id, closerInfo.closerId, closerInfo.teamId);
    setIsCreatingLink(false);

    if (result) {
      try { await navigator.clipboard.writeText(result.url); } catch { /* clipboard may not be available */ }
      setShareCopied(true);
      const t = setTimeout(() => { if (mountedRef.current) setShareCopied(false); }, 2000);
      timeoutsRef.current.push(t);
    } else {
      setShareError(true);
      const t = setTimeout(() => { if (mountedRef.current) setShareError(false); }, 3000);
      timeoutsRef.current.push(t);
    }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'transcript', label: 'Transcript' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[880px] h-[720px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-black truncate">
              {call.prospectName || 'Unknown Prospect'}
            </h2>
            <div className="flex items-center gap-3 text-[12px] text-gray-500">
              <span>{formatDate(call.startedAt)}</span>
              <span>{formatDuration(call.duration)}</span>
              <OutcomeBadge outcome={call.outcome} />
            </div>
          </div>

          {/* Flag button */}
          {hasVideo && (
            <button
              onClick={handleToggleFlag}
              disabled={isFlagging}
              className={`flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium rounded-md border transition-colors ${
                isFlagged
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 6a3 3 0 013-3h2.25a3 3 0 013 3v2.25a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm9.47.47a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 11-1.06-1.06L15.19 12H10.5a.75.75 0 010-1.5h4.69l-2.72-2.72a.75.75 0 010-1.06z" clipRule="evenodd" />
              </svg>
              {reviewStatus === 'reviewed' ? 'Flag Again' : isFlagged ? 'Flagged' : 'Flag for Review'}
            </button>
          )}

          {/* Share Link button */}
          {hasVideo && (
            <ShareButton
              isCreatingLink={isCreatingLink}
              shareCopied={shareCopied}
              shareError={shareError}
              onClick={handleShareLink}
            />
          )}

          {/* Close */}
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Was this a sales call? Sits directly under the header so the
            question is answered before they start reading the call. */}
        <CallClassificationBar
          callId={call._id}
          closerId={closerInfo.closerId}
          classifiedAs={call.classifiedAs}
          classifiedBy={call.classifiedBy}
          countsTowardStats={call.countsTowardStats}
          onChanged={(isSalesCall) =>
            onCallUpdated({
              ...call,
              classifiedAs: isSalesCall ? 'sales' : 'internal',
              classifiedBy: 'closer',
              countsTowardStats: isSalesCall,
            })
          }
        />

        {/* Video Player (pinned) */}
        {hasVideo && (
          <div className="shrink-0">
            {isRefreshingUrl ? (
              <div className="flex items-center justify-center h-[200px] bg-gray-50">
                <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                onTimeUpdate={() => {
                  const now = Date.now();
                  if (now - lastTimeUpdateRef.current < 250) return;
                  lastTimeUpdateRef.current = now;
                  if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                }}
                className="w-full h-full"
                style={{ backgroundColor: '#111', aspectRatio: '16/9', maxHeight: 280 }}
              />
            ) : (
              <div className="flex items-center justify-center h-[60px] bg-gray-50 text-[13px] text-gray-500">
                Recording unavailable
              </div>
            )}

            {/* Chapter Strip */}
            <CallDetailChapters
              chapters={polledAnalysis?.chapters}
              currentTime={currentTime}
              onSeek={handleSeek}
              isAnalyzing={!polledAnalysis && call.outcome !== undefined && isRecentCall(call.endedAt || call.startedAt)}
            />
          </div>
        )}

        {/* Tab Bar */}
        <div className="flex border-b border-gray-200 px-5 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-[12px] font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-black border-black'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'transcript' ? (
          // Transcript tab needs flex container so its inner scroll works
          <div className="flex-1 flex flex-col overflow-hidden">
            <CallDetailTranscriptTab
              transcript={transcript}
              isLoading={isLoadingTranscript}
              currentTime={currentTime}
              onSeek={handleSeek}
              fallbackText={call.transcriptText}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === 'overview' && (
              <CallDetailOverviewTab
                call={call}
                ammoItems={ammoItems}
                isLoadingAmmo={isLoadingAmmo}
                closerId={closerInfo.closerId}
              />
            )}
            {activeTab === 'analysis' && (
              <CallDetailAnalysisTab
                callAnalysis={polledAnalysis}
                isRecent={isRecentCall(call.endedAt || call.startedAt)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function ShareButton({
  isCreatingLink,
  shareCopied,
  shareError,
  onClick,
}: {
  isCreatingLink: boolean;
  shareCopied: boolean;
  shareError: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isCreatingLink}
      className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
    >
      {isCreatingLink ? (
        <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      ) : shareCopied ? (
        <>
          <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          <span className="text-green-600">Copied!</span>
        </>
      ) : shareError ? (
        <>
          <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          <span className="text-red-500">Failed</span>
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Share Link
        </>
      )}
    </button>
  );
}

function OutcomeBadge({ outcome }: { outcome?: string }) {
  if (!outcome) return null;
  const config: Record<string, { text: string; bg: string; label: string }> = {
    closed: { text: 'text-green-700', bg: 'bg-green-50', label: 'Closed' },
    lost: { text: 'text-red-600', bg: 'bg-red-50', label: 'Lost' },
    no_show: { text: 'text-gray-600', bg: 'bg-gray-100', label: 'No Show' },
    follow_up: { text: 'text-blue-600', bg: 'bg-blue-50', label: 'Follow Up' },
  };
  const c = config[outcome];
  if (!c) return null;
  return (
    <span className={`px-2 py-0.5 text-[11px] font-medium rounded ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isRecentCall(timestamp: number): boolean {
  return Date.now() - timestamp < 5 * 60 * 1000; // 5 minutes
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
