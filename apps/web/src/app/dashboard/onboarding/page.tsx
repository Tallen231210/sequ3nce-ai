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
  Calendar as CalendarIcon,
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
 *
 * Step ordering: the "book a call" step lives at position 5 (optional)
 * — customers are encouraged to self-serve through the technical setup
 * first. A persistent "Need help?" CTA at the top of the page exposes
 * the call link from every other step, so anyone who feels stuck can
 * escape into a walkthrough at any point.
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
    state.addedCloser,
    state.installedGhl,
    state.connectedHyros,
    state.configuredSlack,
    state.bookedCall,
  ].filter(Boolean).length;

  async function handleMarkBooked() {
    if (!clerkId) return;
    await markCallBooked({ clerkId });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 pb-16">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-2">Welcome to Sequ3nce</h1>
        <p className="text-muted-foreground leading-relaxed">
          Sequ3nce is the ultimate set of eyes for your entire sales process,
          systems, and team. These five steps wire up everything we&apos;ll
          watch for you. Most check off automatically as you complete them.
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

      {/* Persistent help CTA — pinned above the steps so any customer
          feeling overwhelmed at any step can escape into a walkthrough
          without scrolling. Hidden once they've marked the call booked. */}
      {!state.bookedCall && state.bookingUrl && (
        <div className="mb-6">
          <a
            href={state.bookingUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => void handleMarkBooked()}
            className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm hover:bg-indigo-50 transition-colors"
          >
            <CalendarIcon className="h-4 w-4 text-indigo-700 shrink-0" />
            <span className="text-foreground">
              <strong className="font-semibold">Need help with setup?</strong>{" "}
              <span className="text-muted-foreground">
                Book a free 30-min onboarding call and our team will walk you
                through it.
              </span>
            </span>
            <ExternalLink className="h-3.5 w-3.5 text-indigo-700 shrink-0 ml-auto" />
          </a>
        </div>
      )}

      <div className="space-y-3">
        <ChecklistItem
          index={1}
          checked={state.addedCloser}
          title="Add your first closer"
          description={
            <>
              The moment your closer signs in, every sales call they take goes
              from a black box into a measurable signal. Sequ3nce drops a bot
              into their video meetings, captures audio and video, transcribes
              the conversation in real time, and overlays live coaching on
              their screen — a real-time engagement meter, a 7-axis buying
              belief tracker (problem, solution, vehicle, self, time, money,
              urgency), predicted objections based on what&apos;s been said,
              prospect pain points extracted as the prospect speaks them, and
              a rolling 2-3 sentence summary of what&apos;s happening in the
              call right now. After the call, AI scores it across the five
              canonical sales phases — opening, discovery, presentation,
              objection handling, closing — and generates a chapter strip you
              can scrub through, plus a one-paragraph summary you can read in
              30 seconds. Every recording lands in a library you can review
              later, save highlights from, and pull into training playlists by
              category.
            </>
          }
          unlocks={[
            "Real-time on-screen coaching overlay during every call (engagement, belief tracker, objection prediction, pain points, live summary)",
            "Post-call AI scoring across opening, discovery, presentation, objection handling, closing",
            "Chapter-strip navigation and one-paragraph AI summary per call",
            "Recording library with playbook highlights and training playlists",
            "Talk ratio, deal size, cash collected, close rate stats — computed automatically per closer",
          ]}
          action={
            <Button
              asChild
              size="sm"
              variant={state.addedCloser ? "outline" : "default"}
            >
              <Link href="/dashboard/team">Go to Team</Link>
            </Button>
          }
        />

        <ChecklistItem
          index={2}
          checked={state.installedGhl}
          title="Install the GoHighLevel integration"
          description={
            <>
              The moment you connect GHL, you stop having to ask your setters
              how their day went — you see it live. Every dial, every SMS,
              every conversation flows into Sequ3nce within seconds of
              happening. You see who&apos;s actually working, who&apos;s
              coasting, which leads are sitting untouched right now, and which
              hours of yesterday had leads landing while nobody was dialing.
              Speed-to-lead is measured to the second — the moment a lead
              lands in GHL until the moment your setter first touches them.
              Coverage gaps get flagged daily so you can fix scheduling holes.
              When a closer fires their call disposition (closed, no-show,
              follow-up, etc.), it writes back into GHL automatically so your
              CRM stays in sync without anyone typing twice.
            </>
          }
          unlocks={[
            "Real-time setter activity tracking — dials, SMS, conversations",
            "Speed-to-lead measurement per setter and per lead source",
            "Untouched-lead detection (leads with zero contact attempts)",
            "Coverage-gap analysis — which hours yesterday were under-dialed",
            "Booking-flow detection — was the booking setter-driven, or did the prospect self-book?",
            "Automatic disposition sync — closer call outcomes write back to GHL contacts",
          ]}
          action={
            <Button
              asChild
              size="sm"
              variant={state.installedGhl ? "outline" : "default"}
            >
              <Link href="/dashboard/setter-data">Connect GHL</Link>
            </Button>
          }
        />

        <ChecklistItem
          index={3}
          checked={state.connectedHyros}
          title="Connect Hyros"
          description={
            <>
              Hyros tags every lead in your GHL pipeline with the ad source
              that produced them — campaign, ad set, ad, even the creative.
              Sequ3nce stitches that attribution onto every call your closers
              run, so you can finally see which closer closes which ad source
              best. Pair Hyros with the Meta Ads connection (also in
              Settings &rarr; Integrations) and Sequ3nce computes per-closer
              ROI: cash collected divided by ad spend attributed to that
              closer, ranked worst-to-best. The marketing-to-sales gap closes.
              You catch your highest-spend campaigns producing the worst
              closer&apos;s worst closes, and reroute mid-month instead of
              finding out at the end of the quarter.
            </>
          }
          unlocks={[
            "Per-lead attribution down to campaign, ad set, ad, and creative",
            "Source-attributed call stats — see which closer crushes which lead source",
            "Per-closer ROI calculations when paired with Meta Ads spend data",
            "Worst-ROI-first ranking so managers know exactly where to focus coaching",
          ]}
          footnote="If you run paid traffic, also connect Meta Ads in the same Settings → Integrations area to unlock the per-closer ROI calculation."
          action={
            <Button
              asChild
              size="sm"
              variant={state.connectedHyros ? "outline" : "default"}
            >
              <Link href="/dashboard/settings">Add API key</Link>
            </Button>
          }
        />

        <ChecklistItem
          index={4}
          checked={state.configuredSlack}
          title="Configure Slack notifications"
          description={
            <>
              Sequ3nce sends your team four distinct Slack notifications, each
              surfacing a signal you&apos;d otherwise miss. None of them are
              noise — each one is tied to a specific decision a manager or
              setter needs to make.{" "}
              <strong>Untouched-lead alerts</strong> ping the channel the
              moment a fresh lead has been sitting untouched past your
              threshold, so a setter can grab it before it goes cold.{" "}
              <strong>Daily Scorecards</strong> drop yesterday&apos;s setter
              KPIs (speed-to-lead, dial count, connection rate, top
              performers) into Slack every morning — your team starts the day
              knowing where they stand.{" "}
              <strong>Coverage Gap Digests</strong> call out the hours
              yesterday when leads landed but nobody dialed, so you fix
              scheduling holes.{" "}
              <strong>Daily Uncontacted Leads Digests</strong> sweep up
              the day&apos;s missed leads in one end-of-day post — setters
              who couldn&apos;t keep up with real-time alerts can clean the
              queue in one batch before clocking out.
            </>
          }
          unlocks={[
            "Real-time untouched-lead pings",
            "Daily Setter Scorecard (configurable hour, default 9am)",
            "Daily Coverage Gap Digest (configurable hour, default 9am)",
            "End-of-day Uncontacted Leads Digest (configurable hour, default 5pm)",
            "Discord supported as an alternative to Slack",
          ]}
          footnote="Each notification has its own description on its card in Setter Data → Settings. Read each one before turning it on so you know what it does — and consider creating a dedicated #sequ3nce-alerts Slack channel so they don't drown out your other team chatter."
          action={
            <Button
              asChild
              size="sm"
              variant={state.configuredSlack ? "outline" : "default"}
            >
              <Link href="/dashboard/setter-data?tab=settings">
                Configure
              </Link>
            </Button>
          }
        />

        <ChecklistItem
          index={5}
          checked={state.bookedCall}
          title="Book your onboarding call"
          optional
          description={
            <>
              Once everything&apos;s wired up, jump on a 30-minute walkthrough
              with our team. We&apos;ll point at the dashboards that matter
              for your specific operation, answer questions about what the
              data is telling you, and help you set up coaching workflows you
              may not have realized are possible. Skip if you&apos;re
              self-sufficient — you have a working install either way.
            </>
          }
          action={
            <>
              {state.bookingUrl ? (
                <Button asChild size="sm" variant={state.bookedCall ? "outline" : "default"}>
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
      </div>

      {/* Discovery map — answers "wait, what else can this app do?" without
          forcing a customer to spelunk through every sidebar tab. Each entry
          maps a tab to the concrete capability the customer will find there.
          Sized large because product surface area is genuinely big and a
          quick "scan for what you need" beats hunting through nav. */}
      <div className="mt-12 rounded-lg border border-border bg-card/40 p-6">
        <h2 className="text-base font-semibold mb-1">
          Already set up? Here&apos;s where to dig in
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Sequ3nce&apos;s surface area is wide — every link below opens a
          different angle on your team.
        </p>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <DiscoveryLink
            href="/dashboard/setter-data"
            label="Setter Data"
            caption="Speed-to-lead, dial counts, untouched leads, coverage gaps, lead pipeline"
          />
          <DiscoveryLink
            href="/dashboard/live"
            label="Live Calls"
            caption="Watch calls happening across your team right now, with live ammo + transcript"
          />
          <DiscoveryLink
            href="/dashboard/call-reviews"
            label="Call Reviews"
            caption="AI-scored recordings, chapter-strip navigation, coaching playlists"
          />
          <DiscoveryLink
            href="/dashboard/closer-stats"
            label="Closer Stats"
            caption="Close rate, cash collected, avg deal size, talk ratio, ROI per closer"
          />
          <DiscoveryLink
            href="/dashboard/schedule"
            label="Schedule"
            caption="Calendar view of every call across your team, multi-calendar support"
          />
          <DiscoveryLink
            href="/dashboard/playbook"
            label="Playbook"
            caption="Save call highlights into training categories — objection handling, pitch, close, pain discovery"
          />
          <DiscoveryLink
            href="/dashboard/analytics"
            label="Analytics"
            caption="Cross-team performance trends, leaderboards, source attribution"
          />
          <DiscoveryLink
            href="/dashboard/resources"
            label="Resources"
            caption="Shared playbooks, scripts, and reference material for your closers"
          />
        </div>
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
  unlocks,
  footnote,
  optional,
  action,
}: {
  index: number;
  checked: boolean;
  title: string;
  description: React.ReactNode;
  unlocks?: string[];
  footnote?: string;
  optional?: boolean;
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
              {optional && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 border border-muted-foreground/30 rounded px-1.5 py-px">
                  Optional
                </span>
              )}
              {checked && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                  Done
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold mb-2">{title}</h3>
            <div className="text-sm text-muted-foreground leading-relaxed">
              {description}
            </div>
            {unlocks && unlocks.length > 0 && (
              <div className="mt-3 rounded-md bg-muted/50 px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-foreground/70 mb-1.5">
                  What you&apos;ll unlock
                </div>
                <ul className="space-y-1 text-xs text-foreground/80 list-disc list-inside marker:text-muted-foreground">
                  {unlocks.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
            {footnote && (
              <p className="mt-2 text-xs text-muted-foreground italic">
                {footnote}
              </p>
            )}
          </div>
          <div className="shrink-0 flex flex-col sm:flex-row gap-2 items-end">
            {action}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DiscoveryLink({
  href,
  label,
  caption,
}: {
  href: string;
  label: string;
  caption: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-0.5 rounded-md px-2 py-1.5 -mx-2 -my-1.5 hover:bg-muted/60 transition-colors"
    >
      <span className="font-semibold text-foreground group-hover:underline">
        {label}
      </span>
      <span className="text-xs text-muted-foreground leading-snug">
        {caption}
      </span>
    </Link>
  );
}
