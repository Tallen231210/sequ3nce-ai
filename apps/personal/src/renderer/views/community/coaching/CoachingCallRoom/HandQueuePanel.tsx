import React from 'react';
import { Icon } from './Icon';

export function HandQueuePanel({
  raisedHands,
  onCallOn,
  onDismiss,
}: {
  raisedHands: Record<string, { sessionId: string; userName: string; at: number }>;
  onCallOn: (sessionId: string) => void;
  onDismiss: (sessionId: string) => void;
}) {
  // Sort by raise time — earliest first (FIFO queue).
  const entries = Object.values(raisedHands).sort((a, b) => a.at - b.at);

  return (
    <div className="w-[320px] shrink-0 border-l border-white/10 flex flex-col">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/50">
          Raised hands
        </span>
        <span className="text-[10px] font-mono text-white/40">
          {entries.length} waiting
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {entries.length === 0 ? (
          <div className="text-[11px] text-white/40 text-center pt-6 font-mono">
            No hands up
          </div>
        ) : (
          entries.map((h) => (
            <div
              key={h.sessionId}
              className="p-3 rounded-lg border border-white/10 bg-white/[0.02]"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon name="hand" className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[13px] font-medium text-white truncate">{h.userName}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onCallOn(h.sessionId)}
                  className="flex-1 px-2 py-1 text-[11px] font-semibold bg-white text-black rounded-md hover:bg-white/90 transition-colors"
                >
                  Call on
                </button>
                <button
                  onClick={() => onDismiss(h.sessionId)}
                  className="px-2 py-1 text-[11px] font-medium bg-white/5 text-white/70 rounded-md hover:bg-white/10 transition-colors"
                  title="Remove from queue (does not signal the attendee)"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
