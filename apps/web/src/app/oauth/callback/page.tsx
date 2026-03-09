"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { Logo } from "@/components/ui/logo";

function CallbackContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success") === "true";
  const provider = searchParams.get("provider") || "google";
  const closerId = searchParams.get("closerId");
  const error = searchParams.get("error");
  const app = searchParams.get("app");

  const protocol = app === "personal" ? "sequ3nce-personal" : "sequ3nce";

  const [deepLinkAttempted, setDeepLinkAttempted] = useState(false);

  // Auto-attempt deep link back to desktop app on success
  useEffect(() => {
    if (success && closerId && !deepLinkAttempted) {
      setDeepLinkAttempted(true);
      const timeout = setTimeout(() => {
        window.location.href = `${protocol}://calendar-connected?closerId=${closerId}`;
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [success, closerId, deepLinkAttempted, protocol]);

  const providerName = provider === "microsoft" ? "Microsoft Calendar" : "Google Calendar";

  const errorMessages: Record<string, string> = {
    access_denied: "You denied calendar access. Please try again if this was a mistake.",
    missing_params: "Something went wrong with the authorization flow. Please try again.",
    token_exchange_failed: "Failed to complete the authorization. Please try again.",
    no_refresh_token: "Authorization failed. Please try connecting again.",
    server_config: "Server configuration error. Please contact support.",
    server_error: "An unexpected error occurred. Please try again.",
  };

  if (success) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-5 max-w-sm px-6">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">
              {providerName} Connected
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Your calendar has been connected. You can close this tab and return to the app.
            </p>
          </div>
          <button
            onClick={() => {
              window.location.href = `${protocol}://calendar-connected?closerId=${closerId}`;
            }}
            className="w-full px-4 py-2.5 text-sm font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            {app === "personal" ? "Return to Sequ3nce Personal" : "Return to Sequ3nce"}
          </button>
          <p className="text-xs text-zinc-400">
            If the app didn&apos;t open automatically, click the button above.
          </p>
          <div className="pt-2">
            <Logo height={20} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center space-y-5 max-w-sm px-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <svg
            className="w-8 h-8 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">
            Connection Failed
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {errorMessages[error || ""] || "Something went wrong connecting your calendar."}
          </p>
        </div>
        {closerId && (
          <a
            href={`/api/auth/google/authorize?closerId=${closerId}${app ? `&app=${app}` : ""}`}
            className="block w-full px-4 py-2.5 text-sm font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors text-center"
          >
            Try Again
          </a>
        )}
        <div className="pt-2">
          <Logo height={20} />
        </div>
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
