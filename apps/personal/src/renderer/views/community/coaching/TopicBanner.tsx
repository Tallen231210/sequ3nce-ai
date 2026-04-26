import React, { useEffect, useRef, useState } from 'react';

interface TopicBannerProps {
  topic: string;
  isCoach: boolean;
  /** Only invoked when coach clicks Save after editing. */
  onEdit: (newTopic: string) => void;
}

const MAX_TOPIC_LEN = 500;

// Banner shown during an active role play. Displays the role-play topic
// (scenario prompt) at the top of the video area. Coach can edit inline;
// all clients can minimize to a small pill when they want to focus on the
// video. Minimize is local state — each viewer toggles independently.
//
// Unmounts when role play ends (caller's responsibility — render only when
// focusMode.kind === 'role-play' && topic non-empty). Topic text discards
// with the FocusMode state; no persistence.
export function TopicBanner({ topic, isCoach, onEdit }: TopicBannerProps) {
  const [minimized, setMinimized] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(topic);
  const inputRef = useRef<HTMLInputElement>(null);

  // If the topic updates externally (coach edits on their side, broadcast
  // arrives), sync the draft unless the current user is mid-edit themselves.
  useEffect(() => {
    if (!editing) setDraft(topic);
  }, [topic, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="absolute top-4 right-4 z-[30] px-3 py-1.5 rounded-full bg-amber-400/90 text-black text-[11px] font-bold uppercase tracking-wider shadow-lg hover:bg-amber-300 transition-colors flex items-center gap-1.5"
        title="Expand topic"
      >
        <span>Topic</span>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    );
  }

  function saveEdit() {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    onEdit(trimmed);
    setEditing(false);
  }

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[25] w-[min(640px,85%)] rounded-lg bg-amber-500/20 backdrop-blur border border-amber-400/40 shadow-lg">
      <div className="flex items-start gap-3 px-4 py-2.5">
        <div className="flex-shrink-0 pt-0.5">
          <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-amber-200/80 font-bold">
            Topic
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_TOPIC_LEN))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') { setDraft(topic); setEditing(false); }
              }}
              className="w-full px-2 py-1 text-[13px] bg-white/10 border border-white/20 rounded text-white placeholder-white/30 focus:outline-none focus:border-white/40"
            />
          ) : (
            <div className="text-[13px] text-white leading-snug">
              {topic}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center gap-1">
          {isCoach && !editing && (
            <button
              onClick={() => setEditing(true)}
              title="Edit topic"
              aria-label="Edit topic"
              className="p-1 rounded text-amber-200 hover:bg-white/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
            </button>
          )}
          {isCoach && editing && (
            <>
              <button
                onClick={saveEdit}
                className="px-2 py-0.5 text-[10px] font-semibold bg-white text-black rounded hover:bg-white/90"
              >
                Save
              </button>
              <button
                onClick={() => { setDraft(topic); setEditing(false); }}
                className="px-2 py-0.5 text-[10px] font-medium text-white/70 hover:bg-white/10 rounded"
              >
                Cancel
              </button>
            </>
          )}
          {!editing && (
            <button
              onClick={() => setMinimized(true)}
              title="Minimize topic"
              aria-label="Minimize topic"
              className="p-1 rounded text-amber-200 hover:bg-white/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
