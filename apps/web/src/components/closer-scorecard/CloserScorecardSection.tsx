"use client";

// Data mount for the Closer Scorecard sub-tab (Team Performance). Owns the
// range state, the getRange query, and the lock/settings mutations — the
// whiteboard itself stays pure.

import React, { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../convex/_generated/api";
import {
  RangeControl,
  weekRange,
  type ScorecardRange,
} from "@/components/scorecard/RangeControl";
import { CloserScorecard } from "./CloserScorecard";
import type { CloserLedgerRow } from "./engine";
import type { RowExtras } from "./CloserLedgerTable";

function parseBaseline(json: string | null): CloserLedgerRow[] | null {
  if (!json) return null;
  try {
    const rows = JSON.parse(json);
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

export function CloserScorecardSection() {
  const { user } = useUser();
  const clerkId = user?.id;
  const weeks = useQuery(
    api.scorecard.listScorecardWeeks,
    clerkId ? { clerkId } : "skip",
  );
  const [range, setRange] = useState<ScorecardRange | null>(null);
  const activeRange = range ?? (weeks ? weekRange(weeks.currentWeek, true) : null);
  const data = useQuery(
    api.closerScorecard.getRange,
    clerkId && activeRange
      ? {
          clerkId,
          weekStart: activeRange.start,
          ...(activeRange.end ? { rangeEnd: activeRange.end } : {}),
        }
      : "skip",
  );
  const lock = useMutation(api.closerScorecard.lockCloserBaseline);
  const saveSettings = useMutation(api.closerScorecard.updateCloserScorecardSettings);
  const [settingsState, setSettingsState] = useState<"idle" | "saved" | "error">("idle");
  const settledTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!weeks || !data || !activeRange || !clerkId) return null;
  const rangeArgs = {
    weekStart: activeRange.start,
    ...(activeRange.end ? { rangeEnd: activeRange.end } : {}),
  };

  const actualRows: CloserLedgerRow[] = data.rows.map((r) => ({
    closerId: r.closerId,
    name: r.name,
    booked: r.booked,
    live: r.live,
    closes: r.closes,
    gross: r.gross,
    collected: r.collected,
    fub: r.fub,
    fus: r.fus,
    p1: r.p1,
    p2: r.p2,
    p3: r.p3,
  }));
  const extras = new Map<string, RowExtras>(
    data.rows.map((r) => [
      r.closerId,
      {
        filedDays: r.filedDays,
        expectedDays: r.expectedDays,
        missedDayKeys: r.missedDayKeys,
        callsCompleted: r.callsCompleted,
        callsConfirmed: r.callsConfirmed,
      },
    ]),
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-end">
        <RangeControl
          weeks={weeks.weeks}
          currentWeek={weeks.currentWeek}
          value={activeRange}
          onChange={setRange}
        />
      </div>
      <CloserScorecard
        actualRows={actualRows}
        savedBaselineRows={parseBaseline(data.baseline?.rows ?? null)}
        extras={extras}
        settings={data.settings}
        settingsState={settingsState}
        weekLabel={activeRange.label}
        onLockBaseline={(rowsJson) =>
          void lock({ clerkId, ...rangeArgs, rows: rowsJson })
        }
        onSettingsSave={(patch) => {
          void saveSettings({ clerkId, ...patch })
            .then(() => setSettingsState("saved"))
            .catch(() => setSettingsState("error"));
          if (settledTimer.current) clearTimeout(settledTimer.current);
          settledTimer.current = setTimeout(() => setSettingsState("idle"), 2000);
        }}
      />
    </div>
  );
}
