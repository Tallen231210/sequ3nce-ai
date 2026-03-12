import React from 'react';

const EMOJI_MAP: Record<string, string> = {
  thumbsup: '👍',
  fire: '🔥',
  hundred: '💯',
  clap: '👏',
  laugh: '😂',
  heart: '❤️',
  eyes: '👀',
  mindblown: '🤯',
};

const EMOJI_LIST = Object.entries(EMOJI_MAP);

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionPicker({ onSelect, onClose }: ReactionPickerProps) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg p-1.5 flex gap-0.5">
        {EMOJI_LIST.map(([key, emoji]) => (
          <button
            key={key}
            onClick={() => { onSelect(key); onClose(); }}
            className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={key}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}

export { EMOJI_MAP };
