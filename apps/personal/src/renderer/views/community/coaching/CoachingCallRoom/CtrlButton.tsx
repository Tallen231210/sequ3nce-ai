import React, { useEffect, useState } from 'react';
import { useParticipantIds } from '@daily-co/daily-react';
import { Icon, type IconName } from './Icon';
import logoImage from '../../../../../assets/logo.png';

// ==================== Connecting / Empty-state helpers ====================

export function ConnectingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5">
      <img
        src={logoImage}
        alt="Sequ3nce"
        className="h-18 w-auto opacity-70 animate-pulse [filter:invert(1)_contrast(1.1)_brightness(1.1)]"
      />
      <span className="text-[12px] font-mono uppercase tracking-[0.15em] text-white/50">
        Connecting
      </span>
    </div>
  );
}

// ==================== Sub-components ====================

// Mic / cam / screen-share control. `active` = "needs user attention" state
// (mic muted, camera off, screen-sharing on). Active uses red accent so
// the eye catches what's in a non-default state.
export function CtrlButton({
  active,
  onClick,
  iconName,
  label,
  disabled,
  disabledTitle,
}: {
  active: boolean;
  onClick: () => void;
  iconName: IconName;
  label: string;
  disabled?: boolean;
  /** Tooltip shown when disabled. Explains why the action is unavailable. */
  disabledTitle?: string;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex items-center gap-2 px-3.5 py-2 text-[12.5px] font-medium rounded-lg transition-colors ${
        disabled
          ? 'bg-white/5 text-white/30 cursor-not-allowed'
          : active
          ? 'bg-red-600/90 text-white hover:bg-red-600'
          : 'bg-white/5 text-white/90 hover:bg-white/10'
      }`}
      title={disabled ? (disabledTitle ?? label) : label}
    >
      <Icon name={iconName} className="w-4 h-4" />
      {label}
    </button>
  );
}

export function LiveDurationPill({ startMs }: { startMs: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  const diffSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const mm = String(Math.floor(diffSec / 60)).padStart(2, '0');
  const ss = String(diffSec % 60).padStart(2, '0');
  const hours = Math.floor(diffSec / 3600);
  const hh = String(hours).padStart(2, '0');
  const label = hours > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
  return (
    <span className="text-[12px] font-mono text-white/70 tabular-nums">
      {label}
    </span>
  );
}

export function ParticipantCountPill() {
  const ids = useParticipantIds();
  return (
    <span className="text-[11px] font-mono uppercase tracking-wider text-white/50">
      {ids.length} {ids.length === 1 ? 'person' : 'people'}
    </span>
  );
}

// ==================== View mode toggle ====================

export function ViewModeToggle({
  value,
  onChange,
}: {
  value: 'speaker' | 'gallery';
  onChange: (v: 'speaker' | 'gallery') => void;
}) {
  return (
    <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10">
      <button
        onClick={() => onChange('speaker')}
        aria-label="Speaker view"
        title="Speaker view"
        className={`p-1.5 rounded-md transition-colors ${
          value === 'speaker' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
        }`}
      >
        <Icon name="speaker" className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onChange('gallery')}
        aria-label="Gallery view"
        title="Gallery view"
        className={`p-1.5 rounded-md transition-colors ${
          value === 'gallery' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
        }`}
      >
        <Icon name="grid" className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
