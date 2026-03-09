import React, { useState } from 'react';
import { EMOJI_MAP, ReactionPicker } from './ReactionPicker';

interface ReactionPillsProps {
  reactionCounts: Record<string, number>;
  myReactions: string[];
  onReact: (emoji: string) => void;
  onUnreact: (emoji: string) => void;
}

export function ReactionPills({ reactionCounts, myReactions, onReact, onUnreact }: ReactionPillsProps) {
  const [showPicker, setShowPicker] = useState(false);

  const entries = Object.entries(reactionCounts).filter(([, count]) => count > 0);
  if (entries.length === 0 && !showPicker) {
    return null;
  }

  const handleToggle = (emoji: string) => {
    if (myReactions.includes(emoji)) {
      onUnreact(emoji);
    } else {
      onReact(emoji);
    }
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {entries.map(([emoji, count]) => {
        const isMine = myReactions.includes(emoji);
        const symbol = EMOJI_MAP[emoji] ?? emoji;
        return (
          <button
            key={emoji}
            onClick={() => handleToggle(emoji)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
              isMine
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 border border-transparent hover:border-gray-300 dark:hover:border-zinc-500'
            }`}
          >
            <span>{symbol}</span>
            <span>{count}</span>
          </button>
        );
      })}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-700 text-gray-400 dark:text-zinc-500 hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors text-xs"
        >
          +
        </button>
        {showPicker && (
          <div className="absolute bottom-full left-0 mb-1">
            <ReactionPicker
              onSelect={(emoji) => {
                if (myReactions.includes(emoji)) {
                  onUnreact(emoji);
                } else {
                  onReact(emoji);
                }
              }}
              onClose={() => setShowPicker(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
