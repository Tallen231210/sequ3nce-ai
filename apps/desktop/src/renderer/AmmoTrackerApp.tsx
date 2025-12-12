import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AmmoItem } from './types/electron';

const CONVEX_SITE_URL = 'https://fastidious-dragon-782.convex.site';
const POLL_INTERVAL = 2000; // Poll every 2 seconds

// Speaker mapping type
interface SpeakerMapping {
  closerSpeaker: string; // "speaker_0" or "speaker_1"
  confirmed: boolean;
}

// Speaker identification banner component
function SpeakerIdentificationBanner({
  speakerMapping,
  closerSnippet,
  onSwap,
  onConfirm,
  isSwapping,
}: {
  speakerMapping: SpeakerMapping;
  closerSnippet?: string; // First thing the detected closer said
  onSwap: () => void;
  onConfirm: () => void;
  isSwapping: boolean;
}) {
  // Don't show if already confirmed
  if (speakerMapping.confirmed) return null;

  // Truncate snippet if too long
  const truncatedSnippet = closerSnippet && closerSnippet.length > 60
    ? closerSnippet.slice(0, 60) + '...'
    : closerSnippet;

  return (
    <div className="mx-2 mb-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 animate-fade-in">
      {/* Question */}
      <p className="text-[11px] text-blue-300 mb-2">
        Did you say this?
      </p>

      {/* Snippet quote */}
      {truncatedSnippet ? (
        <p className="text-[12px] text-zinc-200 mb-2.5 leading-snug italic">
          "{truncatedSnippet}"
        </p>
      ) : (
        <p className="text-[11px] text-zinc-500 mb-2.5 italic">
          Waiting for speech...
        </p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onConfirm}
          disabled={isSwapping || !closerSnippet}
          className="flex-1 px-3 py-1.5 text-[11px] font-medium rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors disabled:opacity-50"
        >
          Yes, that's me
        </button>
        <button
          onClick={onSwap}
          disabled={isSwapping || !closerSnippet}
          className="flex-1 px-3 py-1.5 text-[11px] font-medium rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors disabled:opacity-50"
        >
          {isSwapping ? '...' : "No, that's the prospect"}
        </button>
      </div>
    </div>
  );
}

// Ammo type configuration for styling
const AMMO_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  emotional: { label: 'Emotional', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  urgency: { label: 'Urgency', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  budget: { label: 'Budget', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
  commitment: { label: 'Commitment', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  objection_preview: { label: 'Objection', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
  pain_point: { label: 'Pain Point', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
};

// Format timestamp to relative time
function formatRelativeTime(createdAt: number): string {
  const seconds = Math.floor((Date.now() - createdAt) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

// Single ammo item component
function AmmoItemCard({ item, onCopy }: { item: AmmoItem; onCopy: (text: string) => void }) {
  const [copied, setCopied] = useState(false);
  const config = AMMO_TYPE_CONFIG[item.type] || { label: item.type, color: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30' };

  const handleClick = () => {
    onCopy(item.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      onClick={handleClick}
      className="group relative p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all duration-200 hover:bg-zinc-800/80 animate-fade-in"
    >
      {/* Type badge and time */}
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${config.color}`}>
          {config.label}
        </span>
        <span className="text-[10px] text-zinc-500">
          {formatRelativeTime(item.createdAt)}
        </span>
      </div>

      {/* Quote text */}
      <p className="text-sm text-zinc-200 leading-snug line-clamp-3">
        "{item.text}"
      </p>

      {/* Copy indicator */}
      <div className={`absolute inset-0 rounded-lg flex items-center justify-center bg-zinc-900/95 transition-opacity duration-200 ${copied ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-1.5 text-green-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium">Copied!</span>
        </div>
      </div>

      {/* Hover hint */}
      <div className="absolute bottom-1 right-2 text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">
        click to copy
      </div>
    </div>
  );
}

export function AmmoTrackerApp() {
  const [callId, setCallId] = useState<string | null>(null);
  const [ammoItems, setAmmoItems] = useState<AmmoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [speakerMapping, setSpeakerMapping] = useState<SpeakerMapping | null>(null);
  const [closerSnippet, setCloserSnippet] = useState<string | undefined>(undefined);
  const [isSwapping, setIsSwapping] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  // Fetch call info including speaker mapping and closer snippet
  const fetchCallInfo = useCallback(async (currentCallId: string) => {
    try {
      const response = await fetch(
        `${CONVEX_SITE_URL}/getCallInfo?callId=${encodeURIComponent(currentCallId)}`
      );
      if (!response.ok) return;

      const data = await response.json();
      if (data.speakerMapping) {
        setSpeakerMapping(data.speakerMapping);
      }
      if (data.closerSnippet) {
        setCloserSnippet(data.closerSnippet);
      }
    } catch (error) {
      console.error('[AmmoTracker] Failed to fetch call info:', error);
    }
  }, []);

  // Fetch ammo from Convex
  const fetchAmmo = useCallback(async (currentCallId: string) => {
    try {
      const response = await fetch(
        `${CONVEX_SITE_URL}/getAmmoByCall?callId=${encodeURIComponent(currentCallId)}`
      );
      if (!response.ok) return;

      const data: AmmoItem[] = await response.json();

      // Sort by createdAt descending, take latest 5
      const sorted = data.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);

      // Check for new items (for potential animation triggers)
      sorted.forEach(item => {
        if (!seenIds.current.has(item._id)) {
          seenIds.current.add(item._id);
        }
      });

      setAmmoItems(sorted);
      setIsLoading(false);
    } catch (error) {
      console.error('[AmmoTracker] Failed to fetch ammo:', error);
    }
  }, []);

  // Swap speaker mapping (user indicates detection was wrong)
  const handleSwapSpeaker = useCallback(async () => {
    if (!callId) return;
    setIsSwapping(true);

    try {
      const response = await fetch(`${CONVEX_SITE_URL}/swapSpeakerMapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      });

      if (response.ok) {
        // Update local state optimistically
        setSpeakerMapping(prev => prev ? {
          closerSpeaker: prev.closerSpeaker === 'speaker_0' ? 'speaker_1' : 'speaker_0',
          confirmed: true,
        } : null);
      }
    } catch (error) {
      console.error('[AmmoTracker] Failed to swap speaker mapping:', error);
    }

    setIsSwapping(false);
  }, [callId]);

  // Confirm speaker mapping (user indicates detection was correct)
  const handleConfirmSpeaker = useCallback(async () => {
    if (!callId) return;
    setIsSwapping(true);

    try {
      const response = await fetch(`${CONVEX_SITE_URL}/confirmSpeakerMapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      });

      if (response.ok) {
        // Update local state
        setSpeakerMapping(prev => prev ? { ...prev, confirmed: true } : null);
      }
    } catch (error) {
      console.error('[AmmoTracker] Failed to confirm speaker mapping:', error);
    }

    setIsSwapping(false);
  }, [callId]);

  // Copy to clipboard via IPC
  const handleCopy = useCallback(async (text: string) => {
    if (window.ammoTracker) {
      await window.ammoTracker.copyToClipboard(text);
    } else {
      // Fallback to browser API
      navigator.clipboard.writeText(text);
    }
  }, []);

  // Initialize and set up listeners
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    let callInfoInterval: NodeJS.Timeout | null = null;

    const init = async () => {
      if (!window.ammoTracker) {
        console.error('[AmmoTracker] ammoTracker API not available');
        setIsLoading(false);
        return;
      }

      // Get initial call ID
      const initialCallId = await window.ammoTracker.getCallId();
      console.log('[AmmoTracker] Initial callId:', initialCallId);
      setCallId(initialCallId);

      if (initialCallId) {
        fetchAmmo(initialCallId);
        fetchCallInfo(initialCallId);
        // Start polling
        pollInterval = setInterval(() => fetchAmmo(initialCallId), POLL_INTERVAL);
        // Also poll call info for speaker mapping updates (less frequently)
        callInfoInterval = setInterval(() => fetchCallInfo(initialCallId), POLL_INTERVAL * 2);
      } else {
        setIsLoading(false);
      }

      // Listen for call ID changes
      const unsubCallId = window.ammoTracker.onCallIdChange((newCallId) => {
        console.log('[AmmoTracker] Call ID changed:', newCallId);
        setCallId(newCallId);
        seenIds.current.clear();
        setAmmoItems([]);
        setSpeakerMapping(null); // Reset speaker mapping on new call
        setCloserSnippet(undefined); // Reset closer snippet on new call

        // Clear old polling
        if (pollInterval) clearInterval(pollInterval);
        if (callInfoInterval) clearInterval(callInfoInterval);

        if (newCallId) {
          setIsLoading(true);
          fetchAmmo(newCallId);
          fetchCallInfo(newCallId);
          pollInterval = setInterval(() => fetchAmmo(newCallId), POLL_INTERVAL);
          callInfoInterval = setInterval(() => fetchCallInfo(newCallId), POLL_INTERVAL * 2);
        } else {
          setIsLoading(false);
        }
      });

      // Listen for pushed ammo items (instant updates from main process)
      const unsubNewAmmo = window.ammoTracker.onNewAmmo((newAmmo) => {
        console.log('[AmmoTracker] New ammo received:', newAmmo);
        setAmmoItems(prev => {
          if (prev.some(item => item._id === newAmmo._id)) return prev;
          const updated = [newAmmo, ...prev].slice(0, 5);
          seenIds.current.add(newAmmo._id);
          return updated;
        });
      });

      return () => {
        unsubCallId();
        unsubNewAmmo();
        if (pollInterval) clearInterval(pollInterval);
        if (callInfoInterval) clearInterval(callInfoInterval);
      };
    };

    init();

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (callInfoInterval) clearInterval(callInfoInterval);
    };
  }, [fetchAmmo, fetchCallInfo]);

  return (
    <div className="h-screen w-screen bg-black/95 backdrop-blur-sm text-white overflow-hidden flex flex-col">
      {/* Draggable title bar */}
      <div className="h-8 flex items-center justify-between px-3 border-b border-zinc-800/50 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${callId ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
          <span className="text-xs font-medium text-zinc-400">Ammo Tracker</span>
        </div>
        <button
          onClick={() => window.ammoTracker?.close()}
          className="w-5 h-5 rounded hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Speaker identification banner */}
      {callId && speakerMapping && !speakerMapping.confirmed && (
        <SpeakerIdentificationBanner
          speakerMapping={speakerMapping}
          closerSnippet={closerSnippet}
          onSwap={handleSwapSpeaker}
          onConfirm={handleConfirmSpeaker}
          isSwapping={isSwapping}
        />
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
        {!callId ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 py-8">
            <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-xs text-center px-4">
              Start a call to see ammo appear here
            </p>
          </div>
        ) : isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
          </div>
        ) : ammoItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 py-8">
            <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-xs text-center px-4">
              Listening for key moments...
            </p>
          </div>
        ) : (
          ammoItems.map((item) => (
            <AmmoItemCard key={item._id} item={item} onCopy={handleCopy} />
          ))
        )}
      </div>

      {/* Footer with call ID */}
      {callId && (
        <div className="px-3 py-1.5 border-t border-zinc-800/50 shrink-0">
          <p className="text-[9px] text-zinc-600 truncate">
            Call: {callId.slice(0, 20)}...
          </p>
        </div>
      )}
    </div>
  );
}
