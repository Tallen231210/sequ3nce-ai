import React from "react";
import type { Slide } from "../slides";
import { Accent, Check, H, Icon, Label, Stat, card } from "./theme";
import { LoadBar, TotalsBars } from "./visuals";

// ============================================================================
// Pricing, manager compensation, client obligations and the close for the
// B2B deck (/pitch/teams). Figures are the offer brief's, verbatim. The two
// structures are presented as equals — the brief describes them as the same
// delivery with different risk allocation and names no preferred one.
// ============================================================================

const Row = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
  <div className="flex items-baseline justify-between gap-4 py-2 border-b border-zinc-200 last:border-b-0">
    <div>
      <div className="text-zinc-700 text-[14px]">{label}</div>
      {sub && <div className="text-zinc-400 text-[12px] mt-0.5">{sub}</div>}
    </div>
    <div className="text-zinc-900 font-bold text-[18px] whitespace-nowrap tabular-nums">{value}</div>
  </div>
);

export const PRICING_SLIDES: Slide[] = [
  // Pricing — two structures
  {
    kicker: "Pricing",
    title: <H compact>Two structures. Same delivery, <Accent>different risk allocation.</Accent></H>,
    body: (
      <div className="w-full max-w-5xl flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          <div className={card()}>
            <Label>Option A</Label>
            <div className="text-zinc-900 font-bold text-2xl mb-3 -mt-1">Build &amp; Software</div>
            <Row label="90-day build and placement" value="$30,000" sub="40 / 30 / 30 across the 90 days" />
            <Row label="Sequ3nce + reporting, ongoing" value={<>$3,000<span className="text-sm text-zinc-400">/mo</span></>} sub="12-month term" />
            <Row label="Sequ3nce scales with the team" value={<span className="text-[14px] font-semibold">$3k · $4k · $5k</span>} sub="1–5 reps · 6–12 · 13+" />
            <p className="text-zinc-400 text-[12px] mt-3">10% discount for build paid in full at signing.</p>
          </div>
          <div className={card()}>
            <Label>Option B</Label>
            <div className="text-zinc-900 font-bold text-2xl mb-3 -mt-1">Build &amp; Revenue Share</div>
            <Row label="90-day build and placement" value="$12,500" sub="60 / 20 / 20 across the 90 days" />
            <Row label="Ongoing" value={<>5%<span className="text-sm text-zinc-400"> of cash collected</span></>} sub="12-month minimum · requires $100k/mo" />
            <Row label="Sequ3nce" value={<span className="text-[15px] font-semibold text-teal-600">Included</span>} />
            <Row label="Steps down as you scale" value={<span className="text-[14px] font-semibold">5% · 4% · 3%</span>} sub="to $250k/mo · $250k–$500k · above $500k" />
          </div>
        </div>
        <div className={card()}>
          <Label>First-year total</Label>
          <TotalsBars
            rows={[
              { label: "Option A, entry tier", value: 57000, accent: true },
              { label: "Option B at $100k/mo", value: 72500 },
              { label: "Option B at $150k/mo", value: 92500 },
            ]}
          />
        </div>
      </div>
    ),
    wide: true,
  },
  // Manager compensation
  {
    kicker: "Manager compensation",
    title: <H>Paid by you, directly to the manager: <Accent>$3,000 base + 7%</Accent> of cash collected.</H>,
    body: (
      <div className="w-full max-w-4xl flex flex-col gap-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          <Stat value={<>$10,000<span className="text-base text-zinc-400 font-semibold">/mo</span></>} label="At a $100k/mo client — the floor that keeps a good manager in the seat. The base protects them in a soft month, which is the single biggest cause of manager churn in this model." />
          <Stat value={<>12%<span className="text-base text-zinc-500 font-semibold"> + $3,000 base</span></>} label="Total sales load under Option B. One number: a sales department, not a stack of fees." accent />
        </div>
        <div className={card()}>
          <Label>Where the 12% goes</Label>
          <LoadBar />
        </div>
      </div>
    ),
    wide: true,
  },
  // Client obligations
  {
    kicker: "What we need from you",
    title: <H>Four commitments. <Accent>They protect the guarantee.</Accent></H>,
    body: (
      <div className="w-full max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-stretch">
          {[
            { icon: "database", text: "Sequ3nce is the source of truth for cash collected; we get read access." },
            { icon: "lock", text: "The comp plan stays intact for the engagement term. If the manager's comp changes, the guarantee voids." },
            { icon: "flow", text: "Lead flow is maintained at or above the level present at kickoff." },
            { icon: "calendar", text: "The owner attends the weekly review." },
          ].map((o) => (
            <div key={o.icon} className={card()}>
              <Icon name={o.icon} className="text-teal-600 mb-3" />
              <p className="text-zinc-700 text-[13.5px] leading-relaxed">{o.text}</p>
            </div>
          ))}
        </div>
        <p className="text-zinc-500 text-[12.5px] mt-5 text-center">
          <span className="text-zinc-800 font-semibold">Cash collected</span> is defined as net of refunds and
          chargebacks, gross of processing fees.
        </p>
      </div>
    ),
    wide: true,
  },
  // Close
  {
    kicker: "The close",
    title: <H>Which structure <Accent>fits your business?</Accent></H>,
    body: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl items-stretch">
        <div className={card(true)}>
          <Label accent>Option A — Build &amp; Software</Label>
          <div className="text-4xl font-bold text-zinc-900">$30,000</div>
          <p className="text-zinc-500 text-[13px] mt-2">+ $3,000/mo Sequ3nce, 12-month term</p>
          <div className="mt-5 space-y-2">
            <Check>Manager placed in 14 days</Check>
            <Check>Full system built before day one</Check>
            <Check>90 days of us managing the manager</Check>
            <Check>Fixed fees; no share of cash collected</Check>
          </div>
        </div>
        <div className={card(true)}>
          <Label accent>Option B — Build &amp; Revenue Share</Label>
          <div className="text-4xl font-bold text-zinc-900">$12,500</div>
          <p className="text-zinc-500 text-[13px] mt-2">+ 5% of cash collected, 12-month minimum · Sequ3nce included</p>
          <div className="mt-5 space-y-2">
            <Check>Manager placed in 14 days</Check>
            <Check>Full system built before day one</Check>
            <Check>90 days of us managing the manager</Check>
            <Check>Lower build fee; 5% of cash collected instead</Check>
          </div>
        </div>
      </div>
    ),
    wide: true,
  },
];
