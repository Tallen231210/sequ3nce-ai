import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import type { ChatMessage } from './types';
import logoImage from '../../../../../assets/logo.png';

// Pure view: messages are owned by the parent so closing/reopening the panel
// doesn't lose history, and the app-message listener likewise lives in the
// parent (stays mounted while the overlay is open).
export function ChatPanel({
  messages,
  onSend,
}: {
  messages: ChatMessage[];
  onSend: (body: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function send() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setDraft('');
  }

  return (
    <div className="w-[320px] shrink-0 border-l border-white/10 flex flex-col">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/50">
          Chat
        </span>
        <img
          src={logoImage}
          alt="Sequ3nce"
          className="h-6 w-auto opacity-60 [filter:invert(1)_contrast(1.1)_brightness(1.1)]"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-[11px] text-white/40 text-center pt-6 font-mono">
            No messages yet
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id}>
              <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-0.5">
                {m.from}
              </div>
              <div className="text-[13px] text-white/90 leading-snug whitespace-pre-wrap break-words">
                {m.body}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <div className="px-3 py-3 border-t border-white/10">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a message…"
            className="flex-1 px-3 py-2 text-[12.5px] bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-white/30"
          />
          <button
            onClick={send}
            disabled={!draft.trim()}
            aria-label="Send message"
            title="Send message"
            className="p-2 bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Icon name="send" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
