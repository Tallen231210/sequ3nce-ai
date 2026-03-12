import React from 'react';

interface TypingIndicatorProps {
  names: string[];
}

export function TypingIndicator({ names }: TypingIndicatorProps) {
  if (names.length === 0) return null;

  const text = names.length === 1
    ? `${names[0]} is typing`
    : `${names.join(' and ')} are typing`;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-gray-500 dark:text-gray-400">
      <span className="flex gap-0.5">
        <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
      </span>
      <span>{text}</span>
    </div>
  );
}
