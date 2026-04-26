import React, { useEffect, useRef, useState } from 'react';
import { CtrlButton } from './CtrlButton';

const REACTION_EMOJI = ['👏', '❤️', '🔥', '😂', '🎉', '✨'] as const;

export function ReactionButton({ onReact }: { onReact: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={btnRef} className="relative">
      <CtrlButton
        active={open}
        onClick={() => setOpen((v) => !v)}
        iconName="smile"
        label="React"
      />
      {open && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1.5 bg-zinc-900/95 border border-white/10 rounded-lg shadow-xl backdrop-blur">
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onReact(emoji);
                setOpen(false);
              }}
              className="text-xl px-1.5 py-1 rounded-md hover:bg-white/10 transition-colors"
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
