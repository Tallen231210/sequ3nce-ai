import React from "react";
import type { Slide } from "../slides";
import { PRICING_SLIDES } from "./pricing";

// ============================================================================
// Slide content for the B2B pitch deck (/pitch/teams): Sales Ops & Management
// Placement. Same renderer and visual system as the closer deck (/pitch).
// Copy comes from the offer brief ("Sales Ops & Management Placement — Offer
// and Pricing Brief"); nothing here is invented, and the brief's internal-only
// section is deliberately not represented.
// ============================================================================

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-zinc-400 text-lg leading-relaxed max-w-[46ch]">{children}</p>
);

const H = ({ children }: { children: React.ReactNode }) => (
  <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">{children}</h1>
);

const Check = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 text-[13px] text-zinc-300">
    <span className="text-amber-300 mt-0.5">&#x2713;</span>
    <span>{children}</span>
  </div>
);

const Cross = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 text-[13px] text-zinc-400">
    <span className="text-zinc-600 mt-0.5">&#x2715;</span>
    <span>{children}</span>
  </div>
);

const card = (accent?: boolean) =>
  "rounded-2xl border p-6 flex flex-col " +
  (accent ? "border-amber-400/50 bg-amber-400/[0.05]" : "border-zinc-800 bg-zinc-900/60");

export const TEAMS_SLIDES: Slide[] = [
  // 1 — Cover
  {
    title: (
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Sequ3nce.ai" className="w-[74vw] max-w-[980px] mx-auto -mb-6 invert" />
        <div className="text-2xl md:text-3xl font-black tracking-[0.35em] text-amber-300 mb-8">FOR TEAMS</div>
        <div className="text-4xl md:text-5xl font-bold tracking-tight text-white leading-[1.05]">
          Sales Ops &amp;
          <br />
          Management Placement
        </div>
      </div>
    ),
    wide: true,
  },
  // 2 — The headline
  {
    kicker: "The offer",
    title: (
      <h1 className="text-3xl md:text-[2.6rem] font-bold tracking-tight text-center leading-[1.15] max-w-5xl">
        We place a fully-managed sales manager into your business in{" "}
        <span className="text-amber-300">14 days</span>, build the entire sales operation
        around them, and manage them for you{" "}
        <span className="text-amber-300">until your bottom line doubles.</span>
      </h1>
    ),
    wide: true,
  },
  // 3 — Not recruiting
  {
    kicker: "What this is not",
    title: <H>This is <span className="text-amber-300">not</span> recruiting.</H>,
    body: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl items-stretch">
        <div className={card()}>
          <div className="text-zinc-500 text-[12px] font-bold uppercase tracking-[0.2em] mb-3">A recruiter</div>
          <p className="text-white font-bold text-lg leading-snug mb-2">Hands over a résumé and disappears.</p>
        </div>
        <div className={card(true)}>
          <div className="text-amber-300 text-[12px] font-bold uppercase tracking-[0.2em] mb-3">Sequ3nce</div>
          <p className="text-white font-bold text-lg leading-snug mb-4">Hands over the whole operation.</p>
          <div className="space-y-2">
            <Check>A manager</Check>
            <Check>The software they run on</Check>
            <Check>The CRM and process architecture underneath them</Check>
            <Check>90 days of us managing that manager against KPI, so the hire actually takes</Check>
          </div>
        </div>
      </div>
    ),
    wide: true,
  },
  // 4 — Who this is for
  {
    kicker: "Who this is for",
    title: <H>Qualification floor: <span className="text-amber-300">$100,000/mo</span> cash collected.</H>,
    body: (
      <div className="w-full max-w-5xl">
        <p className="text-zinc-400 text-[15px] leading-relaxed text-center max-w-[70ch] mx-auto mb-6">
          That number is not arbitrary. A sales manager needs to earn five figures monthly
          or they churn out within a quarter, and below $100k/mo there isn&apos;t enough top
          line to support that comp.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          <div className={card(true)}>
            <div className="text-amber-300 text-[12px] font-bold uppercase tracking-[0.2em] mb-3">Best fit</div>
            <div className="space-y-2">
              <Check>$100k+/mo cash collected, high-ticket or mid-ticket offer</Check>
              <Check>Owner is currently the de facto sales manager and is the bottleneck</Check>
              <Check>Existing closer or setter team that is underperforming, unmanaged, or unmeasured</Check>
              <Check>No real CRM discipline, no reliable pipeline data, no idea which rep is actually good</Check>
            </div>
          </div>
          <div className={card()}>
            <div className="text-zinc-500 text-[12px] font-bold uppercase tracking-[0.2em] mb-3">Poor fit</div>
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
    title: <H>Double the bottom line <span className="text-amber-300">in 60 days.</span></H>,
    body: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-3xl items-stretch">
        <div className={card()}>
          <div className="text-amber-300 text-3xl font-bold mb-1">14 days</div>
          <p className="text-zinc-300 text-[14px]">Manager placed within 14 days of kickoff.</p>
        </div>
        <div className={card()}>
          <div className="text-amber-300 text-3xl font-bold mb-1">Day one</div>
          <p className="text-zinc-300 text-[14px]">
            Full system live before the manager&apos;s first day, so they walk into a built
            operation rather than a blank CRM.
          </p>
        </div>
      </div>
    ),
    wide: true,
  },
  // 6 — What's included (three pillars)
  {
    kicker: "What's included",
    title: <H>The full sales operation. <span className="text-amber-300">Not a placement plus advice.</span></H>,
    body: (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-6xl items-stretch">
        {[
          {
            n: "01",
            name: "Recruiting & Placement",
            items: [
              "Diligent, filtered recruiting process for the sales manager role",
              "Role scorecard and compensation plan design",
              "Closer recruiting and hiring where the team needs to be built or replaced",
              "Candidate vetting against the specific offer, price point, and sales motion",
            ],
          },
          {
            n: "02",
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
            n: "03",
            name: "Ongoing Management",
            items: [
              "We manage the manager. Weekly one-on-ones, call reviews, KPI accountability",
              "Performance diagnostics on every rep, not just aggregate revenue",
              "Direct reporting to the owner on what's working, what isn't, and who's at risk",
              "Iteration on scripts, cadences, and comp as the data comes in",
            ],
          },
        ].map((pil) => (
          <div key={pil.n} className={card()}>
            <div className="text-amber-300 text-[12px] font-black tracking-[0.25em] mb-3">{pil.n}</div>
            <div className="text-white font-bold text-[17px] mb-4">{pil.name}</div>
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
    title: <H>Build. Install. <span className="text-amber-300">Release.</span></H>,
    body: (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-6xl items-stretch">
        {[
          {
            days: "Days 1–30",
            name: "Build",
            lead: "Diagnostic, scorecard, comp plan, CRM and Sequ3nce configuration, cadence and script build, reporting layer. Recruiting runs in parallel; the manager is placed by day 14.",
          },
          {
            days: "Days 31–60",
            name: "Install",
            lead: "Manager onboarded into a finished system. Daily standups, call reviews, baselines set. We are in the room. This is the window the guarantee runs against.",
            accent: true,
          },
          {
            days: "Days 61–90",
            name: "Release",
            lead: "Manager runs solo. We move to observation and weekly review. Handoff documentation, final performance readout, transition to the ongoing relationship.",
          },
        ].map((ph) => (
          <div key={ph.name} className={card(ph.accent)}>
            <div className={"text-[12px] font-black tracking-[0.25em] mb-3 " + (ph.accent ? "text-amber-300" : "text-zinc-500")}>{ph.days}</div>
            <div className="text-white font-bold text-2xl mb-3">{ph.name}</div>
            <p className="text-zinc-400 text-[13.5px] leading-relaxed">{ph.lead}</p>
          </div>
        ))}
      </div>
    ),
    wide: true,
  },
  // 8 — Why Sequ3nce matters
  {
    kicker: "Why Sequ3nce matters",
    title: <H>What separates this <span className="text-amber-300">from consulting.</span></H>,
    body: (
      <div className="flex flex-col md:flex-row gap-10 items-center w-full max-w-5xl">
        <div className="flex-1 space-y-4">
          <P>Sequ3nce is our in-house sales sequencing and cadence software. The manager runs their team out of it. The owner reads their numbers out of it.</P>
          <P>Every cadence, pipeline stage, and performance metric lives there.</P>
        </div>
        <div className="w-full md:w-[380px] space-y-4">
          <div className={card(true)}>
            <div className="text-amber-300 text-[12px] font-black tracking-[0.25em] mb-2">01</div>
            <p className="text-white font-bold text-[16px] leading-snug">The owner gets real data instead of a rep&apos;s self-report.</p>
          </div>
          <div className={card(true)}>
            <div className="text-amber-300 text-[12px] font-black tracking-[0.25em] mb-2">02</div>
            <p className="text-white font-bold text-[16px] leading-snug">The system doesn&apos;t leave when the engagement ends.</p>
          </div>
        </div>
      </div>
    ),
    wide: true,
  },
  ...PRICING_SLIDES,
];
