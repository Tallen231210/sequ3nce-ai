import React from "react";
import type { TeamSlide } from "./BlueprintDeck";
import { Accent, Check, DISPLAY_FONT, H, Icon, Line, Mono, Spec, Stat } from "./theme";
import { LoadBar, TotalsBars } from "./visuals";

// ============================================================================
// Pricing, manager compensation, client obligations and the close for the
// B2B deck (/pitch/teams), drawn as spec sheets. Figures are the offer
// brief's, verbatim. The two structures are presented as equals — the brief
// describes them as the same delivery with different risk allocation and
// names no preferred one.
// ============================================================================

export const PRICING_SLIDES: TeamSlide[] = [
  // Pricing — two structures
  {
    bar: "Spec sheet · Pricing",
    pill: "Two structures · same delivery",
    body: (
      <div className="w-full">
        <Mono className="mb-3">08 · Pricing</Mono>
        <H size="sm">
          Two structures. Same delivery, <Accent>different risk allocation.</Accent>
        </H>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6 items-stretch">
          <Spec>
            <Mono className="mb-2">Option A · Build &amp; Software</Mono>
            <Line label="90-day build and placement" sub="40 / 30 / 30 across the 90 days" value="$30,000" />
            <Line label="Sequ3nce + reporting, ongoing" sub="12-month term" value="$3,000/mo" />
            <Line label="Sequ3nce scales with the team" sub="1–5 reps · 6–12 · 13+" value="$3k · $4k · $5k" />
            <Mono ink caps={false} className="mt-3">10% discount for build paid in full at signing.</Mono>
          </Spec>
          <Spec>
            <Mono className="mb-2">Option B · Build &amp; Revenue Share</Mono>
            <Line label="90-day build and placement" sub="60 / 20 / 20 across the 90 days" value="$12,500" />
            <Line label="Ongoing" sub="12-month minimum · requires $100k/mo" value="5% of cash collected" />
            <Line label="Sequ3nce" value={<span className="text-[#0d9488]">Included</span>} />
            <Line label="Steps down as you scale" sub="to $250k/mo · $250k–$500k · above $500k" value="5% · 4% · 3%" />
          </Spec>
        </div>
        <Spec className="mt-5 py-4 md:py-4">
          <Mono className="mb-3">First-year total</Mono>
          <TotalsBars
            rows={[
              { label: "Option A, entry tier", value: 57000, accent: true },
              { label: "Option B at $100k/mo", value: 72500 },
              { label: "Option B at $150k/mo", value: 92500 },
            ]}
          />
        </Spec>
      </div>
    ),
  },
  // Manager compensation — the manager's 7–10% of cash collected is paid by the client
  // straight to the manager; the $3,000/mo is Sequ3nce's software-and-systems
  // fee, not a manager base (Tyler's correction 2026-09-09; the brief had this wrong).
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
  // Client obligations
  {
    bar: "What we need from you",
    pill: "Four commitments",
    body: (
      <div className="w-full">
        <Mono className="mb-4">10 · What we need from you</Mono>
        <H size="md">
          Four commitments. <Accent>They protect the guarantee.</Accent>
        </H>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8 items-stretch">
          {[
            { icon: "database", n: "01", text: "Sequ3nce is the source of truth for cash collected; we get read access." },
            { icon: "lock", n: "02", text: "The comp plan stays intact for the engagement term. If the manager's comp changes, the guarantee voids." },
            { icon: "flow", n: "03", text: "Lead flow is maintained at or above the level present at kickoff." },
            { icon: "calendar", n: "04", text: "The owner attends the weekly review." },
          ].map((o) => (
            <Spec key={o.n}>
              <div className="flex items-center justify-between mb-3">
                <Icon name={o.icon} className="text-[#0d9488]" />
                <Mono ink>{o.n}</Mono>
              </div>
              <p className="text-[13.5px] leading-relaxed text-[#2f3d3b]">{o.text}</p>
            </Spec>
          ))}
        </div>
        <Mono ink caps={false} className="mt-6 text-[12px]">
          <b className="text-[#0b1f1d] font-semibold">Cash collected</b> is defined as net of refunds and chargebacks, gross of processing fees.
        </Mono>
      </div>
    ),
  },
  // Two ways to start (prospect-facing; never "the close" — that is our language, not theirs)
  {
    bar: "Two ways to start",
    body: (
      <div className="w-full">
        <Mono className="mb-4">11 · Two ways to start</Mono>
        <H>
          Which structure <Accent>fits your business?</Accent>
        </H>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 max-w-4xl items-stretch">
          {[
            {
              label: "Option A — Build & Software",
              price: "$30,000",
              sub: "+ $3,000/mo Sequ3nce, 12-month term",
              last: "Fixed fees; no share of cash collected",
            },
            {
              label: "Option B — Build & Revenue Share",
              price: "$12,500",
              sub: "+ 5% of cash collected, 12-month minimum · Sequ3nce included",
              last: "Lower build fee; 5% of cash collected instead",
            },
          ].map((o) => (
            <Spec key={o.label} accent>
              <Mono className="mb-3">{o.label}</Mono>
              <div className="text-4xl font-extrabold tracking-[-0.03em] text-[#0b1f1d]" style={{ fontFamily: DISPLAY_FONT }}>
                {o.price}
              </div>
              <Mono ink caps={false} className="mt-2">{o.sub}</Mono>
              <div className="mt-5 space-y-2">
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
