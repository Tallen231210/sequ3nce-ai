import React from "react";
import type { TeamSlide } from "./BlueprintDeck";
import { Accent, Check, DISPLAY_FONT, H, Line, Mono, Note, Spec, Stat } from "./theme";
import { LoadBar } from "./visuals";

// ============================================================================
// The money slides of the B2B deck (/pitch/teams), in one uninterrupted run:
// what the manager is paid, what we charge, and the decision slide — the one
// place with the full all-in numbers per option. Figures are the offer
// brief's, verbatim, except manager compensation, which is Tyler's correction
// (7–10% of cash collected to the manager; the $3,000/mo is our software
// fee, not a manager base). The two structures are presented as equals.
// ============================================================================

const OPTIONS = [
  {
    label: "Option A — Build & Software",
    price: "$30,000",
    lines: [
      { label: "To Sequ3nce, ongoing", sub: "12-month term", value: "$3,000/mo" },
      { label: "To your manager", value: "7–10% of cash collected" },
    ],
    firstYear: "First year to Sequ3nce: $57,000 at the entry tier.",
    last: "Fixed fees to Sequ3nce; no share of cash collected",
  },
  {
    label: "Option B — Build & Revenue Share",
    price: "$12,500",
    lines: [
      { label: "To Sequ3nce, ongoing", sub: "Sequ3nce included · 12-month minimum", value: "5% of cash collected" },
      { label: "To your manager", value: "7–10% of cash collected" },
      { label: "Total load", value: "12–15% of cash collected", accent: true },
    ],
    firstYear: "First year to Sequ3nce: $72,500 at $100k/mo · $92,500 at $150k/mo.",
    last: "Lower build fee; 5% of cash collected to Sequ3nce instead",
  },
];

export const PRICING_SLIDES: TeamSlide[] = [
  // Manager compensation — the manager's 7–10% of cash collected is paid by the
  // client straight to the manager; the $3,000/mo is Sequ3nce's software-and-
  // systems fee, not a manager base (Tyler's correction 2026-09-09).
  {
    bar: "Manager compensation",
    pill: "7–10% of cash collected",
    body: (
      <div className="w-full">
        <Mono className="mb-4">09 · Manager compensation</Mono>
        <H size="md" className="max-w-[30ch]">
          Paid by you, directly to the manager: <Accent><span className="whitespace-nowrap">7–10% of cash collected.</span></Accent>
        </H>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-8 max-w-4xl items-stretch">
          <Stat
            value="7–10%"
            label="Of cash collected, paid by you straight to the manager. At a $100k/mo client that is $7,000–$10,000 a month, which keeps a good manager in the seat."
          />
          <Stat
            value={
              <>
                12–15%<span className="text-base text-[#4b5a58] font-semibold"> under Option B</span>
              </>
            }
            label="Total sales load: our 5% plus the manager's 7–10%, with Sequ3nce included. One number: a sales department, not a stack of fees."
            accent
          />
        </div>
        <Spec className="mt-5 max-w-4xl">
          <Mono className="mb-4">Where the money goes</Mono>
          <LoadBar />
        </Spec>
      </div>
    ),
  },
  // Pricing — the two structures, headline numbers only; detail in footnotes
  {
    bar: "Pricing",
    pill: "Two structures · same delivery",
    body: (
      <div className="w-full">
        <Mono className="mb-3">10 · Pricing</Mono>
        <H size="sm">
          Two structures. Same delivery, <Accent>different risk allocation.</Accent>
        </H>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6 items-stretch">
          <Spec>
            <Mono className="mb-2">Option A · Build &amp; Software</Mono>
            <Line label="90-day build and placement" sub="40 / 30 / 30 across the 90 days" value="$30,000" />
            <Line label="Sequ3nce + reporting, ongoing" sub="12-month term" value="$3,000/mo" />
            <Mono ink caps={false} className="mt-4 leading-relaxed">
              Sequ3nce scales with the team: $3k · $4k · $5k per month for 1–5 · 6–12 · 13+ reps. 10% discount for build paid in full at signing.
            </Mono>
          </Spec>
          <Spec>
            <Mono className="mb-2">Option B · Build &amp; Revenue Share</Mono>
            <Line label="90-day build and placement" sub="60 / 20 / 20 across the 90 days" value="$12,500" />
            <Line label="Ongoing, Sequ3nce included" sub="12-month minimum · requires $100k/mo" value="5% of cash collected" />
            <Mono ink caps={false} className="mt-4 leading-relaxed">
              Steps down as you scale: 5% to $250k/mo · 4% from $250k to $500k · 3% above $500k.
            </Mono>
          </Spec>
        </div>
        <Note className="mt-5 max-w-3xl">
          Either way, your manager&apos;s <b>7–10% of cash collected</b> is paid by you, directly to them, on top of this.
        </Note>
      </div>
    ),
  },
  // Two ways to start — the one slide with the full all-in numbers per option
  {
    bar: "Two ways to start",
    pill: "All-in, per option",
    body: (
      <div className="w-full">
        <Mono className="mb-4">11 · Two ways to start</Mono>
        <H>
          Which structure <Accent>fits your business?</Accent>
        </H>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 max-w-5xl items-stretch">
          {OPTIONS.map((o) => (
            <Spec key={o.label} accent>
              <Mono className="mb-3">{o.label}</Mono>
              <div className="text-4xl font-extrabold tracking-[-0.03em] text-[#0b1f1d]" style={{ fontFamily: DISPLAY_FONT }}>
                {o.price}
              </div>
              <Mono ink caps={false} className="mt-1 mb-3">90-day build and placement</Mono>
              <div className="border-t border-[#b9d6d1] pt-1">
                {o.lines.map((l) => (
                  <Line key={l.label} label={l.label} sub={l.sub} value={l.value} accent={l.accent} />
                ))}
              </div>
              <Mono ink caps={false} className="mt-3">{o.firstYear}</Mono>
              <div className="mt-4 space-y-2">
                <Check>Manager placed in 14 days</Check>
                <Check>Full system built before day one</Check>
                <Check>90 days of us managing the manager</Check>
                <Check>{o.last}</Check>
              </div>
            </Spec>
          ))}
        </div>
      </div>
    ),
  },
];
