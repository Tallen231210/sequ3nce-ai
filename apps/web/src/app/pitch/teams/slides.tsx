import React from "react";
import type { TeamSlide } from "./BlueprintDeck";
import { PRICING_SLIDES } from "./pricing";
import { Accent, Check, Cross, H, Icon, Mono, P, Spec, Stat } from "./theme";
import { ArcDrawing, FloorScale, GuaranteeLine, OperationChain, OperationStack, ResumeSheet } from "./visuals";

// ============================================================================
// Slide content for the B2B pitch deck (/pitch/teams): Sales Ops & Management
// Placement, drawn in the Blueprint × Dashboard system.
//
// Copy comes from the offer brief ("Sales Ops & Management Placement — Offer
// and Pricing Brief"); nothing here is invented, and the brief's internal-only
// section is deliberately not represented.
// ============================================================================

export const TEAMS_SLIDES: TeamSlide[] = [
  // 1 — Cover
  {
    bar: "DWG 01 · Sales operation",
    pill: "Rev A",
    body: (
      <div className="w-full">
        <div className="flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Sequ3nce.ai" className="w-[150px]" />
          <Mono>Sequ3nce · For Teams</Mono>
        </div>
        <H size="xl" className="mt-10 max-w-[12ch]">Sales Ops &amp; Management Placement</H>
        <div className="mt-14">
          <OperationChain />
        </div>
      </div>
    ),
  },
  // 2 — The headline, with the three numbers it rests on
  {
    bar: "The offer",
    body: (
      <div className="w-full">
        <Mono className="mb-4">01 · The offer</Mono>
        <H size="md" className="max-w-[26ch]">
          We place a fully-managed sales manager into your business in <Accent>14 days</Accent>, build the entire sales operation around them, and
          manage them for you <Accent>until your bottom line doubles.</Accent>
        </H>
        <div className="grid grid-cols-3 gap-4 mt-10 max-w-3xl">
          <Stat value="14 days" label="to a placed manager" accent />
          <Stat value="90 days" label="of us managing the manager" />
          <Stat value="2×" label="bottom line, in 60 days" />
        </div>
      </div>
    ),
  },
  // 3 — Not recruiting
  {
    bar: "What this is not",
    body: (
      <div className="w-full">
        <Mono className="mb-4">02 · What this is not</Mono>
        <H>
          This is <Accent>not</Accent> recruiting.
        </H>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-5 mt-8 max-w-5xl items-stretch">
          <Spec className="flex flex-col">
            <Mono ink className="mb-3">A recruiter</Mono>
            <p className="font-bold text-lg leading-snug mb-5 text-[#0b1f1d]">Hands over a résumé and disappears.</p>
            <div className="mt-auto">
              <ResumeSheet />
            </div>
          </Spec>
          <Spec accent>
            <Mono className="mb-3">Sequ3nce</Mono>
            <p className="font-bold text-lg leading-snug mb-4 text-[#0b1f1d]">Hands over the whole operation, so the hire actually takes.</p>
            <OperationStack />
          </Spec>
        </div>
      </div>
    ),
  },
  // 4 — Who this is for
  {
    bar: "Who this is for",
    pill: "$100k/mo floor",
    body: (
      <div className="w-full">
        <Mono className="mb-4">03 · Who this is for</Mono>
        <H size="md">
          Qualification floor: <Accent>$100,000/mo</Accent> cash collected.
        </H>
        <div className="mt-6">
          <FloorScale />
        </div>
        <P className="mt-2 mb-5 max-w-[78ch]">
          That number is not arbitrary. A sales manager needs to earn five figures monthly or they churn out within a quarter, and below $100k/mo
          there isn&apos;t enough top line to support that comp.
        </P>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          <Spec accent>
            <Mono className="mb-3">Best fit</Mono>
            <div className="space-y-2">
              <Check>$100k+/mo cash collected, high-ticket or mid-ticket offer</Check>
              <Check>Owner is currently the de facto sales manager and is the bottleneck</Check>
              <Check>Existing closer or setter team that is underperforming, unmanaged, or unmeasured</Check>
              <Check>No real CRM discipline, no reliable pipeline data, no idea which rep is actually good</Check>
            </div>
          </Spec>
          <Spec>
            <Mono ink className="mb-3">Poor fit</Mono>
            <div className="space-y-2">
              <Cross>Sub-$100k/mo</Cross>
              <Cross>Owner wants a body, not a system</Cross>
              <Cross>Unwilling to give visibility into revenue data</Cross>
            </div>
          </Spec>
        </div>
      </div>
    ),
  },
  // 5 — The guarantee
  {
    bar: "Section 05 · Guarantee",
    pill: "Manager placed · day 14",
    body: (
      <div className="w-full">
        <Mono className="mb-4">Section 05 · Guarantee</Mono>
        <H>
          Double the bottom line <Accent>in 60 days.</Accent>
        </H>
        <div className="mt-12">
          <GuaranteeLine />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-12 max-w-4xl items-stretch">
          <Stat value="14 days" label="Manager placed within 14 days of kickoff." accent />
          <Stat value="Day one" label="Full system live before the manager's first day, so they walk into a built operation rather than a blank CRM." />
        </div>
      </div>
    ),
  },
  // 6 — What's included (three pillars)
  {
    bar: "What's included",
    body: (
      <div className="w-full">
        <Mono className="mb-4">04 · What&apos;s included</Mono>
        <H size="md">
          The full sales operation. <Accent>Not a placement plus advice.</Accent>
        </H>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-8 items-stretch">
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
            <Spec key={pil.name}>
              <Icon name={pil.icon} className="text-[#0d9488] mb-3" />
              <Mono className="mb-3">{pil.name}</Mono>
              <div className="space-y-2">
                {pil.items.map((it) => (
                  <Check key={it}>{it}</Check>
                ))}
              </div>
            </Spec>
          ))}
        </div>
      </div>
    ),
  },
  // 7 — The 90-day arc
  {
    bar: "The 90-day arc",
    pill: "Build · Install · Release",
    body: (
      <div className="w-full">
        <Mono className="mb-4">06 · The 90-day arc</Mono>
        <H>
          Build. Install. <Accent>Release.</Accent>
        </H>
        <div className="mt-6">
          <ArcDrawing />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-4 items-stretch">
          {[
            { days: "Days 1–30", name: "Build", lead: "Diagnostic, scorecard, comp plan, CRM and Sequ3nce configuration, cadence and script build, reporting layer. Recruiting runs in parallel; the manager is placed by day 14." },
            { days: "Days 31–60", name: "Install", lead: "Manager onboarded into a finished system. Daily standups, call reviews, baselines set. We are in the room. This is the window the guarantee runs against.", accent: true },
            { days: "Days 61–90", name: "Release", lead: "Manager runs solo. We move to observation and weekly review. Handoff documentation, final performance readout, transition to the ongoing relationship." },
          ].map((ph) => (
            <Spec key={ph.name} accent={ph.accent}>
              <Mono ink={!ph.accent} className="mb-2">{ph.days}</Mono>
              <div className="font-extrabold text-xl text-[#0b1f1d] mb-2">{ph.name}</div>
              <p className="text-[13px] leading-relaxed text-[#2f3d3b]">{ph.lead}</p>
            </Spec>
          ))}
        </div>
      </div>
    ),
  },
  // 8 — Why Sequ3nce matters, with the manager's actual screen (sample data)
  {
    bar: "Why Sequ3nce matters",
    pill: "Sample account",
    body: (
      <div className="grid grid-cols-1 lg:grid-cols-[38%_1fr] gap-10 items-center w-full">
        <div>
          <Mono className="mb-4">07 · Why Sequ3nce matters</Mono>
          <H size="md">What separates this from consulting.</H>
          <P className="mt-5">
            Sequ3nce is our in-house sales sequencing and cadence software. The manager runs their team out of it. The owner reads their numbers out
            of it. Every cadence, pipeline stage, and performance metric lives there.
          </P>
          <div className="space-y-2 mt-5">
            {[
              "The owner gets real data instead of a rep's self-report.",
              "The system doesn't leave when the engagement ends.",
            ].map((line, n) => (
              <div key={line} className="flex items-start gap-3">
                <Mono className="mt-1">0{n + 1}</Mono>
                <span className="font-semibold text-[15px] leading-snug text-[#0b1f1d]">{line}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <Spec className="p-2 md:p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pitch/teams-performance.png" alt="" className="w-full block" />
          </Spec>
          <Mono ink className="mt-2 text-center">Sample account for illustration</Mono>
        </div>
      </div>
    ),
  },
  ...PRICING_SLIDES,
];
