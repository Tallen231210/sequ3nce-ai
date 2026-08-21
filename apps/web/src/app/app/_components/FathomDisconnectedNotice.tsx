"use client";

// ============================================================================
// One-time notice for a closer whose personal Fathom connection was removed
// because their team's plan doesn't include it. Without this the card just
// disappears from Settings and the disconnect reads as a mystery bug.
// ============================================================================

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getFathomStatus } from "@/lib/closer/fathom";

const DISMISS_KEY = "fathom-disconnected-notice-dismissed";

export function FathomDisconnectedNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY)) return;
    let mounted = true;
    void getFathomStatus().then((status) => {
      if (mounted && status?.disconnectedByPlan) setShow(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!show) return null;

  return (
    <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-6">
      <div className="min-w-0">
        <span className="font-semibold">Fathom has been disconnected.</span>{" "}
        Your team&apos;s plan doesn&apos;t include Fathom — your calls are
        recorded automatically by the Sequ3nce bot instead. When it asks to
        join a meeting, let it in and everything else is handled.
      </div>
      <button
        onClick={() => {
          window.localStorage.setItem(DISMISS_KEY, "1");
          setShow(false);
        }}
        aria-label="Dismiss"
        className="ml-auto shrink-0 rounded p-1 text-amber-700 transition-colors hover:bg-amber-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
