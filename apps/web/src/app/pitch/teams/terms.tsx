import React from "react";
import type { TeamSlide } from "./BlueprintDeck";
import { Accent, H, Icon, Mono, Spec } from "./theme";

// ============================================================================
// The client's four commitments. Sits right after the guarantee, since that is
// what they protect — and before any money is discussed, so the money slides
// run uninterrupted from manager pay to our pricing to the decision.
// ============================================================================

export const COMMITMENTS_SLIDE: TeamSlide = {
  bar: "What we need from you",
  pill: "Four commitments",
  body: (
    <div className="w-full">
      <Mono className="mb-4">05 · What we need from you</Mono>
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
};
