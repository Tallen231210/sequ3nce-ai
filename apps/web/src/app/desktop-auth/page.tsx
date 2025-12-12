"use client";

import { useState, useEffect, Suspense } from "react";
import { useSignIn, useAuth } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

type AuthStep = "email" | "sending" | "check_email" | "verifying" | "success" | "error";

function DesktopAuthContent() {
  const { signIn, isLoaded, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [step, setStep] = useState<AuthStep>("email");
  const [error, setError] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);

  const redirectUrl = searchParams.get("redirect") || "seq3nce://auth-callback";

  // If already signed in, redirect immediately
  useEffect(() => {
    if (isSignedIn) {
      handleRedirectToApp();
    }
  }, [isSignedIn]);

  // Start resend timer when on check_email step
  useEffect(() => {
    if (step === "check_email") {
      setCanResend(false);
      const timer = setTimeout(() => setCanResend(true), 30000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const handleRedirectToApp = () => {
    setStep("success");
    // Generate a simple token (in production, use a proper signed token)
    const token = `verified_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    // Redirect to the desktop app
    setTimeout(() => {
      window.location.href = `${redirectUrl}?token=${token}&email=${encodeURIComponent(email)}`;
    }, 1500);
  };

  const handleSendMagicLink = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!isLoaded || !signIn) {
      setError("Authentication not ready. Please try again.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setStep("sending");
    setError(null);

    try {
      // Start the magic link sign-in process
      const result = await signIn.create({
        identifier: email.trim().toLowerCase(),
        strategy: "email_link",
        redirectUrl: `${window.location.origin}/desktop-auth/callback?redirect=${encodeURIComponent(redirectUrl)}&email=${encodeURIComponent(email)}`,
      });

      if (result.status === "needs_first_factor") {
        // Need to prepare the email link
        const emailLinkFactor = result.supportedFirstFactors?.find(
          (factor) => factor.strategy === "email_link"
        );

        if (emailLinkFactor && "emailAddressId" in emailLinkFactor) {
          await signIn.prepareFirstFactor({
            strategy: "email_link",
            emailAddressId: emailLinkFactor.emailAddressId,
            redirectUrl: `${window.location.origin}/desktop-auth/callback?redirect=${encodeURIComponent(redirectUrl)}&email=${encodeURIComponent(email)}`,
          });
        }

        setStep("check_email");
      } else if (result.status === "complete") {
        // Already signed in
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
        }
        handleRedirectToApp();
      } else {
        console.log("Unexpected sign-in status:", result.status);
        setError("Unexpected authentication state. Please try again.");
        setStep("error");
      }
    } catch (err: any) {
      console.error("Sign-in error:", err);

      // Handle specific Clerk errors
      if (err.errors) {
        const clerkError = err.errors[0];
        if (clerkError.code === "form_identifier_not_found") {
          // User doesn't exist - they need to sign up first
          // For closers, they should be added by their manager first
          setError(
            "No account found with this email. Make sure your team admin has added you to the system."
          );
        } else if (clerkError.code === "strategy_for_user_invalid") {
          setError("Email magic link is not enabled for this account.");
        } else {
          setError(clerkError.message || "Authentication failed. Please try again.");
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
      setStep("error");
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    await handleSendMagicLink();
  };

  const handleBackToEmail = () => {
    setEmail("");
    setError(null);
    setStep("email");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">Seq3nce</h1>
          <p className="text-gray-500">Desktop App Login</p>
        </div>

        {/* Email Entry */}
        {(step === "email" || step === "sending") && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Sign in to Seq3nce
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              Enter your email and we'll send you a magic link to sign in.
            </p>

            <form onSubmit={handleSendMagicLink} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
                  disabled={step === "sending"}
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-red-600 text-sm">{error}</p>
              )}

              <button
                type="submit"
                disabled={step === "sending" || !email.trim()}
                className="w-full py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {step === "sending" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-white rounded-full animate-spin" />
                    Sending link...
                  </>
                ) : (
                  "Continue with magic link"
                )}
              </button>
            </form>

            <p className="text-xs text-gray-400 text-center mt-6">
              Use the email your team admin invited you with
            </p>
          </div>
        )}

        {/* Check Email */}
        {step === "check_email" && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
            {/* Email icon */}
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-8 h-8 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Check your email
            </h2>
            <p className="text-gray-500 text-sm mb-2">
              We sent a login link to
            </p>
            <p className="text-gray-900 font-medium mb-4">{email}</p>
            <p className="text-gray-500 text-sm mb-8">
              Click the link in your email to continue. The link expires in 10
              minutes.
            </p>

            <div className="space-y-3">
              <button
                onClick={handleResend}
                disabled={!canResend}
                className="w-full py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {canResend ? "Resend link" : "Resend available in 30s"}
              </button>

              <button
                onClick={handleBackToEmail}
                className="w-full py-2.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Use a different email
              </button>
            </div>
          </div>
        )}

        {/* Success */}
        {step === "success" && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
            {/* Success icon */}
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
              Redirecting you back to the Seq3nce app...
            </p>

            <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin mx-auto" />
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
            {/* Error icon */}
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
              Something went wrong
            </h2>
            <p className="text-gray-500 text-sm mb-8">{error}</p>

            <div className="space-y-3">
              <button
                onClick={() => {
                  setError(null);
                  setStep("email");
                }}
                className="w-full py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-gray-400 text-center mt-8">
          Having trouble?{" "}
          <a href="mailto:support@seq3nce.ai" className="underline">
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">Seq3nce</h1>
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

export default function DesktopAuthPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <DesktopAuthContent />
    </Suspense>
  );
}
