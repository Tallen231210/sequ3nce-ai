"use client";

// ============================================================================
// One-time "we're Google-verified — reconnect your calendar" prompt.
//
// Google approved our OAuth verification on 2026-08-24. Refresh tokens minted
// BEFORE approval can carry the unverified-app ~7-day expiry and die without
// warning; a reconnect mints a permanent token. The gate self-clears: every
// successful connect overwrites calendarConnectedAt, so anyone who reconnects
// (from here, Settings, or setup) stops matching. Dismissal is per-session on
// purpose — the prompt returns on the next app open until they actually
// reconnect, because a snoozed prompt and a dead calendar is the worst combo.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { getCalendarStatus } from "@/lib/closer/client";
import type { CloserInfo } from "@/lib/closer/session";

// Connections made after this moment already have permanent tokens. Set to
// the feature's ship date (later than the approval itself) so nobody with a
// possibly-expiring token slips through; the cost is a harmless extra
// reconnect for the few who connected in the gap.
export const GOOGLE_VERIFIED_CUTOFF = 1787788800000; // 2026-08-27T00:00:00Z

const DISMISS_KEY = "google-reconnect-dismissed";

export function GoogleReconnectModal({ closerInfo }: { closerInfo: CloserInfo }) {
  const [show, setShow] = useState(false);

  const check = useCallback(async () => {
    const status = await getCalendarStatus(closerInfo.email, closerInfo.teamId);
    const needsReconnect =
      !!status?.connected &&
      status.provider === "google" &&
      (status.connectedAt ?? 0) < GOOGLE_VERIFIED_CUTOFF;
    setShow(needsReconnect);
  }, [closerInfo.email, closerInfo.teamId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(DISMISS_KEY)) return;
    void check();
  }, [check]);

  // The reconnect happens in another tab; when they come back, re-check so
  // the modal disappears on its own instead of lingering until a reload.
  useEffect(() => {
    if (!show) return;
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [show, check]);

  if (!show) return null;

  const dismiss = () => {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-reconnect-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <Logo height={22} />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" />
            Verified by Google
          </span>
        </div>
        <h2 id="google-reconnect-title" className="mt-5 text-lg font-semibold">
          Sequ3nce is now Google-verified
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Google has completed its security review and officially verified
          Sequ3nce. One quick thing on your end: reconnect your Google Calendar
          to upgrade to a permanent verified connection — it takes about 20
          seconds, and you&apos;ll never see a Google warning screen again.
          Your calendars, settings, and history stay exactly as they are.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <a
            href={`https://sequ3nce.ai/api/auth/google/authorize?closerId=${closerInfo.closerId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            Reconnect Google Calendar
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
