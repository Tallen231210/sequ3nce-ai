"use client";

// ============================================================================
// Manager-mode counterpart of the closer app's Google reconnect prompt.
//
// Google verified our OAuth app on 2026-08-24; manager calendar tokens minted
// before then can still expire on the unverified ~7-day cycle. Reconnecting
// mints a permanent token WITHOUT touching Disconnect (which deletes synced
// manager events). completeManagerCalendarConnect overwrites
// calendarConnectedAt, and getManagerCalendarState is reactive, so the modal
// clears itself the moment the OAuth round-trip lands.
// ============================================================================

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { BadgeCheck, Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Logo } from "@/components/ui/logo";

// Keep in lockstep with GOOGLE_VERIFIED_CUTOFF in the closer app's
// GoogleReconnectModal — same campaign, same cutoff.
const GOOGLE_VERIFIED_CUTOFF = 1787788800000; // 2026-08-27T00:00:00Z

const DISMISS_KEY = "mgr-google-reconnect-dismissed";

export function GoogleReconnectModal() {
  const { user } = useUser();
  const clerkId = user?.id;
  const state = useQuery(
    api.managerCalendar.getManagerCalendarState,
    clerkId ? { clerkId } : "skip",
  );
  const startConnect = useMutation(api.managerCalendar.startManagerCalendarConnect);
  const [dismissed, setDismissed] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.sessionStorage.getItem(DISMISS_KEY),
  );
  const [busy, setBusy] = useState(false);

  const needsReconnect =
    !!state?.connected && (state.connectedAt ?? 0) < GOOGLE_VERIFIED_CUTOFF;

  if (!needsReconnect || dismissed) return null;

  const reconnect = async () => {
    if (!clerkId) return;
    setBusy(true);
    try {
      const { nonce } = await startConnect({ clerkId });
      window.location.href = `/api/auth/google/authorize?managerNonce=${nonce}`;
    } catch {
      setBusy(false);
    }
  };

  const dismiss = () => {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mgr-google-reconnect-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <Logo height={22} />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" />
            Verified by Google
          </span>
        </div>
        <h2 id="mgr-google-reconnect-title" className="mt-5 text-lg font-semibold">
          Sequ3nce is now Google-verified
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Google has completed its security review and officially verified
          Sequ3nce. One quick thing on your end: reconnect the Google Calendar
          behind Manager Mode to upgrade to a permanent verified connection —
          about 20 seconds, and you&apos;ll never see a Google warning screen
          again. Your meetings, settings, and history stay exactly as they are.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void reconnect()}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Reconnect Google Calendar
          </button>
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
