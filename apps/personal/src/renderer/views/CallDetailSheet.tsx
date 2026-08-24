import React, { useEffect, useState, useRef, useCallback } from 'react';
import type {
  CloserInfo,
  CallHistoryItem,
  TranscriptSegment,
  AmmoItem,
  CallAnalysis,
  CallChapter,
  HighlightClip,
} from '../convex';
import {
  getTranscriptSegments,
  getAmmoByCall,
  refreshRecordingUrl,
  getCallAnalysis,
  getHighlightClipsByCall,
} from '../convex';
import { CallDetailChapters } from './CallDetailChapters';
import { CallDetailOverviewTab } from './CallDetailOverviewTab';
import { CallDetailAnalysisTab } from './CallDetailAnalysisTab';
import { CallDetailTranscriptTab } from './CallDetailTranscriptTab';
import { ShareModal } from './ShareModal';
import { AddToReelModal } from './AddToReelModal';

type TabId = 'overview' | 'analysis' | 'transcript';

interface CallDetailSheetProps {
  closerInfo: CloserInfo;
  call: CallHistoryItem;
  onClose: () => void;
  onCallUpdated: (call: CallHistoryItem) => void;
  /** Opens the post-call form prefilled with this call's current values, so a
   *  wrong outcome or a cash typo can be fixed without hunting for the call
   *  in the pending queue. */
  onEditOutcome?: () => void;
}

export function CallDetailSheet({
  closerInfo,
  call,
  onClose,
  onCallUpdated,
  onEditOutcome,
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

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);

  // Add to Reel modal state
  const [showAddToReelModal, setShowAddToReelModal] = useState(false);
  const [addToReelChapter, setAddToReelChapter] = useState<CallChapter | undefined>(undefined);
  const [existingClips, setExistingClips] = useState<HighlightClip[]>([]);

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

    // Refresh recording URL if video — retry up to 10 times (recording may still be uploading)
    if (hasVideo) {
      setIsRefreshingUrl(true);
      let retryCount = 0;
      const tryRefresh = () => {
        refreshRecordingUrl(call._id).then((url) => {
          if (!active) return;
          if (url) {
            setVideoUrl(url);
            setIsRefreshingUrl(false);
          } else if (retryCount < 10) {
            retryCount++;
            setTimeout(tryRefresh, 3000);
          } else {
            setIsRefreshingUrl(false);
          }
        });
      };
      tryRefresh();
    }

    // Load existing highlight clips for this call
    if (closerInfo.b2cUserId) {
      getHighlightClipsByCall(call._id).then((clips) => {
        if (active) setExistingClips(clips);
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
              {onEditOutcome && (
                <button
                  onClick={onEditOutcome}
                  className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                  title="Edit the outcome and numbers for this call"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                  </svg>
                  Edit
                </button>
              )}
            </div>
          </div>

          {/* Add to Reel button */}
          {hasVideo && closerInfo.b2cUserId && (
            <button
              onClick={() => {
                setAddToReelChapter(undefined);
                setShowAddToReelModal(true);
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M19.125 12h1.5m0 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h1.5m14.25 0h1.5" />
              </svg>
              Add to Reel
            </button>
          )}


          {/* Share button */}
          {hasVideo && (
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Share
            </button>
          )}

          {/* Close */}
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Video Player (pinned) */}
        {hasVideo && (
          <div className="shrink-0">
            {isRefreshingUrl ? (
              <div className="flex flex-col items-center justify-center h-[200px] bg-gray-50 dark:bg-gray-800 rounded-lg">
                <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mb-2" />
                <span className="text-xs text-gray-400 dark:text-gray-500">Processing recording...</span>
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
                className="w-full"
                style={{ backgroundColor: '#000', maxHeight: 280 }}
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
              onAddToReel={closerInfo.b2cUserId ? (chapter) => {
                setAddToReelChapter(chapter);
                setShowAddToReelModal(true);
              } : undefined}
              existingClipChapters={existingClips.map((c) => c.label)}
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

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal
          callId={call._id}
          closerInfo={closerInfo}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Add to Reel Modal */}
      {showAddToReelModal && (
        <AddToReelModal
          closerInfo={closerInfo}
          call={call}
          chapter={addToReelChapter}
          videoUrl={videoUrl}
          onClose={() => setShowAddToReelModal(false)}
          onAdded={() => {
            // Refresh existing clips list
            if (closerInfo.b2cUserId) {
              getHighlightClipsByCall(call._id).then(setExistingClips);
            }
          }}
        />
      )}
    </div>
  );
}

// --- Sub-components ---

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
