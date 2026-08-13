"use client";

// ============================================================================
// Where an invite link lands.
//
// Deliberately thin, and deliberately does NOT look the invite up. Resolving a
// team name from an email in the URL would let anyone type addresses in and
// learn which companies they belong to.
//
// So this page's only job is to say the one thing people get wrong: sign in
// with the exact address you were invited on. Everything else — matching that
// address to the team — happens after Clerk has verified it, in
// `ensureUserTeam`.
// ============================================================================

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SignInButton, SignUpButton, SignedIn, SignedOut } from "@clerk/nextjs";
import Link from "next/link";
import { Mail } from "lucide-react";

function JoinInner() {
  const params = useSearchParams();
  const email = (params.get("e") || "").trim();

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
        <Mail className="h-5 w-5 text-zinc-600" />
      </div>

      <h1 className="text-2xl font-semibold text-zinc-900">
        You&apos;ve been invited to Sequ3nce
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-zinc-600">
        Sign in with{" "}
        {email ? (
          <span className="font-medium text-zinc-900">{email}</span>
        ) : (
          "the email address your invite was sent to"
        )}{" "}
        and you&apos;ll join your team.
      </p>

      {/* The single most useful sentence on the page. Signing in with a
          different address doesn't fail — it quietly starts a separate
          company, which is exactly how this went wrong before invites
          existed. */}
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
        Use that exact address. Signing in with a different one — including a
        personal Google account — creates a separate company rather than
        joining this team.
      </p>

      <div className="mt-8">
        <SignedOut>
          {/* SIGN UP, not sign in.
              This page is reached by someone who by definition has no account
              yet, and Clerk's sign-in modal offers no way to create one — no
              "don't have an account?" link at all. Sending an invited person
              there means they type their email, get told nothing, and never
              receive a verification code, because they never started a sign-up.
              That is exactly what happened the first time this was tested. */}
          <SignUpButton mode="modal">
            <button className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90">
              Create your account
            </button>
          </SignUpButton>
          <div className="mt-4">
            <SignInButton mode="modal">
              <button className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800">
                Already have a Sequ3nce login? Sign in instead
              </button>
            </SignInButton>
          </div>
        </SignedOut>
        <SignedIn>
          <Link
            href="/dashboard"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Go to your dashboard
          </Link>
          <p className="mt-3 text-xs text-zinc-500">
            Already signed in. If that isn&apos;t {email || "the invited address"},
            sign out first and back in with it.
          </p>
        </SignedIn>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinInner />
    </Suspense>
  );
}
