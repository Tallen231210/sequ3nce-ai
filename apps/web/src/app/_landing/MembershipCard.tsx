"use client";

// ============================================================================
// One way in.
//
// This replaced three priced tiers (Overview / Oversight / Overwatch), and the
// reason matters more than the layout: we stopped selling software.
//
// What actually sells is the done-for-you engagement — we use Sequ3nce to run
// a client's sales floor. The software is the proof we know how, not the
// product. So the page no longer asks "which plan?", because a founder doing
// $100k a month is not shopping for a per-seat tool, and a price next to a
// feature list invites exactly that comparison.
//
// Deliberately absent, all of them load-bearing:
//   - No price. What a member pays depends on how much we do for them, and
//     quoting a number before that conversation prices the wrong thing.
//   - No tier names. They still exist in the product and still gate features;
//     they are an internal detail now, not a buying decision.
//   - No checkout link. /subscribe still works and is still how a member pays
//     once they're in — it just isn't the front door any more.
//
// The $100k/month bar is printed rather than implied. It disqualifies people
// in public, which is the thing that makes membership read as exclusive rather
// than merely expensive, and it means the calls that get booked are with
// people who already know they clear the bar.
// ============================================================================

import { Check, ArrowRight } from "lucide-react";
import { BookDemoButton } from "@/components/ui/calendly-modal";

/** What a member actually gets. Ordered by how much of their problem it takes off them. */
const INCLUDED = [
  {
    title: "The full Sequ3nce platform",
    detail:
      "Every call recorded, transcribed and read automatically. Your numbers, your closers, your funnel — without chasing anyone for them.",
  },
  {
    title: "Sequ3nce agents",
    detail:
      "Our AI, pointed at your funnel and your offer. Not available anywhere else, at any price.",
  },
  {
    title: "Done-for-you sales management",
    detail:
      "We run the floor day to day — targets, coaching, pipeline and the awkward conversations. You get the output, not another dashboard to check.",
  },
  {
    title: "Closer recruiting",
    detail:
      "We find, vet and onboard your closers, then ramp them on your own best calls.",
  },
  {
    title: "The room itself",
    detail:
      "A private community of 7-figure entrepreneurs using Sequ3nce to scale. Operators at your level, solving what you're solving.",
  },
];

export function MembershipCard() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="relative overflow-hidden rounded-3xl border border-zinc-950 bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.16)]">
        {/* Qualification bar. First thing read, on purpose — someone under it
            should know before they read the list of what they can't have. */}
        <div className="border-b border-zinc-100 bg-zinc-950 px-8 py-4 sm:px-12">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-400">
            By application · $100k per month minimum
          </p>
        </div>

        {/* Underscore, not a comma. `grid-cols-[1.15fr,1fr]` compiles to
            `grid-template-columns: 1.15fr,1fr`, which is invalid CSS — the
            browser drops it and the card silently stacks. */}
        <div className="grid gap-12 p-8 sm:p-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <h3 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Membership
            </h3>
            <p className="mt-4 text-[17px] leading-relaxed text-zinc-950">
              Sequ3nce isn&apos;t sold on its own. It comes with the people who
              built it running your sales floor alongside you.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-zinc-500">
              Members come in at different depths — some want the software and
              the room, others hand us the whole sales operation. That&apos;s
              what the call is for.
            </p>

            <div className="mt-10">
              <BookDemoButton size="lg" className="w-full justify-center sm:w-auto">
                See if you qualify
                <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
              </BookDemoButton>
              <p className="mt-4 text-[13px] leading-relaxed text-zinc-400">
                A conversation, not a demo. We&apos;ll work out together whether
                this is a fit — both ways.
              </p>
            </div>
          </div>

          <ul className="space-y-6">
            {INCLUDED.map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-950">
                  <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
                </span>
                <div>
                  <p className="text-[15px] font-medium leading-snug text-zinc-950">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
                    {item.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
