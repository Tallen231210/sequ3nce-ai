"use client";

// Zion's editable scorecard: projections for meetings. The locked baseline
// and CDPBC persist per week; the scenario itself is a whiteboard.

import React, { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../../convex/_generated/api";
import { Scorecard } from "@/components/scorecard/Scorecard";
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
  const [week, setWeek] = useState<string | null>(null);
  const activeWeek = week ?? weeks?.currentWeek ?? null;
  const data = useQuery(
    api.scorecard.getScorecardWeek,
    clerkId && activeWeek ? { clerkId, weekStart: activeWeek } : "skip",
  );
  const lock = useMutation(api.scorecard.lockBaseline);

  if (!weeks || !data || !activeWeek || !clerkId) return null;

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Scorecard & projections</h2>
        <select
          value={activeWeek}
          onChange={(e) => setWeek(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-[12px]"
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
        savedBaselineRows={parseBaseline(data.baseline?.rows ?? null)}
        savedCdpbc={data.baseline?.cdpbc ?? null}
        mode="manager"
        weekLabel={activeWeek}
        onLockBaseline={(rowsJson) =>
          void lock({ clerkId, weekStart: activeWeek, rows: rowsJson })
        }
        onCdpbcSave={(v) => void lock({ clerkId, weekStart: activeWeek, cdpbc: v })}
      />
    </div>
  );
}
