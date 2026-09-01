"use client";

// The Closer Scorecard whiteboard — manager-only in v1 (spec non-goal:
// no closer-facing or sandbox mounts). Same discipline as the setter
// Scorecard: the scenario is a whiteboard; leaving the page returns to
// actuals; only the locked baseline persists (via callback). Rates snapshot
// when an edit session starts (focus) and hold until blur — recomputing per
// keystroke reads rates off the half-typed row and cascades zeros (the live
// bug found in the setter build; do not regress it).

import React, { useEffect, useRef, useState } from "react";
import {
  cascadeWith,
  ratesOf,
  teamSetCount,
  type CloserLedgerRow,
} from "./engine";
import { CloserLedgerTable, type RowExtras } from "./CloserLedgerTable";
import { TiersTable } from "./TiersTable";
import { WhatIfPanel } from "./WhatIfPanel";
import { SettingsRow, type ScorecardSettings } from "./SettingsRow";
import s from "../scorecard/scorecard.module.css";

export function CloserScorecard({
  actualRows,
  savedBaselineRows,
  extras,
  settings,
  settingsState,
  weekLabel,
  onLockBaseline,
  onSettingsSave,
}: {
  actualRows: CloserLedgerRow[];
  savedBaselineRows: CloserLedgerRow[] | null;
  extras: Map<string, RowExtras>;
  settings: ScorecardSettings;
  settingsState: "idle" | "saved" | "error";
  weekLabel: string;
  onLockBaseline: (rowsJson: string | null) => void;
  onSettingsSave: (patch: {
    tierPrices?: number[] | null;
    costPerBookedCall?: number | null;
    targetCdpbc?: number | null;
  }) => void;
}) {
  const [rows, setRows] = useState<CloserLedgerRow[]>(actualRows);
  const [baseline, setBaseline] = useState<CloserLedgerRow[]>(
    savedBaselineRows ?? actualRows,
  );

  // Range change / fresh data: reset the whiteboard to actuals.
  useEffect(() => {
    setRows(actualRows);
    setBaseline(savedBaselineRows ?? actualRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekLabel, JSON.stringify(actualRows), JSON.stringify(savedBaselineRows)]);

  const editBase = useRef<CloserLedgerRow[] | null>(null);
  function editStart() {
    if (!editBase.current) editBase.current = rows.map((r) => ({ ...r }));
  }
  function editEnd() {
    editBase.current = null;
  }

  function cellEdit(closerId: string, fieldIdx: number, value: number) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.closerId !== closerId) return r;
        const base = editBase.current?.find((b) => b.closerId === closerId) ?? r;
        return cascadeWith(base, fieldIdx, ratesOf(base), value);
      }),
    );
  }
  /** fub/fus/p1/p2/p3 — observations, not funnel stages: flat set, no cascade. */
  function extraEdit(
    closerId: string,
    key: "fub" | "fus" | "p1" | "p2" | "p3",
    value: number,
  ) {
    setRows((rs) =>
      rs.map((r) =>
        r.closerId === closerId ? { ...r, [key]: Math.max(0, Math.round(value)) } : r,
      ),
    );
  }
  function teamEdit(fieldIdx: number, value: number) {
    setRows((rs) => teamSetCount(editBase.current ?? rs, fieldIdx, value));
  }

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <div>
          <div className={s.eyebrow}>Ledger · {weekLabel}</div>
          <h2 className={s.title}>Closer Scorecard</h2>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className={s.act}
            onClick={() => {
              setBaseline(rows.map((r) => ({ ...r })));
              onLockBaseline(JSON.stringify(rows));
            }}
          >
            Lock as baseline
          </button>
          <button className={s.act} onClick={() => setRows(baseline.map((r) => ({ ...r })))}>
            Revert to baseline
          </button>
          <button
            className={s.act}
            onClick={() => {
              setRows(actualRows);
              setBaseline(actualRows);
              onLockBaseline(null);
            }}
          >
            Reset to actuals
          </button>
        </div>
      </div>

      <p className={s.lede}>
        Change any number and everything downstream of it recalculates at the
        current conversion rates. Nothing upstream ever moves, and nothing here
        saves — it&apos;s a whiteboard. Lock a baseline before a meeting to show
        deltas against it. Cells show the blended truth: manager corrections
        beat closer entries beat what we measured, and the chips under each
        name say who filed and who confirmed their calls.
      </p>

      <SettingsRow settings={settings} state={settingsState} onSave={onSettingsSave} />

      <CloserLedgerTable
        rows={rows}
        baseline={baseline}
        extras={extras}
        cpc={settings.costPerBookedCall}
        target={settings.targetCdpbc}
        onCellEdit={cellEdit}
        onExtraEdit={extraEdit}
        onTeamEdit={teamEdit}
        onEditStart={editStart}
        onEditEnd={editEnd}
      />

      {settings.tierPrices && settings.tierPrices.length > 0 && (
        <TiersTable
          rows={rows}
          prices={settings.tierPrices}
          onTierEdit={extraEdit}
          onEditStart={editStart}
          onEditEnd={editEnd}
        />
      )}

      <WhatIfPanel
        rows={rows}
        cpc={settings.costPerBookedCall}
        target={settings.targetCdpbc}
      />

      <p className={s.foot}>
        <strong>Where these numbers come from.</strong> Measured figures are
        what the bot recorded, follow-ups come from &ldquo;follow up&rdquo; in
        the call title, and closer-reported numbers arrive through the daily
        EOD form. A manager correction always wins, a closer&apos;s entry
        beats the measurement, and none of the three are ever blended
        silently. Rounding compounds down the cascade, so a big scale-up can
        land a unit or two off a hand calc — directional, not penny-exact.
      </p>
    </div>
  );
}
