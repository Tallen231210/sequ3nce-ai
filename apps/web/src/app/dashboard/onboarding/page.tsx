"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  ExternalLink,
} from "lucide-react";

/**
 * Onboarding checklist page — 5 self-checking items that drive every
 * new B2B customer to first value. Most items auto-check by querying
 * existing state (closer count, GHL install status, hyrosApiKey,
 * Slack channel IDs). Only "Book onboarding call" requires a manual
 * self-check since we haven't wired the calendar provider's webhook yet.
 *
 * When all 5 complete, the page automatically calls markCompleted,
 * which causes:
 *   - The persistent banner to hide (onboarding-banner.tsx)
 *   - The sidebar nav item to hide (sidebar.tsx)
 *   - This page to render a "you're all set" celebration card
 */
export default function OnboardingPage() {
  const { clerkId, isReady } = useTeam();
  const state = useQuery(
    api.onboarding.getOnboardingState,
    isReady && clerkId ? { clerkId } : "skip",
  );
  const markCallBooked = useMutation(api.onboarding.markCallBooked);
  const markCompleted = useMutation(api.onboarding.markCompleted);

  // When all 5 items complete, fire-and-forget mark-completed so the
  // banner + sidebar item disappear and the celebration view renders.
  useEffect(() => {
    if (state?.completed && !state.onboardingCompletedAt && clerkId) {
      void markCompleted({ clerkId });
    }
  }, [state, clerkId, markCompleted]);

  if (!state) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Celebration view — fires once all 5 are checked.
  if (state.completed) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Card>
          <CardContent className="p-10 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 mb-4">
              <Sparkles className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-semibold mb-2">
              You&apos;re all set 🎉
            </h1>
            <p className="text-muted-foreground mb-6">
              Every setup step is complete. Your team should start seeing
              calls, summaries, and notifications flow through the
              platform. The onboarding tab will disappear from your
              sidebar.
            </p>
            <div className="flex gap-2 justify-center">
              <Button asChild>
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const completedCount = [
    state.bookedCall,
    state.addedCloser,
    state.installedGhl,
    state.connectedHyros,
    state.configuredSlack,
  ].filter(Boolean).length;

  async function handleMarkBooked() {
    if (!clerkId) return;
    await markCallBooked({ clerkId });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 pb-16">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-2">Welcome to Sequ3nce</h1>
        <p className="text-muted-foreground">
          Five steps to get your team running. Most check off automatically
          as you complete them.
        </p>
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="font-semibold tabular-nums">
            {completedCount} / 5
          </span>
          <span className="text-muted-foreground">complete</span>
          <div className="ml-3 flex-1 max-w-xs h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-500"
              style={{ width: `${(completedCount / 5) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <ChecklistItem
          index={1}
          checked={state.bookedCall}
          title="Book your onboarding call"
          description="30 minutes with our team. We'll walk you through the platform and configure integrations together."
          action={
            <>
              {state.bookingUrl ? (
                <Button asChild size="sm">
                  <a
                    href={state.bookingUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => void handleMarkBooked()}
                  >
                    Schedule <ExternalLink className="h-3 w-3 ml-1.5" />
                  </a>
                </Button>
              ) : (
                <Button size="sm" disabled title="Calendar link not configured">
                  Schedule
                </Button>
              )}
              {!state.bookedCall && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleMarkBooked}
                >
                  I already booked
                </Button>
              )}
            </>
          }
        />

        <ChecklistItem
          index={2}
          checked={state.addedCloser}
          title="Add your first closer"
          description="Closers are the team members who actually run sales calls. Add their name + email in the Team tab — we'll email them a one-click sign-in link for the desktop app."
          action={
            <Button asChild size="sm" variant={state.addedCloser ? "outline" : "default"}>
              <Link href="/dashboard/team">Go to Team</Link>
            </Button>
          }
        />

        <ChecklistItem
          index={3}
          checked={state.installedGhl}
          title="Install the GoHighLevel integration"
          description="One-click OAuth via the GHL marketplace. Pulls in setter activity, lead pipeline, dispositions, and call transcripts."
          action={
            <Button asChild size="sm" variant={state.installedGhl ? "outline" : "default"}>
              <Link href="/dashboard/setter-data">Connect GHL</Link>
            </Button>
          }
        />

        <ChecklistItem
          index={4}
          checked={state.connectedHyros}
          title="Connect Hyros"
          description="Powers ad attribution + closer ROI. Paste your Hyros API key in Settings → Integrations."
          action={
            <Button asChild size="sm" variant={state.connectedHyros ? "outline" : "default"}>
              <Link href="/dashboard/settings">Add API key</Link>
            </Button>
          }
        />

        <ChecklistItem
          index={5}
          checked={state.configuredSlack}
          title="Configure Slack notifications"
          description="Get pinged when calls start, end, or hit milestones. Set up channel mapping in the Setter Data settings tab."
          action={
            <Button asChild size="sm" variant={state.configuredSlack ? "outline" : "default"}>
              <Link href="/dashboard/setter-data?tab=settings">
                Configure
              </Link>
            </Button>
          }
        />
      </div>

      <p className="mt-10 text-xs text-muted-foreground text-center">
        Most steps auto-check as soon as you complete them. Hit refresh if
        anything looks stale.
      </p>
    </div>
  );
}

function ChecklistItem({
  index,
  checked,
  title,
  description,
  action,
}: {
  index: number;
  checked: boolean;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <Card className={checked ? "bg-emerald-50/40 border-emerald-200" : ""}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0 mt-0.5">
            {checked ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            ) : (
              <Circle className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Step {index}
              </span>
              {checked && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                  Done
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="shrink-0 flex flex-col sm:flex-row gap-2 items-end">
            {action}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
