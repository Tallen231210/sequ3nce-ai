"use client";

// The sandbox: play with YOUR numbers, watch the team totals move. Nothing
// here saves — by design.

import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Scorecard } from "@/components/scorecard/Scorecard";
import { RangeControl, weekRange, type ScorecardRange } from "@/components/scorecard/RangeControl";
import { useSetter } from "../_components/SetterContext";

export default function SetterProjectionsPage() {
  const { sessionToken } = useSetter();
  const weeks = useQuery(api.scorecard.listScorecardWeeks, { sessionToken });
  const [range, setRange] = useState<ScorecardRange | null>(null);
  const activeRange =
    range ?? (weeks ? weekRange(weeks.currentWeek, true) : null);
  const data = useQuery(
    api.scorecard.getScorecardWeek,
    activeRange
      ? {
          sessionToken,
          weekStart: activeRange.start,
          ...(activeRange.end ? { rangeEnd: activeRange.end } : {}),
        }
      : "skip",
  );

  if (!weeks || !data || !activeRange) {
    return <div className="py-16 text-center text-sm text-neutral-400">Loading…</div>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-neutral-500">
          Play with your own numbers — nothing here saves.
        </p>
        <RangeControl
          weeks={weeks.weeks}
          currentWeek={weeks.currentWeek}
          value={activeRange}
          onChange={setRange}
        />
      </div>
      <Scorecard
        actualRows={data.rows}
        savedBaselineRows={null}
        savedCdpbc={data.baseline?.cdpbc ?? null}
        mode="sandbox"
        ownRosterId={data.ownRosterId}
        weekLabel={activeRange.label}
      />
    </div>
  );
}
