"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

/**
 * /launch — intermediary page that fires the sequ3nce:// deep-link
 * from inside the browser. Email clients (Gmail, Outlook, etc.) strip
 * custom-protocol anchors as a security measure, so the closer-invite
 * email links here with ?email=X&code=Y. We auto-fire the protocol
 * the moment the page loads. If nothing happens (app not installed),
 * we show the fallback UI below.
 */
function LaunchInner() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const code = params.get("code") ?? "";
  const [triedAt, setTriedAt] = useState<number | null>(null);
  // Switches to "Signed in!" view when we detect the user switched
  // away (focus loss / tab hidden) — that's a strong signal the OS
  // routed them to the desktop app. Avoids the "infinite spinner
  // after the app already opened" trap.
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!email || !code) return;
    const protocolUrl = `sequ3nce://auth-callback?email=${encodeURIComponent(
      email,
    )}&code=${encodeURIComponent(code)}`;
    window.location.href = protocolUrl;
    setTriedAt(Date.now());
  }, [email, code]);

  // Success "detection" is imperfect — browsers don't expose a callback
  // when a custom-protocol launch succeeds. Two signals layered:
  //   1) Focus loss / tab hidden = OS routed to the desktop app (fast)
  //   2) 3-second timeout = optimistic fallback (some OS configs return
  //      focus immediately after protocol fires, so we never get signal 1)
  // The fallback options below stay reachable even after we flip to the
  // success view, so an actual failure isn't a dead-end.
  useEffect(() => {
    if (!triedAt) return;
    const onBlurOrHide = () => setSignedIn(true);
    const onVis = () => {
      if (document.visibilityState === "hidden") onBlurOrHide();
    };
    window.addEventListener("blur", onBlurOrHide);
    document.addEventListener("visibilitychange", onVis);
    const t = setTimeout(() => setSignedIn(true), 3000);
    return () => {
      clearTimeout(t);
      window.removeEventListener("blur", onBlurOrHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [triedAt]);

  const missing = !email || !code;
  const protocolHref = `sequ3nce://auth-callback?email=${encodeURIComponent(
    email,
  )}&code=${encodeURIComponent(code)}`;

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Logo href="/" height={28} />
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-16 text-center">
        {signedIn && !missing ? (
          <>
            <div className="mb-6 inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100">
              <svg
                className="w-7 h-7 text-emerald-600"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-3">
              You&apos;re signed in
            </h1>
            <p className="text-gray-600 mb-2">
              Sequ3nce should now be open on your computer.
            </p>
            <p className="text-sm text-gray-500 mb-10">
              You can safely close this tab.
            </p>

            {/* Always-reachable fallback. Browsers can't confirm a custom-
                protocol launch actually opened the app — if the success
                view fired but Sequ3nce isn't open, the user needs these. */}
            <div className="border-t border-gray-200 pt-6 text-left bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-700 mb-2">
                Sequ3nce didn&apos;t open?
              </p>
              <div className="flex flex-col gap-2">
                <a
                  href={protocolHref}
                  className="text-sm text-gray-700 hover:text-black hover:underline"
                >
                  → Try opening Sequ3nce again
                </a>
                <Link
                  href="/download"
                  className="text-sm text-gray-700 hover:text-black hover:underline"
                >
                  → Download Sequ3nce first
                </Link>
              </div>
            </div>
          </>
        ) : missing ? (
          <>
            <h1 className="text-2xl font-semibold text-gray-900 mb-3">
              Missing sign-in details
            </h1>
            <p className="text-gray-600 mb-8">
              This page needs an email and a code from your invitation link.
              Open the original invitation email and click the &quot;Sign in
              to Sequ3nce&quot; button.
            </p>
            <Link
              href="/download"
              className="inline-block bg-black text-white font-medium px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Download Sequ3nce
            </Link>
          </>
        ) : (
          <>
            <div className="mb-6 inline-block w-12 h-12 rounded-full border-2 border-gray-200 border-t-black animate-spin" />
            <h1 className="text-2xl font-semibold text-gray-900 mb-3">
              Opening Sequ3nce…
            </h1>
            <p className="text-gray-600 mb-2">
              We&apos;re launching the desktop app and signing you in
              automatically.
            </p>
            <p className="text-sm text-gray-500 mb-10">
              Your browser may ask permission to open Sequ3nce — click{" "}
              <strong>Open</strong> or <strong>Allow</strong>.
            </p>

            <div className="border-t border-gray-200 pt-8">
              <p className="text-sm font-semibold text-gray-900 mb-2">
                Nothing happened?
              </p>
              <p className="text-sm text-gray-600 mb-6">
                Most likely the desktop app isn&apos;t installed yet, or your
                browser blocked the protocol. Try one of these:
              </p>
              <div className="flex flex-col gap-3">
                <a
                  href={protocolHref}
                  className="inline-block bg-black text-white font-medium px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Try opening Sequ3nce again
                </a>
                <Link
                  href="/download"
                  className="inline-block border border-gray-300 text-gray-900 font-medium px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Download Sequ3nce first
                </Link>
              </div>

              <div className="mt-8 text-left bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-2">
                  Or enter the code manually in the app:
                </p>
                <p className="text-sm text-gray-700">
                  Open Sequ3nce → <strong>Send me a sign-in link</strong> →
                  enter the 6-digit code from your invitation email.
                </p>
              </div>
            </div>

            {triedAt && (
              <p className="mt-8 text-[10px] text-gray-300">
                Launch attempted at {new Date(triedAt).toLocaleTimeString()}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function LaunchPage() {
  return (
    <Suspense fallback={null}>
      <LaunchInner />
    </Suspense>
  );
}
