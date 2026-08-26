"use client";

// The front door for anyone who lost their URL. Three products share this
// domain — manager dashboard, closer app, setter app — and before this page
// existed the homepage offered two doors, both of which led a closer to a
// paywall. One click here and everyone self-sorts.

import Link from "next/link";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { ArrowRight, Headset, Phone, Users } from "lucide-react";
import { Logo } from "@/components/ui/logo";

const CARD =
  "group flex w-full items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5 text-left transition-all hover:border-zinc-900 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]";
const ICON =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 transition-colors group-hover:bg-zinc-900 group-hover:text-white";

export default function LoginChooser() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo height={28} href="/" />
        </div>
        <h1 className="mb-1 text-center text-[19px] font-semibold tracking-tight text-zinc-900">
          Sign in to Sequ3nce
        </h1>
        <p className="mb-7 text-center text-[13.5px] text-zinc-500">
          Pick your seat — each one has its own door.
        </p>

        <div className="space-y-3">
          <Link href="/app" className={CARD}>
            <span className={ICON}>
              <Phone className="h-4.5 w-4.5" strokeWidth={1.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-zinc-900">
                I&apos;m a closer on a team
              </span>
              <span className="block text-[12.5px] text-zinc-500">
                Your calls, calendar and stats — sign in with your work email.
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-900" strokeWidth={1.5} />
          </Link>

          <Link href="/setter" className={CARD}>
            <span className={ICON}>
              <Headset className="h-4.5 w-4.5" strokeWidth={1.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-zinc-900">
                I&apos;m a setter
              </span>
              <span className="block text-[12.5px] text-zinc-500">
                Your EOD, your booked calls and the team scorecard.
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-900" strokeWidth={1.5} />
          </Link>

          <SignedOut>
            <SignInButton mode="modal">
              <button className={CARD}>
                <span className={ICON}>
                  <Users className="h-4.5 w-4.5" strokeWidth={1.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-zinc-900">
                    I run a team
                  </span>
                  <span className="block text-[12.5px] text-zinc-500">
                    The manager dashboard — live calls, recordings, reports.
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-900" strokeWidth={1.5} />
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard" className={CARD}>
              <span className={ICON}>
                <Users className="h-4.5 w-4.5" strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-zinc-900">
                  I run a team
                </span>
                <span className="block text-[12.5px] text-zinc-500">
                  You&apos;re signed in — straight to the dashboard.
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-900" strokeWidth={1.5} />
            </Link>
          </SignedIn>
        </div>

        <p className="mt-6 text-center text-[12px] text-zinc-400">
          Looking for Sequ3nce Personal?{" "}
          <Link href="/personal" className="underline hover:text-zinc-600">
            It&apos;s over here
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
