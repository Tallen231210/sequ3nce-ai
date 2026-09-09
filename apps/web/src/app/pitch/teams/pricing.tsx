import React from "react";
import type { Slide } from "../slides";

// ============================================================================
// Pricing, manager compensation, client obligations and the close for the
// B2B deck (/pitch/teams). Figures are the offer brief's, verbatim. The two
// structures are presented as equals — the brief describes them as the same
// delivery with different risk allocation and names no preferred one.
// ============================================================================

const H = ({ children }: { children: React.ReactNode }) => (
  <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">{children}</h1>
);

const Row = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-zinc-800 last:border-b-0">
    <div>
      <div className="text-zinc-300 text-[14px]">{label}</div>
      {sub && <div className="text-zinc-500 text-[12px] mt-0.5">{sub}</div>}
    </div>
    <div className="text-white font-bold text-[18px] whitespace-nowrap tabular-nums">{value}</div>
  </div>
);

const Check = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 text-[13px] text-zinc-300">
    <span className="text-amber-300 mt-0.5">&#x2713;</span>
    <span>{children}</span>
  </div>
);

export const PRICING_SLIDES: Slide[] = [
  // Pricing — two structures
  {
    kicker: "Pricing",
    title: <H>Two structures. Same delivery, <span className="text-amber-300">different risk allocation.</span></H>,
    body: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl items-stretch">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-7 flex flex-col">
          <div className="text-zinc-400 text-[12px] font-bold uppercase tracking-[0.2em] mb-1">Option A</div>
          <div className="text-white font-bold text-2xl mb-5">Build &amp; Software</div>
          <Row label="90-day build and placement" value="$30,000" sub="40 / 30 / 30 across the 90 days" />
          <Row label="Sequ3nce + reporting, ongoing" value={<>$3,000<span className="text-sm text-zinc-500">/mo</span></>} sub="12-month term" />
          <Row label="Sequ3nce scales with the team" value={<span className="text-[14px] font-semibold">$3k · $4k · $5k</span>} sub="1–5 reps · 6–12 · 13+" />
          <div className="mt-auto pt-5">
            <div className="text-zinc-400 text-[12px] uppercase tracking-wider">First-year total, entry tier</div>
            <div className="text-amber-300 font-bold text-3xl mt-1">$57,000</div>
            <p className="text-zinc-500 text-[12px] mt-2">10% discount for build paid in full at signing.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-7 flex flex-col">
          <div className="text-zinc-400 text-[12px] font-bold uppercase tracking-[0.2em] mb-1">Option B</div>
          <div className="text-white font-bold text-2xl mb-5">Build &amp; Revenue Share</div>
          <Row label="90-day build and placement" value="$12,500" sub="60 / 20 / 20 across the 90 days" />
          <Row label="Ongoing" value={<>5%<span className="text-sm text-zinc-500"> of cash collected</span></>} sub="12-month minimum · requires $100k/mo" />
          <Row label="Sequ3nce" value={<span className="text-[15px] font-semibold text-amber-300">Included</span>} />
          <Row label="Steps down as you scale" value={<span className="text-[14px] font-semibold">5% · 4% · 3%</span>} sub="to $250k/mo · $250k–$500k · above $500k" />
          <div className="mt-auto pt-5">
            <div className="text-zinc-400 text-[12px] uppercase tracking-wider">First-year total</div>
            <div className="flex items-baseline gap-4 mt-1">
              <div><span className="text-amber-300 font-bold text-3xl">$72,500</span><span className="text-zinc-500 text-[12px] ml-2">at $100k/mo</span></div>
              <div><span className="text-white font-bold text-2xl">$92,500</span><span className="text-zinc-500 text-[12px] ml-2">at $150k/mo</span></div>
            </div>
          </div>
        </div>
      </div>
    ),
    wide: true,
  },
  // Manager compensation
  {
    kicker: "Manager compensation",
    title: <H>Paid by you, directly to the manager: <span className="text-amber-300">$3,000 base + 7%</span> of cash collected.</H>,
    body: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl items-stretch">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-7 flex flex-col">
          <div className="text-zinc-400 text-[12px] uppercase tracking-wider mb-1">At a $100k/mo client</div>
          <div className="text-white font-bold text-4xl">$10,000<span className="text-base text-zinc-500">/mo</span></div>
          <p className="text-zinc-400 text-[13.5px] leading-relaxed mt-4">
            The floor that keeps a good manager in the seat. The base protects them in a
            soft month, which is the single biggest cause of manager churn in this model.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-400/50 bg-amber-400/[0.05] p-7 flex flex-col">
          <div className="text-amber-300 text-[12px] uppercase tracking-wider mb-1">Total sales load under Option B</div>
          <div className="text-white font-bold text-4xl">12%<span className="text-base text-zinc-400"> + $3,000 base</span></div>
          <p className="text-zinc-400 text-[13.5px] leading-relaxed mt-4">
            One number: a sales department, not a stack of fees. 5% to us, 7% to the manager,
            plus the manager&apos;s base.
          </p>
        </div>
      </div>
    ),
    wide: true,
  },
  // Client obligations
  {
    kicker: "What we need from you",
    title: <H>Four commitments. <span className="text-amber-300">They protect the guarantee.</span></H>,
    body: (
      <div className="w-full max-w-3xl">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-7 space-y-3">
          <Check>Sequ3nce is the source of truth for cash collected; we get read access.</Check>
          <Check>The comp plan stays intact for the engagement term. If the manager&apos;s comp changes, the guarantee voids.</Check>
          <Check>Lead flow is maintained at or above the level present at kickoff.</Check>
          <Check>The owner attends the weekly review.</Check>
        </div>
        <p className="text-zinc-500 text-[12.5px] mt-4 text-center">
          <span className="text-zinc-300 font-semibold">Cash collected</span> is defined as net of refunds and
          chargebacks, gross of processing fees.
        </p>
      </div>
    ),
    wide: true,
  },
  // Close
  {
    kicker: "The close",
    title: <H>Which structure <span className="text-amber-300">fits your business?</span></H>,
    body: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl items-stretch">
        <div className="rounded-2xl border-2 border-amber-400/70 bg-amber-400/[0.06] p-7 flex flex-col">
          <div className="text-amber-300 text-[12px] font-bold uppercase tracking-[0.2em] mb-2">Option A — Build &amp; Software</div>
          <div className="text-4xl font-bold text-white">$30,000</div>
          <p className="text-zinc-400 text-[13px] mt-2">+ $3,000/mo Sequ3nce, 12-month term</p>
          <div className="mt-5 space-y-2">
            <Check>Manager placed in 14 days</Check>
            <Check>Full system built before day one</Check>
            <Check>90 days of us managing the manager</Check>
            <Check>Fixed fees; no share of cash collected</Check>
          </div>
        </div>
        <div className="rounded-2xl border-2 border-amber-400/70 bg-amber-400/[0.06] p-7 flex flex-col">
          <div className="text-amber-300 text-[12px] font-bold uppercase tracking-[0.2em] mb-2">Option B — Build &amp; Revenue Share</div>
          <div className="text-4xl font-bold text-white">$12,500</div>
          <p className="text-zinc-400 text-[13px] mt-2">+ 5% of cash collected, 12-month minimum · Sequ3nce included</p>
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
