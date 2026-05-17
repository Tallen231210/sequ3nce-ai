"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Global error boundary — catches anything that escapes nested error.tsx
// boundaries, including errors in the root layout and providers. Must
// render its own <html> and <body> since it replaces the root layout
// when active.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
    // Forward to Sentry so we see it in the dashboard with full
    // stack + breadcrumbs, not just in our local UI fallback.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ margin: 0, padding: "48px 24px", fontFamily: "system-ui, sans-serif", background: "#fff", color: "#0a0a0a" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#b91c1c", marginBottom: 8 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 14, color: "#525252", marginBottom: 24 }}>
            Screenshot the error details below and send them to
            support@sequ3nce.ai.
          </p>
          <div style={{ background: "#fafafa", border: "1px solid #e5e5e5", borderRadius: 8, padding: 16, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {error.name}: {error.message}
            </div>
            {error.digest && (
              <div style={{ color: "#737373", marginBottom: 8 }}>
                digest: {error.digest}
              </div>
            )}
            {error.stack && (
              <pre style={{ margin: 0, maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 10, color: "#525252" }}>
                {error.stack}
              </pre>
            )}
          </div>
          <button
            onClick={reset}
            style={{ marginTop: 16, padding: "8px 16px", fontSize: 14, fontWeight: 500, background: "#0a0a0a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
