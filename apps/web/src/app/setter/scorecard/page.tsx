"use client";

// The team's week, read-only. The sandbox lives one tab over.

import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Scorecard } from "@/components/scorecard/Scorecard";
import { useSetter } from "../_components/SetterContext";

export default function SetterScorecardPage() {
  const { sessionToken } = useSetter();
  const weeks = useQuery(api.scorecard.listScorecardWeeks, { sessionToken });
  const [week, setWeek] = useState<string | null>(null);
  const activeWeek = week ?? weeks?.currentWeek ?? null;
  const data = useQuery(
    api.scorecard.getScorecardWeek,
    activeWeek ? { sessionToken, weekStart: activeWeek } : "skip",
  );

  if (!weeks || !data || !activeWeek) {
    return <div className="py-16 text-center text-sm text-neutral-400">Loading…</div>;
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <select
          value={activeWeek}
          onChange={(e) => setWeek(e.target.value)}
          className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
        >
          {weeks.weeks.map((w: string) => (
            <option key={w} value={w}>
              week of Sat {w}
            </option>
          ))}
        </select>
      </div>
      <Scorecard
        actualRows={data.rows}
        savedBaselineRows={null}
        savedCdpbc={data.baseline?.cdpbc ?? null}
        mode="readonly"
        weekLabel={activeWeek}
      />
    </div>
  );
}
