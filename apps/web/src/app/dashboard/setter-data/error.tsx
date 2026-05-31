"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Next.js route error boundary. Catches client-side render errors that
// would otherwise show as "Application error: a client-side exception."
// We surface the actual error text so users can screenshot it for
// support instead of having to open DevTools.
export default function SetterDataError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[setter-data] Render error:", error);
  }, [error]);

  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-2xl rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-lg font-semibold text-destructive">
          Setter Data couldn&apos;t load
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Something failed while rendering this tab. Screenshot the error
          details below and send them to team@sequ3nce.ai.
        </p>
        <div className="mt-4 rounded-md border border-border bg-background p-3 font-mono text-xs">
          <div className="font-semibold">{error.name}: {error.message}</div>
          {error.digest && (
            <div className="mt-1 text-muted-foreground">
              digest: {error.digest}
            </div>
          )}
          {error.stack && (
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-snug text-muted-foreground">
              {error.stack}
            </pre>
          )}
        </div>
        <Button onClick={reset} className="mt-4" variant="outline" size="sm">
          Try again
        </Button>
      </div>
    </div>
  );
}
