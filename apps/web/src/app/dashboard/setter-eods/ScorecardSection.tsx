"use client";

// Zion's editable scorecard: projections for meetings. The locked baseline
// and CDPBC persist per week; the scenario itself is a whiteboard.

import React, { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../../convex/_generated/api";
import { Scorecard } from "@/components/scorecard/Scorecard";
import { RangeControl, weekRange, type ScorecardRange } from "@/components/scorecard/RangeControl";
import type { LedgerRow } from "@/components/scorecard/engine";

function parseBaseline(json: string | null): LedgerRow[] | null {
  if (!json) return null;
  try {
    const rows = JSON.parse(json);
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

export function ScorecardSection() {
  const { user } = useUser();
  const clerkId = user?.id;
  const weeks = useQuery(
    api.scorecard.listScorecardWeeks,
    clerkId ? { clerkId } : "skip",
  );
  const [range, setRange] = useState<ScorecardRange | null>(null);
  const activeRange =
    range ?? (weeks ? weekRange(weeks.currentWeek, true) : null);
  const data = useQuery(
    api.scorecard.getScorecardWeek,
    clerkId && activeRange
      ? {
          clerkId,
          weekStart: activeRange.start,
          ...(activeRange.end ? { rangeEnd: activeRange.end } : {}),
        }
      : "skip",
  );
  const lock = useMutation(api.scorecard.lockBaseline);

  if (!weeks || !data || !activeRange || !clerkId) return null;
  const rangeArgs = {
    weekStart: activeRange.start,
    ...(activeRange.end ? { rangeEnd: activeRange.end } : {}),
  };

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Scorecard & projections</h2>
        <RangeControl
          weeks={weeks.weeks}
          currentWeek={weeks.currentWeek}
          value={activeRange}
          onChange={setRange}
        />
      </div>
      <Scorecard
        actualRows={data.rows}
        savedBaselineRows={parseBaseline(data.baseline?.rows ?? null)}
        savedCdpbc={data.baseline?.cdpbc ?? null}
        mode="manager"
        weekLabel={activeRange.label}
        onLockBaseline={(rowsJson) =>
          void lock({ clerkId, ...rangeArgs, rows: rowsJson })
        }
        onCdpbcSave={(v) => void lock({ clerkId, ...rangeArgs, cdpbc: v })}
      />
    </div>
  );
}
