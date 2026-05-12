"use client";

import { AlertCircle } from "lucide-react";

interface ErrorBannerProps {
  message: string;
}

/**
 * Top-of-page persistent banner for connection-level errors (token refresh
 * failed, scope rejected, etc). Stays on every tab so the manager can't
 * miss it. The Reconnect button itself lives in the Settings tab —
 * keeping this banner read-only avoids duplicating the install flow in
 * two places.
 */
export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <span className="font-medium">GoHighLevel connection issue.</span>{" "}
        <span className="opacity-90">{message}</span>{" "}
        <span className="opacity-75">Reconnect from the Settings tab.</span>
      </div>
    </div>
  );
}
