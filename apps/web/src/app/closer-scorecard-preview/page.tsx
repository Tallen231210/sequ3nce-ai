"use client";

/**
 * DEV-ONLY visual preview for the Closer Scorecard.
 *
 * Renders the real whiteboard against the reference HTML's SEED so the
 * design can be reviewed without a signed-in session (the tp-preview
 * pattern). Returns 404 in production builds.
 */

import { useState } from "react";
import { notFound } from "next/navigation";
import { CloserScorecard } from "@/components/closer-scorecard/CloserScorecard";
import type { CloserLedgerRow } from "@/components/closer-scorecard/engine";
import type { RowExtras } from "@/components/closer-scorecard/CloserLedgerTable";
import type { ScorecardSettings } from "@/components/closer-scorecard/SettingsRow";

const SEED: CloserLedgerRow[] = [
  { closerId: "1", name: "Closer 1", booked: 60, live: 36, closes: 7, gross: 74600, collected: 61000, fub: 14, fus: 9, p1: 8, p2: 20, p3: 8 },
  { closerId: "2", name: "Closer 2", booked: 58, live: 30, closes: 4, gross: 33200, collected: 24000, fub: 12, fus: 4, p1: 18, p2: 10, p3: 2 },
  { closerId: "3", name: "Closer 3", booked: 55, live: 35, closes: 6, gross: 58800, collected: 52000, fub: 11, fus: 7, p1: 6, p2: 22, p3: 7 },
  { closerId: "4", name: "Closer 4", booked: 52, live: 24, closes: 3, gross: 20400, collected: 13600, fub: 9, fus: 3, p1: 14, p2: 9, p3: 1 },
];

const EXTRAS = new Map<string, RowExtras>([
  ["1", { filedDays: 5, expectedDays: 5, missedDayKeys: [], callsCompleted: 36, callsConfirmed: 34 }],
  ["2", { filedDays: 3, expectedDays: 5, missedDayKeys: ["2026-08-26", "2026-08-28"], callsCompleted: 30, callsConfirmed: 11 }],
  ["3", { filedDays: 5, expectedDays: 5, missedDayKeys: [], callsCompleted: 35, callsConfirmed: 35 }],
  ["4", { filedDays: 0, expectedDays: 4, missedDayKeys: ["2026-08-24", "2026-08-25", "2026-08-27", "2026-08-28"], callsCompleted: 24, callsConfirmed: 0 }],
]);

export default function CloserScorecardPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  const [settings, setSettings] = useState<ScorecardSettings>({
    tierPrices: [6800, 9800, 20000],
    costPerBookedCall: 200,
    targetCdpbc: 800,
  });

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <CloserScorecard
        actualRows={SEED}
        savedBaselineRows={null}
        extras={EXTRAS}
        settings={settings}
        settingsState="idle"
        weekLabel="Aug 22 – Aug 28 (preview fixture)"
        onLockBaseline={() => {}}
        onSettingsSave={(patch) =>
          setSettings((s) => ({
            tierPrices: patch.tierPrices !== undefined ? patch.tierPrices : s.tierPrices,
            costPerBookedCall:
              patch.costPerBookedCall !== undefined ? patch.costPerBookedCall : s.costPerBookedCall,
            targetCdpbc: patch.targetCdpbc !== undefined ? patch.targetCdpbc : s.targetCdpbc,
          }))
        }
      />
    </div>
  );
}
