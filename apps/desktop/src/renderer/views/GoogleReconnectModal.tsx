import React, { useCallback, useEffect, useState } from 'react';
import { getCalendarStatus, type CloserInfo } from '../convex';
import logoImage from '../../assets/logo.png';

// ============================================================================
// One-time "we're Google-verified — reconnect your calendar" prompt.
//
// Google approved our OAuth verification on 2026-08-24. Refresh tokens minted
// BEFORE approval can carry the unverified-app ~7-day expiry and die without
// warning; a reconnect mints a permanent token. The gate self-clears: every
// successful connect overwrites calendarConnectedAt, so anyone who reconnects
// (from here, Settings, or onboarding) stops matching. Dismissal is
// per-session on purpose — the prompt returns on next launch until they
// actually reconnect. Mirrors the closer web app's GoogleReconnectModal.
// ============================================================================

// Connections made after this moment already have permanent tokens. Keep in
// lockstep with the web app's GOOGLE_VERIFIED_CUTOFF.
const GOOGLE_VERIFIED_CUTOFF = 1787788800000; // 2026-08-27T00:00:00Z

const DISMISS_KEY = 'google-reconnect-dismissed';

export function GoogleReconnectModal({ closerInfo }: { closerInfo: CloserInfo }) {
  const [show, setShow] = useState(false);

  const check = useCallback(async () => {
    const status = await getCalendarStatus(closerInfo.email, closerInfo.teamId);
    const needsReconnect =
      !!status?.connected &&
      status.provider === 'google' &&
      (status.connectedAt ?? 0) < GOOGLE_VERIFIED_CUTOFF;
    setShow(needsReconnect);
  }, [closerInfo.email, closerInfo.teamId]);

  useEffect(() => {
    if (window.sessionStorage.getItem(DISMISS_KEY)) return;
    void check();
  }, [check]);

  // The reconnect happens in the browser; when the window regains focus,
  // re-check so the modal clears itself without a restart.
  useEffect(() => {
    if (!show) return;
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [show, check]);

  if (!show) return null;

  const dismiss = () => {
    window.sessionStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <img src={logoImage} alt="Sequ3nce" className="h-6 dark-invert" />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            Verified by Google
          </span>
        </div>
        <h2 className="mt-5 text-lg font-semibold text-gray-900">
          Sequ3nce is now Google-verified
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
          Google has completed its security review and officially verified
          Sequ3nce. One quick thing on your end: reconnect your Google Calendar
          to upgrade to a permanent verified connection — it takes about 20
          seconds, and you&apos;ll never see a Google warning screen again.
          Your calendars, settings, and history stay exactly as they are.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const authUrl = `https://sequ3nce.ai/api/auth/google/authorize?closerId=${closerInfo.closerId}`;
              window.open(authUrl, '_blank');
            }}
            className="flex-1 rounded-lg bg-black px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-gray-800"
          >
            Reconnect Google Calendar
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-4 py-2.5 text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
