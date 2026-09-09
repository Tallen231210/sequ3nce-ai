import React from "react";
import type { Slide } from "../slides";
import { PRICING_SLIDES } from "./pricing";
import { Accent, Check, Cross, H, Icon, Label, P, Stat, card } from "./theme";
import { ArcTimeline, FloorScale, GuaranteeTimeline, OperationStack, ResumeCard } from "./visuals";

// ============================================================================
// Slide content for the B2B pitch deck (/pitch/teams): Sales Ops & Management
// Placement. Light ground, turquoise accent, drawn visuals. Same renderer as
// the closer deck (/pitch) in its "light" variant.
//
// Copy comes from the offer brief ("Sales Ops & Management Placement — Offer
// and Pricing Brief"); nothing here is invented, and the brief's internal-only
// section is deliberately not represented.
// ============================================================================

export const TEAMS_SLIDES: Slide[] = [
  // 1 — Cover
  {
    title: (
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Sequ3nce.ai" className="w-[70vw] max-w-[900px] mx-auto -mb-4" />
        <div className="text-2xl md:text-3xl font-black tracking-[0.35em] text-teal-600 mb-8">FOR TEAMS</div>
        <div className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 leading-[1.05]">
          Sales Ops &amp;
          <br />
          Management Placement
        </div>
      </div>
    ),
    wide: true,
  },
  // 2 — The headline, with the three numbers it rests on
  {
    kicker: "The offer",
    title: (
      <h1 className="text-3xl md:text-[2.5rem] font-bold tracking-tight text-center leading-[1.15] max-w-5xl text-zinc-900">
        We place a fully-managed sales manager into your business in{" "}
        <Accent>14 days</Accent>, build the entire sales operation around them, and
        manage them for you <Accent>until your bottom line doubles.</Accent>
      </h1>
    ),
    body: (
      <div className="grid grid-cols-3 gap-4 w-full max-w-3xl">
        <Stat value="14 days" label="to a placed manager" accent />
        <Stat value="90 days" label="of us managing the manager" />
        <Stat value="2×" label="bottom line, in 60 days" />
      </div>
    ),
    wide: true,
  },
  // 3 — Not recruiting
  {
    kicker: "What this is not",
    title: <H>This is <Accent>not</Accent> recruiting.</H>,
    body: (
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-6 w-full max-w-4xl items-stretch">
        <div className={card()}>
          <Label>A recruiter</Label>
          <p className="text-zinc-900 font-bold text-lg leading-snug mb-5">Hands over a résumé and disappears.</p>
          <div className="mt-auto"><ResumeCard /></div>
        </div>
        <div className={card(true)}>
          <Label accent>Sequ3nce</Label>
          <p className="text-zinc-900 font-bold text-lg leading-snug mb-4">Hands over the whole operation, so the hire actually takes.</p>
          <OperationStack />
        </div>
      </div>
    ),
    wide: true,
  },
  // 4 — Who this is for
  {
    kicker: "Who this is for",
    title: <H>Qualification floor: <Accent>$100,000/mo</Accent> cash collected.</H>,
    body: (
      <div className="w-full max-w-5xl flex flex-col items-center">
        <FloorScale />
        <p className="text-zinc-500 text-[14px] leading-relaxed text-center max-w-[70ch] mt-2 mb-5">
          That number is not arbitrary. A sales manager needs to earn five figures monthly
          or they churn out within a quarter, and below $100k/mo there isn&apos;t enough top
          line to support that comp.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch w-full">
          <div className={card(true)}>
            <Label accent>Best fit</Label>
            <div className="space-y-2">
              <Check>$100k+/mo cash collected, high-ticket or mid-ticket offer</Check>
              <Check>Owner is currently the de facto sales manager and is the bottleneck</Check>
              <Check>Existing closer or setter team that is underperforming, unmanaged, or unmeasured</Check>
              <Check>No real CRM discipline, no reliable pipeline data, no idea which rep is actually good</Check>
            </div>
          </div>
          <div className={card()}>
            <Label>Poor fit</Label>
            <div className="space-y-2">
              <Cross>Sub-$100k/mo</Cross>
              <Cross>Owner wants a body, not a system</Cross>
              <Cross>Unwilling to give visibility into revenue data</Cross>
            </div>
          </div>
        </div>
      </div>
    ),
    wide: true,
  },
  // 5 — The guarantee
  {
    kicker: "The guarantee",
    title: <H>Double the bottom line <Accent>in 60 days.</Accent></H>,
    body: (
      <div className="w-full max-w-4xl flex flex-col items-center gap-6">
        <GuaranteeTimeline />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-3xl items-stretch">
          <Stat value="14 days" label="Manager placed within 14 days of kickoff." accent />
          <Stat value="Day one" label="Full system live before the manager's first day, so they walk into a built operation rather than a blank CRM." />
        </div>
      </div>
    ),
    wide: true,
  },
  // 6 — What's included (three pillars)
  {
    kicker: "What's included",
    title: <H>The full sales operation. <Accent>Not a placement plus advice.</Accent></H>,
    body: (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-6xl items-stretch">
        {[
          {
            icon: "users",
            name: "Recruiting & Placement",
            items: [
              "Diligent, filtered recruiting process for the sales manager role",
              "Role scorecard and compensation plan design",
              "Closer recruiting and hiring where the team needs to be built or replaced",
              "Candidate vetting against the specific offer, price point, and sales motion",
            ],
          },
          {
            icon: "layers",
            name: "System Build",
            items: [
              "Full CRM configuration — pipeline architecture, stages, fields, automations, reporting",
              "Sequ3nce configured to the business as the system of record",
              "Setter motion build-out — cadences, dial standards, handoff criteria",
              "Script rewriting and configuration for the actual offer",
              "Onboarding and ramp build-out so every future hire loads into a repeatable process",
            ],
          },
          {
            icon: "chart",
            name: "Ongoing Management",
            items: [
              "We manage the manager. Weekly one-on-ones, call reviews, KPI accountability",
              "Performance diagnostics on every rep, not just aggregate revenue",
              "Direct reporting to the owner on what's working, what isn't, and who's at risk",
              "Iteration on scripts, cadences, and comp as the data comes in",
            ],
          },
        ].map((pil) => (
          <div key={pil.name} className={card()}>
            <Icon name={pil.icon} className="text-teal-600 mb-3" />
            <div className="text-zinc-900 font-bold text-[17px] mb-4">{pil.name}</div>
            <div className="space-y-2">
              {pil.items.map((it) => (
                <Check key={it}>{it}</Check>
              ))}
            </div>
          </div>
        ))}
      </div>
    ),
    wide: true,
  },
  // 7 — The 90-day arc
  {
    kicker: "The 90-day arc",
    title: <H>Build. Install. <Accent>Release.</Accent></H>,
    body: (
      <div className="w-full max-w-6xl flex flex-col items-center gap-4">
        <ArcTimeline />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full items-stretch">
          {[
            { days: "Days 1–30", name: "Build", lead: "Diagnostic, scorecard, comp plan, CRM and Sequ3nce configuration, cadence and script build, reporting layer. Recruiting runs in parallel; the manager is placed by day 14." },
            { days: "Days 31–60", name: "Install", lead: "Manager onboarded into a finished system. Daily standups, call reviews, baselines set. We are in the room. This is the window the guarantee runs against.", accent: true },
            { days: "Days 61–90", name: "Release", lead: "Manager runs solo. We move to observation and weekly review. Handoff documentation, final performance readout, transition to the ongoing relationship." },
          ].map((ph) => (
            <div key={ph.name} className={card(ph.accent)}>
              <Label accent={ph.accent}>{ph.days}</Label>
              <div className="text-zinc-900 font-bold text-xl mb-2">{ph.name}</div>
              <p className="text-zinc-600 text-[13px] leading-relaxed">{ph.lead}</p>
            </div>
          ))}
        </div>
      </div>
    ),
    wide: true,
  },
  // 8 — Why Sequ3nce matters, with the manager's actual screen (sample data)
  {
    kicker: "Why Sequ3nce matters",
    title: "What separates this from consulting.",
    body: (
      <div className="space-y-4">
        <P>Sequ3nce is our in-house sales sequencing and cadence software. The manager runs their team out of it. The owner reads their numbers out of it. Every cadence, pipeline stage, and performance metric lives there.</P>
        <div className="space-y-2 pt-1">
          <div className="flex items-start gap-3">
            <span className="text-teal-600 font-black text-[12px] tracking-[0.25em] mt-1">01</span>
            <span className="text-zinc-900 font-semibold text-[15px] leading-snug">The owner gets real data instead of a rep&apos;s self-report.</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-teal-600 font-black text-[12px] tracking-[0.25em] mt-1">02</span>
            <span className="text-zinc-900 font-semibold text-[15px] leading-snug">The system doesn&apos;t leave when the engagement ends.</span>
          </div>
        </div>
      </div>
    ),
    shot: "/pitch/teams-performance.png",
  },
  ...PRICING_SLIDES,
];
