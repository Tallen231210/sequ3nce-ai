import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AmmoItem, TranscriptSegment, Nudge } from './types/electron';

const CONVEX_SITE_URL = 'https://ideal-ram-982.convex.site';
const POLL_INTERVAL = 2000; // Poll every 2 seconds
const NOTES_SAVE_DELAY = 2000; // Auto-save notes after 2 seconds of no typing

// Tab types
type TabType = 'ammo' | 'nudges' | 'transcript' | 'notes';

// Speaker mapping type
interface SpeakerMapping {
  closerSpeaker: string;
  confirmed: boolean;
}

// Tab Icon Components
function AmmoIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-4 h-4 ${active ? 'text-black' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function TranscriptIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-4 h-4 ${active ? 'text-black' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function NotesIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-4 h-4 ${active ? 'text-black' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function NudgesIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-4 h-4 ${active ? 'text-black' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

// Ammo type configuration for styling
const AMMO_TYPE_CONFIG: Record<string, { label: string; bgColor: string; textColor: string; borderColor: string }> = {
  emotional: { label: 'Emotional', bgColor: 'bg-purple-50', textColor: 'text-purple-600', borderColor: 'border-purple-200' },
  urgency: { label: 'Urgency', bgColor: 'bg-orange-50', textColor: 'text-orange-600', borderColor: 'border-orange-200' },
  budget: { label: 'Budget', bgColor: 'bg-green-50', textColor: 'text-green-600', borderColor: 'border-green-200' },
  commitment: { label: 'Commitment', bgColor: 'bg-blue-50', textColor: 'text-blue-600', borderColor: 'border-blue-200' },
  objection_preview: { label: 'Objection', bgColor: 'bg-red-50', textColor: 'text-red-600', borderColor: 'border-red-200' },
  pain_point: { label: 'Pain Point', bgColor: 'bg-yellow-50', textColor: 'text-yellow-700', borderColor: 'border-yellow-200' },
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

// Format seconds to MM:SS
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================
// SPEAKER IDENTIFICATION BANNER
// ============================================
function SpeakerIdentificationBanner({
  speakerMapping,
  closerSnippet,
  onSwap,
  onConfirm,
  isSwapping,
}: {
  speakerMapping: SpeakerMapping;
  closerSnippet?: string;
  onSwap: () => void;
  onConfirm: () => void;
  isSwapping: boolean;
}) {
  if (speakerMapping.confirmed) return null;

  const truncatedSnippet = closerSnippet && closerSnippet.length > 60
    ? closerSnippet.slice(0, 60) + '...'
    : closerSnippet;

  return (
    <div className="mx-2 mb-2 p-3 rounded-lg bg-blue-50 border border-blue-200 animate-fade-in">
      <p className="text-[11px] font-medium text-blue-600 mb-2">Did you say this?</p>
      {truncatedSnippet ? (
        <p className="text-[12px] text-gray-700 mb-2.5 leading-snug italic">"{truncatedSnippet}"</p>
      ) : (
        <p className="text-[11px] text-gray-400 mb-2.5 italic">Waiting for speech...</p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={onConfirm}
          disabled={isSwapping || !closerSnippet}
          className="flex-1 px-3 py-1.5 text-[11px] font-medium rounded-md bg-black text-white hover:bg-gray-800 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Yes, that's me
        </button>
        <button
          onClick={onSwap}
          disabled={isSwapping || !closerSnippet}
          className="flex-1 px-3 py-1.5 text-[11px] font-medium rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSwapping ? '...' : "No, that's the prospect"}
        </button>
      </div>
    </div>
  );
}

// ============================================
// AMMO STRENGTH INDICATOR
// ============================================
function AmmoStrengthIndicator({ heavyHitterCount }: { heavyHitterCount: number }) {
  let label: string;
  let color: string;
  let icon: string;

  if (heavyHitterCount >= 8) {
    label = 'Strong';
    color = 'text-green-600 bg-green-50 border-green-200';
    icon = '🎯';
  } else if (heavyHitterCount >= 4) {
    label = 'Moderate';
    color = 'text-yellow-600 bg-yellow-50 border-yellow-200';
    icon = '🎯';
  } else if (heavyHitterCount >= 1) {
    label = 'Light';
    color = 'text-orange-600 bg-orange-50 border-orange-200';
    icon = '⚠️';
  } else {
    label = 'Not enough data';
    color = 'text-gray-500 bg-gray-50 border-gray-200';
    icon = '⚠️';
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${color}`}>
      <span className="text-sm">{icon}</span>
      <span className="text-xs font-medium">Ammo Strength: {label}</span>
      {heavyHitterCount > 0 && (
        <span className="text-[10px] opacity-70">({heavyHitterCount} heavy hitters)</span>
      )}
    </div>
  );
}

// ============================================
// REVEALED AMMO CARD (with suggested use)
// ============================================
function RevealedAmmoCard({ item, onCopy }: { item: AmmoItem; onCopy: (text: string) => void }) {
  const [copied, setCopied] = useState(false);
  const config = AMMO_TYPE_CONFIG[item.type] || { label: item.type, bgColor: 'bg-gray-50', textColor: 'text-gray-600', borderColor: 'border-gray-200' };

  const handleClick = () => {
    onCopy(item.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      onClick={handleClick}
      className="group relative p-3 rounded-lg bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm cursor-pointer transition-all duration-150 animate-fade-in"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${config.bgColor} ${config.textColor} ${config.borderColor}`}>
            {config.label}
          </span>
          {item.isHeavyHitter && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-black text-white">
              Heavy Hitter
            </span>
          )}
        </div>
        {item.score !== undefined && (
          <span className="text-[10px] text-gray-400">Score: {item.score}</span>
        )}
      </div>
      <p className="text-sm text-gray-700 leading-snug mb-2">"{item.text}"</p>
      {item.suggestedUse && (
        <p className="text-[11px] text-gray-500 italic leading-snug border-t border-gray-100 pt-2 mt-2">
          → {item.suggestedUse}
        </p>
      )}
      <div className={`absolute inset-0 rounded-lg flex items-center justify-center bg-white/95 transition-opacity duration-150 ${copied ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-1.5 text-green-600">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium">Copied!</span>
        </div>
      </div>
      <div className="absolute bottom-1 right-2 text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        click to copy
      </div>
    </div>
  );
}

// ============================================
// AMMO TAB COMPONENT (with Gathering/Reveal states)
// ============================================
function AmmoTab({
  callId,
  ammoItems,
  onCopy,
  isRevealed,
  onReveal
}: {
  callId: string | null;
  ammoItems: AmmoItem[];
  onCopy: (text: string) => void;
  isRevealed: boolean;
  onReveal: () => void;
}) {
  // Get heavy hitters only
  const heavyHitters = ammoItems.filter(item => item.isHeavyHitter);
  const totalGathered = ammoItems.length;

  if (!callId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 py-8">
        <AmmoIcon active={false} />
        <p className="text-xs text-center px-4 mt-2">Start a call to see ammo appear here</p>
      </div>
    );
  }

  // GATHERING STATE - before reveal
  if (!isRevealed) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-8">
        {/* Pulsing animation */}
        <div className="relative mb-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <AmmoIcon active={true} />
          </div>
          {totalGathered > 0 && (
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-black text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {totalGathered > 99 ? '99+' : totalGathered}
            </div>
          )}
          {/* Pulsing ring */}
          <div className="absolute inset-0 rounded-full border-2 border-gray-300 animate-ping opacity-30" />
        </div>

        <p className="text-sm font-medium text-gray-700 mb-1">Gathering Ammo...</p>
        <p className="text-xs text-gray-400 mb-6">
          {totalGathered === 0
            ? 'Listening for key moments'
            : `${totalGathered} item${totalGathered === 1 ? '' : 's'} gathered`
          }
        </p>

        {/* Reveal button - only show if we have items */}
        {totalGathered > 0 && (
          <button
            onClick={onReveal}
            className="px-6 py-2.5 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors duration-150 shadow-sm"
          >
            Reveal Ammo
          </button>
        )}
      </div>
    );
  }

  // REVEALED STATE - show heavy hitters
  return (
    <div className="p-2 space-y-3">
      {/* Ammo strength indicator */}
      <AmmoStrengthIndicator heavyHitterCount={heavyHitters.length} />

      {/* Heavy hitters list */}
      {heavyHitters.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-gray-400 py-6">
          <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-xs text-center px-4">No heavy hitters detected yet</p>
          <p className="text-[10px] text-center px-4 mt-1 text-gray-300">
            Heavy hitters are emotionally charged, repeated, or specific statements
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {heavyHitters.map((item) => (
            <RevealedAmmoCard key={item._id} item={item} onCopy={onCopy} />
          ))}
        </div>
      )}

      {/* Show all ammo toggle (optional, for debugging/reference) */}
      {ammoItems.length > heavyHitters.length && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 text-center">
            {ammoItems.length - heavyHitters.length} more items gathered (not heavy hitters)
          </p>
        </div>
      )}
    </div>
  );
}

function AmmoItemCard({ item, onCopy }: { item: AmmoItem; onCopy: (text: string) => void }) {
  const [copied, setCopied] = useState(false);
  const config = AMMO_TYPE_CONFIG[item.type] || { label: item.type, bgColor: 'bg-gray-50', textColor: 'text-gray-600', borderColor: 'border-gray-200' };

  const handleClick = () => {
    onCopy(item.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      onClick={handleClick}
      className="group relative p-3 rounded-lg bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm cursor-pointer transition-all duration-150 animate-fade-in"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${config.bgColor} ${config.textColor} ${config.borderColor}`}>
          {config.label}
        </span>
        <span className="text-[10px] text-gray-400">{formatRelativeTime(item.createdAt)}</span>
      </div>
      <p className="text-sm text-gray-700 leading-snug line-clamp-3">"{item.text}"</p>
      <div className={`absolute inset-0 rounded-lg flex items-center justify-center bg-white/95 transition-opacity duration-150 ${copied ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-1.5 text-green-600">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium">Copied!</span>
        </div>
      </div>
      <div className="absolute bottom-1 right-2 text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        click to copy
      </div>
    </div>
  );
}

// ============================================
// TRANSCRIPT TAB COMPONENT
// ============================================
function TranscriptTab({ callId, segments }: { callId: string | null; segments: TranscriptSegment[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const lastSegmentCountRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter segments based on search query
  const filteredSegments = searchQuery.trim()
    ? segments.filter(seg => seg.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : segments;

  // Count of matches
  const matchCount = searchQuery.trim() ? filteredSegments.length : 0;

  useEffect(() => {
    // Only auto-scroll if not searching
    if (!searchQuery && autoScroll && scrollRef.current && segments.length > lastSegmentCountRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    lastSegmentCountRef.current = segments.length;
  }, [segments, autoScroll, searchQuery]);

  const handleScroll = () => {
    if (!scrollRef.current || searchQuery) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const jumpToLatest = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  if (!callId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 py-8">
        <TranscriptIcon active={false} />
        <p className="text-xs text-center px-4 mt-2">Start a call to see the transcript here</p>
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 py-8">
        <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        <p className="text-xs text-center px-4">Waiting for speech...</p>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      {/* Search bar */}
      <div className="px-2 pt-2 pb-1 shrink-0">
        <div className={`relative flex items-center bg-white border rounded-lg transition-all duration-150 ${isSearchFocused ? 'border-gray-400 ring-1 ring-gray-400' : 'border-gray-200'}`}>
          <svg className="w-3.5 h-3.5 ml-2.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder="Search transcript..."
            className="flex-1 px-2 py-1.5 text-[12px] text-gray-700 bg-transparent focus:outline-none placeholder-gray-400"
          />
          {searchQuery && (
            <>
              <span className="text-[10px] text-gray-400 mr-1">
                {matchCount} {matchCount === 1 ? 'match' : 'matches'}
              </span>
              <button
                onClick={clearSearch}
                className="p-1 mr-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors duration-150"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Transcript content */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
        {filteredSegments.length === 0 && searchQuery ? (
          <div className="flex flex-col items-center justify-center text-gray-400 py-8">
            <p className="text-xs text-center px-4">No matches for "{searchQuery}"</p>
          </div>
        ) : (
          filteredSegments.map((segment, index) => (
            <TranscriptLine key={segment._id || index} segment={segment} searchQuery={searchQuery} />
          ))
        )}
      </div>

      {/* Jump to latest button (only show when not searching) */}
      {!autoScroll && !searchQuery && (
        <button
          onClick={jumpToLatest}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-black text-white text-[11px] font-medium rounded-full shadow-lg hover:bg-gray-800 transition-colors duration-150"
        >
          ↓ Jump to latest
        </button>
      )}
    </div>
  );
}

function TranscriptLine({ segment, searchQuery }: { segment: TranscriptSegment; searchQuery?: string }) {
  const isCloser = segment.speaker.toLowerCase() === 'closer';

  // Highlight matching text
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 text-gray-900 px-0.5 rounded">{part}</mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className={`p-2 rounded-lg ${isCloser ? 'bg-gray-50' : 'bg-white border border-gray-100'} ${searchQuery ? 'border-yellow-300 bg-yellow-50/30' : ''} animate-fade-in`}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className={`text-[10px] font-medium ${isCloser ? 'text-gray-500' : 'text-blue-600'}`}>
          {isCloser ? 'You' : 'Prospect'}
        </span>
        <span className="text-[10px] text-gray-400">{formatTimestamp(segment.timestamp)}</span>
      </div>
      <p className="text-sm text-gray-700 leading-snug">
        {searchQuery ? highlightText(segment.text, searchQuery) : segment.text}
      </p>
    </div>
  );
}

// ============================================
// NOTES TAB COMPONENT
// ============================================
function NotesTab({ callId, notes, onNotesChange, isSaving, lastSaved }: {
  callId: string | null;
  notes: string;
  onNotesChange: (notes: string) => void;
  isSaving: boolean;
  lastSaved: Date | null;
}) {
  if (!callId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 py-8">
        <NotesIcon active={false} />
        <p className="text-xs text-center px-4 mt-2">Start a call to take notes</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-2">
      <textarea
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Jot down notes during the call..."
        className="flex-1 w-full p-3 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150 placeholder-gray-400"
      />
      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-[10px] text-gray-400">{notes.length} characters</span>
        <span className="text-[10px] text-gray-400">{isSaving ? 'Saving...' : lastSaved ? 'Saved' : ''}</span>
      </div>
    </div>
  );
}

// ============================================
// NUDGES TAB COMPONENT
// ============================================

// Nudge type configuration for styling
const NUDGE_TYPE_CONFIG: Record<string, { label: string; icon: string; bgColor: string; textColor: string; borderColor: string }> = {
  dig_deeper: { label: 'Dig Deeper', icon: '🔍', bgColor: 'bg-blue-50', textColor: 'text-blue-600', borderColor: 'border-blue-200' },
  missing_info: { label: 'Missing Info', icon: '📋', bgColor: 'bg-orange-50', textColor: 'text-orange-600', borderColor: 'border-orange-200' },
  script_reminder: { label: 'Framework', icon: '📝', bgColor: 'bg-purple-50', textColor: 'text-purple-600', borderColor: 'border-purple-200' },
  objection_warning: { label: 'Objection', icon: '⚠️', bgColor: 'bg-red-50', textColor: 'text-red-600', borderColor: 'border-red-200' },
};

function NudgeCard({ nudge, onSave, onDismiss }: {
  nudge: Nudge;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const config = NUDGE_TYPE_CONFIG[nudge.type] || {
    label: nudge.type,
    icon: '💡',
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-600',
    borderColor: 'border-gray-200'
  };

  // Don't show dismissed nudges
  if (nudge.status === 'dismissed') return null;

  const isSaved = nudge.status === 'saved';

  return (
    <div className={`p-3 rounded-lg border ${config.borderColor} ${isSaved ? 'bg-green-50' : config.bgColor} animate-fade-in transition-all duration-150`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">{config.icon}</span>
            <span className={`text-[10px] font-medium ${config.textColor}`}>{config.label}</span>
            {isSaved && (
              <span className="text-[10px] font-medium text-green-600">Saved</span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-800 leading-snug">{nudge.message}</p>
          {nudge.detail && (
            <p className="text-[11px] text-gray-500 mt-1 leading-snug">{nudge.detail}</p>
          )}
        </div>
        {!isSaved && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onSave}
              className="p-1.5 rounded hover:bg-white/50 text-gray-400 hover:text-green-600 transition-colors duration-150"
              title="Save nudge"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <button
              onClick={onDismiss}
              className="p-1.5 rounded hover:bg-white/50 text-gray-400 hover:text-gray-600 transition-colors duration-150"
              title="Dismiss nudge"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NudgesTab({
  callId,
  nudges,
  onSaveNudge,
  onDismissNudge
}: {
  callId: string | null;
  nudges: Nudge[];
  onSaveNudge: (nudgeId: string) => void;
  onDismissNudge: (nudgeId: string) => void;
}) {
  // Filter to only show active and saved nudges (not dismissed)
  const visibleNudges = nudges.filter(n => n.status !== 'dismissed');
  const activeNudges = visibleNudges.filter(n => n.status === 'active');
  const savedNudges = visibleNudges.filter(n => n.status === 'saved');

  if (!callId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 py-8">
        <NudgesIcon active={false} />
        <p className="text-xs text-center px-4 mt-2">Start a call to see coaching nudges</p>
      </div>
    );
  }

  if (visibleNudges.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 py-8">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <NudgesIcon active={false} />
        </div>
        <p className="text-xs text-center px-4">Listening for coaching opportunities...</p>
        <p className="text-[10px] text-center px-4 mt-1 text-gray-300">
          Nudges appear when key moments are detected
        </p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2">
      {/* Active nudges first */}
      {activeNudges.map((nudge) => (
        <NudgeCard
          key={nudge._id}
          nudge={nudge}
          onSave={() => onSaveNudge(nudge._id)}
          onDismiss={() => onDismissNudge(nudge._id)}
        />
      ))}

      {/* Saved nudges section */}
      {savedNudges.length > 0 && activeNudges.length > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 mb-2">Saved for later</p>
        </div>
      )}
      {savedNudges.map((nudge) => (
        <NudgeCard
          key={nudge._id}
          nudge={nudge}
          onSave={() => {}}
          onDismiss={() => onDismissNudge(nudge._id)}
        />
      ))}
    </div>
  );
}

// ============================================
// TAB BUTTON COMPONENT
// ============================================
function TabButton({ active, onClick, icon, label, badge }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all duration-150 ${
        active
          ? 'bg-white text-black shadow-sm border border-gray-200'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-black text-white text-[9px] font-bold rounded-full flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

// ============================================
// MAIN APP COMPONENT
// ============================================
export function AmmoTrackerApp() {
  const [activeTab, setActiveTab] = useState<TabType>('ammo');
  const [callId, setCallId] = useState<string | null>(null);
  const [ammoItems, setAmmoItems] = useState<AmmoItem[]>([]);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [notes, setNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [speakerMapping, setSpeakerMapping] = useState<SpeakerMapping | null>(null);
  const [closerSnippet, setCloserSnippet] = useState<string | undefined>(undefined);
  const [isSwapping, setIsSwapping] = useState(false);
  const [isAmmoRevealed, setIsAmmoRevealed] = useState(false);
  const [nudges, setNudges] = useState<Nudge[]>([]);

  const seenAmmoIds = useRef<Set<string>>(new Set());
  const seenSegmentIds = useRef<Set<string>>(new Set());
  const seenNudgeIds = useRef<Set<string>>(new Set());
  const notesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch call info including speaker mapping
  const fetchCallInfo = useCallback(async (currentCallId: string) => {
    try {
      const response = await fetch(`${CONVEX_SITE_URL}/getCallInfo?callId=${encodeURIComponent(currentCallId)}`);
      if (!response.ok) return;

      const data = await response.json();
      if (data.speakerMapping) setSpeakerMapping(data.speakerMapping);
      if (data.closerSnippet) setCloserSnippet(data.closerSnippet);
    } catch (error) {
      console.error('[Panel] Failed to fetch call info:', error);
    }
  }, []);

  // Fetch ammo from Convex
  const fetchAmmo = useCallback(async (currentCallId: string) => {
    try {
      const response = await fetch(`${CONVEX_SITE_URL}/getAmmoByCall?callId=${encodeURIComponent(currentCallId)}`);
      if (!response.ok) return;

      const data: AmmoItem[] = await response.json();
      const sorted = data.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
      sorted.forEach(item => seenAmmoIds.current.add(item._id));
      setAmmoItems(sorted);
    } catch (error) {
      console.error('[Panel] Failed to fetch ammo:', error);
    }
  }, []);

  // Fetch transcript segments from Convex
  const fetchTranscript = useCallback(async (currentCallId: string) => {
    try {
      const response = await fetch(`${CONVEX_SITE_URL}/getTranscriptSegments?callId=${encodeURIComponent(currentCallId)}`);
      if (!response.ok) return;

      const data: TranscriptSegment[] = await response.json();
      data.forEach(seg => seenSegmentIds.current.add(seg._id));
      setTranscriptSegments(data);
    } catch (error) {
      console.error('[Panel] Failed to fetch transcript:', error);
    }
  }, []);

  // Fetch notes from Convex
  const fetchNotes = useCallback(async (currentCallId: string) => {
    try {
      const notesData = await window.ammoTracker?.getNotes(currentCallId);
      if (notesData) setNotes(notesData);
    } catch (error) {
      console.error('[Panel] Failed to fetch notes:', error);
    }
  }, []);

  // Fetch nudges from Convex
  const fetchNudges = useCallback(async (currentCallId: string) => {
    try {
      const response = await fetch(`${CONVEX_SITE_URL}/getNudgesByCall?callId=${encodeURIComponent(currentCallId)}`);
      if (!response.ok) return;

      const data: Nudge[] = await response.json();
      // Update nudges, keeping local state for ones we've already seen
      setNudges(prevNudges => {
        const existingMap = new Map(prevNudges.map(n => [n._id, n]));
        return data.map(nudge => {
          const existing = existingMap.get(nudge._id);
          // If we have a local status change that's different from server, keep local
          if (existing && existing.status !== 'active' && nudge.status === 'active') {
            return existing;
          }
          seenNudgeIds.current.add(nudge._id);
          return nudge;
        }).sort((a, b) => b.createdAt - a.createdAt);
      });
    } catch (error) {
      console.error('[Panel] Failed to fetch nudges:', error);
    }
  }, []);

  // Save a nudge
  const handleSaveNudge = useCallback(async (nudgeId: string) => {
    // Optimistic update
    setNudges(prev => prev.map(n => n._id === nudgeId ? { ...n, status: 'saved' as const } : n));

    try {
      await fetch(`${CONVEX_SITE_URL}/updateNudgeStatus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nudgeId, status: 'saved' }),
      });
    } catch (error) {
      console.error('[Panel] Failed to save nudge:', error);
      // Revert on failure
      setNudges(prev => prev.map(n => n._id === nudgeId ? { ...n, status: 'active' as const } : n));
    }
  }, []);

  // Dismiss a nudge
  const handleDismissNudge = useCallback(async (nudgeId: string) => {
    // Optimistic update
    setNudges(prev => prev.map(n => n._id === nudgeId ? { ...n, status: 'dismissed' as const } : n));

    try {
      await fetch(`${CONVEX_SITE_URL}/updateNudgeStatus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nudgeId, status: 'dismissed' }),
      });
    } catch (error) {
      console.error('[Panel] Failed to dismiss nudge:', error);
      // Revert on failure
      setNudges(prev => prev.map(n => n._id === nudgeId ? { ...n, status: 'active' as const } : n));
    }
  }, []);

  // Save notes to Convex
  const saveNotes = useCallback(async (currentCallId: string, currentNotes: string) => {
    if (!currentCallId) return;
    setIsSavingNotes(true);
    try {
      const result = await window.ammoTracker?.saveNotes(currentCallId, currentNotes);
      if (result?.success) setLastSaved(new Date());
    } catch (error) {
      console.error('[Panel] Failed to save notes:', error);
    }
    setIsSavingNotes(false);
  }, []);

  // Handle notes change with debounced auto-save
  const handleNotesChange = useCallback((newNotes: string) => {
    setNotes(newNotes);
    if (notesTimeoutRef.current) clearTimeout(notesTimeoutRef.current);
    if (callId) {
      notesTimeoutRef.current = setTimeout(() => saveNotes(callId, newNotes), NOTES_SAVE_DELAY);
    }
  }, [callId, saveNotes]);

  // Speaker mapping handlers
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
        setSpeakerMapping(prev => prev ? {
          closerSpeaker: prev.closerSpeaker === 'speaker_0' ? 'speaker_1' : 'speaker_0',
          confirmed: true,
        } : null);
      }
    } catch (error) {
      console.error('[Panel] Failed to swap speaker mapping:', error);
    }
    setIsSwapping(false);
  }, [callId]);

  const handleConfirmSpeaker = useCallback(async () => {
    if (!callId) return;
    setIsSwapping(true);
    try {
      const response = await fetch(`${CONVEX_SITE_URL}/confirmSpeakerMapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      });
      if (response.ok) setSpeakerMapping(prev => prev ? { ...prev, confirmed: true } : null);
    } catch (error) {
      console.error('[Panel] Failed to confirm speaker mapping:', error);
    }
    setIsSwapping(false);
  }, [callId]);

  // Copy to clipboard
  const handleCopy = useCallback(async (text: string) => {
    if (window.ammoTracker) {
      await window.ammoTracker.copyToClipboard(text);
    } else {
      navigator.clipboard.writeText(text);
    }
  }, []);

  // Initialize and set up listeners
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    const init = async () => {
      if (!window.ammoTracker) {
        console.error('[Panel] ammoTracker API not available');
        setIsLoading(false);
        return;
      }

      const initialCallId = await window.ammoTracker.getCallId();
      console.log('[Panel] Initial callId:', initialCallId);
      setCallId(initialCallId);

      if (initialCallId) {
        fetchAmmo(initialCallId);
        fetchTranscript(initialCallId);
        fetchNotes(initialCallId);
        fetchNudges(initialCallId);
        fetchCallInfo(initialCallId);
        pollInterval = setInterval(() => {
          fetchAmmo(initialCallId);
          fetchTranscript(initialCallId);
          fetchNudges(initialCallId);
          fetchCallInfo(initialCallId);
        }, POLL_INTERVAL);
      }

      setIsLoading(false);

      const unsubCallId = window.ammoTracker.onCallIdChange((newCallId) => {
        console.log('[Panel] Call ID changed:', newCallId);
        setCallId(newCallId);
        seenAmmoIds.current.clear();
        seenSegmentIds.current.clear();
        seenNudgeIds.current.clear();
        setAmmoItems([]);
        setTranscriptSegments([]);
        setNudges([]);
        // DON'T clear notes when call ends - keep them visible for user to review
        // Only clear notes when a NEW call starts
        if (newCallId) {
          setNotes('');
          setIsAmmoRevealed(false); // Reset reveal state for new call
        }
        setLastSaved(null);
        setSpeakerMapping(null);
        setCloserSnippet(undefined);

        if (pollInterval) clearInterval(pollInterval);

        if (newCallId) {
          fetchAmmo(newCallId);
          fetchTranscript(newCallId);
          fetchNotes(newCallId);
          fetchNudges(newCallId);
          fetchCallInfo(newCallId);
          pollInterval = setInterval(() => {
            fetchAmmo(newCallId);
            fetchTranscript(newCallId);
            fetchNudges(newCallId);
            fetchCallInfo(newCallId);
          }, POLL_INTERVAL);
        }
      });

      const unsubNewAmmo = window.ammoTracker.onNewAmmo((newAmmo) => {
        console.log('[Panel] New ammo received:', newAmmo);
        setAmmoItems(prev => {
          if (prev.some(item => item._id === newAmmo._id)) return prev;
          seenAmmoIds.current.add(newAmmo._id);
          return [newAmmo, ...prev].slice(0, 10);
        });
      });

      const unsubNewTranscript = window.ammoTracker.onNewTranscript((segment) => {
        console.log('[Panel] New transcript received:', segment);
        setTranscriptSegments(prev => {
          if (prev.some(s => s._id === segment._id)) return prev;
          seenSegmentIds.current.add(segment._id);
          return [...prev, segment];
        });
      });

      return () => {
        unsubCallId();
        unsubNewAmmo();
        unsubNewTranscript();
        if (pollInterval) clearInterval(pollInterval);
      };
    };

    init();

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (notesTimeoutRef.current) clearTimeout(notesTimeoutRef.current);
    };
  }, [fetchAmmo, fetchTranscript, fetchNotes, fetchNudges, fetchCallInfo]);

  // Save notes before closing
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (callId && notes && notesTimeoutRef.current) {
        clearTimeout(notesTimeoutRef.current);
        saveNotes(callId, notes);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [callId, notes, saveNotes]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-white text-gray-900 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-white text-gray-900 overflow-hidden flex flex-col shadow-xl rounded-lg">
      {/* Header with tabs */}
      <div
        className="h-10 flex items-center justify-between px-2 border-b border-gray-200 shrink-0 bg-gray-50/50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <TabButton
            active={activeTab === 'ammo'}
            onClick={() => setActiveTab('ammo')}
            icon={<AmmoIcon active={activeTab === 'ammo'} />}
            label="Ammo"
            badge={
              isAmmoRevealed
                ? ammoItems.filter(i => i.isHeavyHitter).length || undefined
                : ammoItems.length > 0 ? ammoItems.length : undefined
            }
          />
          <TabButton
            active={activeTab === 'nudges'}
            onClick={() => setActiveTab('nudges')}
            icon={<NudgesIcon active={activeTab === 'nudges'} />}
            label="Nudges"
            badge={nudges.filter(n => n.status === 'active').length || undefined}
          />
          <TabButton
            active={activeTab === 'transcript'}
            onClick={() => setActiveTab('transcript')}
            icon={<TranscriptIcon active={activeTab === 'transcript'} />}
            label="Transcript"
          />
          <TabButton
            active={activeTab === 'notes'}
            onClick={() => setActiveTab('notes')}
            icon={<NotesIcon active={activeTab === 'notes'} />}
            label="Notes"
          />
        </div>

        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <span className={`w-2 h-2 rounded-full transition-colors duration-150 ${callId ? 'bg-green-500' : 'bg-gray-300'}`} />
          <button
            onClick={() => window.ammoTracker?.close()}
            className="w-5 h-5 rounded hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors duration-150"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Speaker identification banner (only show on Ammo tab) */}
      {activeTab === 'ammo' && callId && speakerMapping && !speakerMapping.confirmed && (
        <SpeakerIdentificationBanner
          speakerMapping={speakerMapping}
          closerSnippet={closerSnippet}
          onSwap={handleSwapSpeaker}
          onConfirm={handleConfirmSpeaker}
          isSwapping={isSwapping}
        />
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden bg-gray-50/30">
        {activeTab === 'ammo' && (
          <div className="h-full overflow-y-auto scrollbar-thin">
            <AmmoTab
              callId={callId}
              ammoItems={ammoItems}
              onCopy={handleCopy}
              isRevealed={isAmmoRevealed}
              onReveal={() => setIsAmmoRevealed(true)}
            />
          </div>
        )}
        {activeTab === 'nudges' && (
          <div className="h-full overflow-y-auto scrollbar-thin">
            <NudgesTab
              callId={callId}
              nudges={nudges}
              onSaveNudge={handleSaveNudge}
              onDismissNudge={handleDismissNudge}
            />
          </div>
        )}
        {activeTab === 'transcript' && (
          <TranscriptTab callId={callId} segments={transcriptSegments} />
        )}
        {activeTab === 'notes' && (
          <NotesTab
            callId={callId}
            notes={notes}
            onNotesChange={handleNotesChange}
            isSaving={isSavingNotes}
            lastSaved={lastSaved}
          />
        )}
      </div>
    </div>
  );
}
