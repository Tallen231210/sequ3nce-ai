import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
} from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex h-16 items-center justify-between">
            <span className="text-lg font-semibold">Seq3nce.ai</span>
            <div className="flex items-center gap-4">
              <SignedOut>
                <SignInButton mode="modal">
                  <Button variant="ghost" size="sm">
                    Sign In
                  </Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button size="sm">Get Started</Button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <Link href="/dashboard">
                  <Button size="sm">
                    Dashboard
                    <ArrowRight className="h-3 w-3 ml-1" strokeWidth={1.5} />
                  </Button>
                </Link>
              </SignedIn>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-3xl">
          <h1 className="text-5xl font-semibold tracking-tight">
            Sales call intelligence
            <br />
            <span className="text-muted-foreground">for high-ticket teams</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl">
            See what&apos;s happening on every call in real-time. Get structured
            data on why deals close or don&apos;t. Coach your reps based on
            data, not guesswork.
          </p>
          <div className="mt-10 flex items-center gap-4">
            <SignedOut>
              <SignUpButton mode="modal">
                <Button size="lg">
                  Start Free Trial
                  <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                </Button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <Link href="/dashboard">
                <Button size="lg">
                  Go to Dashboard
                  <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                </Button>
              </Link>
            </SignedIn>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid gap-12 md:grid-cols-3">
            <div>
              <h3 className="font-semibold">Live Call Tracking</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                See who&apos;s on calls right now. Watch key moments unfold in
                real-time without interrupting.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">AI-Powered Ammo</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Key prospect quotes extracted automatically. Your closers never
                forget what the prospect said.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">No-Show Detection</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Automatically track when prospects don&apos;t show up. Hold
                marketing accountable for lead quality.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-sm text-muted-foreground">
            © 2024 Seq3nce.ai. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
