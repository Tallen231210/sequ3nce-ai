"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useAuth } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

function DesktopAuthCallbackContent() {
  const { isSignedIn, isLoaded } = useAuth();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [error, setError] = useState<string | null>(null);

  const redirectUrl = searchParams.get("redirect") || "sequ3nce://auth-callback";
  const email = searchParams.get("email") || "";

  const redirectToApp = useCallback(() => {
    // Generate a verification token
    const token = `verified_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Redirect to the desktop app
    setTimeout(() => {
      window.location.href = `${redirectUrl}?token=${token}&email=${encodeURIComponent(email)}`;
    }, 1500);
  }, [redirectUrl, email]);

  useEffect(() => {
    // Wait for Clerk to load
    if (!isLoaded) return;

    // If user is signed in, redirect to desktop app
    if (isSignedIn) {
      setStatus("success");
      redirectToApp();
      return;
    }

    // If not signed in after Clerk loaded, show error
    // The magic link verification is handled automatically by Clerk
    // If we reach here without being signed in, something went wrong
    const timer = setTimeout(() => {
      if (!isSignedIn) {
        setError("Sign in failed. Please try the magic link again or request a new one.");
        setStatus("error");
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [isSignedIn, isLoaded, redirectToApp]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">Sequ3nce</h1>
          <p className="text-gray-500">Desktop App Login</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
          {/* Verifying */}
          {status === "verifying" && (
            <>
              <div className="w-16 h-16 border-4 border-gray-200 border-t-black rounded-full animate-spin mx-auto mb-6" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Verifying your login...
              </h2>
              <p className="text-gray-500 text-sm">
                Please wait while we sign you in.
              </p>
            </>
          )}

          {/* Success */}
          {status === "success" && (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                You're signed in!
              </h2>
              <p className="text-gray-500 text-sm mb-6">
                Redirecting you back to the Sequ3nce app...
              </p>
              <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin mx-auto" />
            </>
          )}

          {/* Error */}
          {status === "error" && (
            <>
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Verification failed
              </h2>
              <p className="text-gray-500 text-sm mb-8">{error}</p>
              <a
                href={`/desktop-auth?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectUrl)}`}
                className="inline-block w-full py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors text-center"
              >
                Try again
              </a>
            </>
          )}
        </div>

        {/* Manual redirect fallback */}
        {status === "success" && (
          <p className="text-xs text-gray-400 text-center mt-6">
            Not redirected automatically?{" "}
            <a
              href={`${redirectUrl}?token=verified&email=${encodeURIComponent(email)}`}
              className="underline"
            >
              Click here
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">Sequ3nce</h1>
          <p className="text-gray-500">Desktop App Login</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 border-4 border-gray-200 border-t-black rounded-full animate-spin mx-auto mb-6" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Loading...
          </h2>
        </div>
      </div>
    </div>
  );
}

export default function DesktopAuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <DesktopAuthCallbackContent />
    </Suspense>
  );
}
