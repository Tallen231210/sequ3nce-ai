"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { PostCallQuestionnaire } from "./PostCallQuestionnaire";
import type { CloserInfo } from "@/lib/closer/client";

/**
 * The post-call form, as a dialog.
 *
 * On desktop this was a separate always-on-top window, which made sense when
 * the app was six windows. On the web it overlays the page the closer is
 * already on, so they keep their place in the call list behind it.
 *
 * Behaviour is otherwise identical to the desktop form — this is a straight
 * port, not the end-of-day redesign, which is a lower-tier concern.
 */
export function PostCallModal({
  closerInfo,
  callId,
  prospectName,
  onClose,
}: {
  closerInfo: CloserInfo;
  callId: string;
  prospectName?: string;
  onClose: () => void;
}) {
  // Escape closes, and the page behind must not scroll under the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Post-call summary"
      // Clicking the backdrop closes; clicking the form must not.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
        <PostCallQuestionnaire
          closerInfo={closerInfo}
          callId={callId}
          initialProspectName={prospectName}
          onComplete={onClose}
        />
      </div>
    </div>
  );
}
