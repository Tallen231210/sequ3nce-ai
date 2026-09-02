import React, { useEffect, useState } from 'react';
import { getAutoJoinState, setAutoJoin, type AutoJoinState } from '../autoJoinApi';

interface AutoJoinPillProps {
  sessionToken: string | undefined;
}

/**
 * Persistent auto-join switch in the Hub titlebar, next to Quick Bot.
 * Same session-token route as the Settings toggle — this is the
 * always-visible handle on it. Renders nothing until state is known, and
 * nothing at all for pre-token sessions (Settings explains the re-login).
 */
export function AutoJoinPill({ sessionToken }: AutoJoinPillProps) {
  const [state, setState] = useState<AutoJoinState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAutoJoinState(sessionToken).then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  if (!state?.ok) return null;

  const enabled = !!state.enabled;
  const warning = enabled && !state.hasLiveCalendar;

  async function handleToggle() {
    if (busy) return;
    setBusy(true);
    const next = await setAutoJoin(sessionToken, !enabled);
    if (next.ok) setState(next);
    setBusy(false);
  }

  return (
    <button
      onClick={handleToggle}
      disabled={busy}
      title={
        warning
          ? 'Auto-join is on, but no calendar is connected — connect one in Settings'
          : enabled
            ? 'Bot joins your scheduled meetings automatically'
            : 'Auto-join is off — the bot only joins calls you send it to'
      }
      className="no-drag flex items-center gap-2 px-3.5 py-2 text-[13px] font-semibold text-gray-900 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-60"
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          warning ? 'bg-amber-500' : enabled ? 'bg-emerald-500' : 'bg-gray-300'
        }`}
      />
      Auto-join
      <span
        className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${
          enabled ? 'bg-black' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
