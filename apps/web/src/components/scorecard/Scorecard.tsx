"use client";

// One scorecard, three mounts. `mode` decides who can grab what:
//   manager  — everything editable; Lock/Revert persist through callbacks
//   readonly — a rendered ledger, no inputs anywhere
//   sandbox  — the setter's own row is live, everything else frozen
// The scenario is a whiteboard by design: leaving the page returns to
// actuals. Only the manager's locked baseline and CDPBC persist.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  cascadeWith,
  distribute,
  ratesOf,
  rollup,
  teamSetCount,
  type LedgerRow,
} from "./engine";
import { FunnelBars } from "./FunnelBars";
import { LedgerTable } from "./LedgerTable";
import { Cards, DriverPanel } from "./Panels";
import s from "./scorecard.module.css";

export type ScorecardMode = "manager" | "readonly" | "sandbox";

export function Scorecard({
  actualRows,
  savedBaselineRows,
  savedCdpbc,
  mode,
  ownRosterId,
  weekLabel,
  onLockBaseline,
  onCdpbcSave,
}: {
  actualRows: LedgerRow[];
  savedBaselineRows: LedgerRow[] | null;
  savedCdpbc: number | null;
  mode: ScorecardMode;
  ownRosterId?: string | null;
  weekLabel: string;
  onLockBaseline?: (rowsJson: string | null) => void;
  onCdpbcSave?: (v: number) => void;
}) {
  const [rows, setRows] = useState<LedgerRow[]>(actualRows);
  const [baseline, setBaseline] = useState<LedgerRow[]>(savedBaselineRows ?? actualRows);
  const [days, setDays] = useState(5);
  const [cadence, setCadence] = useState(12);
  const [cdpbc, setCdpbc] = useState(savedCdpbc ?? 0);

  // Week change / fresh data: reset the whiteboard to actuals.
  useEffect(() => {
    setRows(actualRows);
    setBaseline(savedBaselineRows ?? actualRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekLabel, JSON.stringify(actualRows), JSON.stringify(savedBaselineRows)]);
  useEffect(() => setCdpbc(savedCdpbc ?? 0), [savedCdpbc]);

  // Rates and shares are captured when an edit session STARTS (focus) and
  // held until it ends (blur). Recomputing them per keystroke reads rates
  // off the half-typed row — typing "600" as 6 → 60 → 600 rounded the
  // downstream stages to zero and then cascaded zeros.
  const editBase = useRef<LedgerRow[] | null>(null);
  function editStart() {
    if (!editBase.current) editBase.current = rows.map((r) => ({ ...r }));
  }
  function editEnd() {
    editBase.current = null;
  }

  const canEdit = useMemo(() => {
    if (mode === "manager") return () => true;
    if (mode === "sandbox") return (rosterId: string) => rosterId === ownRosterId;
    return () => false;
  }, [mode, ownRosterId]);
  const canEditTeam = mode === "manager";

  function cellEdit(rosterId: string, fieldIdx: number, value: number) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.rosterId !== rosterId) return r;
        const base = editBase.current?.find((b) => b.rosterId === rosterId) ?? r;
        return cascadeWith(base, fieldIdx, ratesOf(base), value);
      }),
    );
  }
  function closedEdit(rosterId: string, value: number) {
    setRows((rs) =>
      rs.map((r) => (r.rosterId === rosterId ? { ...r, closed: Math.max(0, Math.round(value)) } : r)),
    );
  }
  function teamEdit(fieldIdx: number | "closed", value: number) {
    setRows((rs) => {
      const base = editBase.current ?? rs;
      return fieldIdx === "closed"
        ? distribute(base, "closed" as never, value)
        : teamSetCount(base, fieldIdx, value);
    });
  }
  function driverEdit(gap: number, pctValue: number) {
    setRows(() => {
      const base = editBase.current ?? rows;
      const t = rollup(base);
      const parent = [t.dials, t.connects, t.sets, t.booked][gap];
      return teamSetCount(base, gap + 1, (parent * pctValue) / 100);
    });
  }

  const lede =
    mode === "sandbox"
      ? "Your row is live — change any of your numbers and everything downstream recalculates at your current rates. Teammates' rows are frozen; team totals move with you. Nothing here saves."
      : mode === "manager"
        ? "Change any number and everything downstream of it recalculates at the current conversion rates. Raise a rate and the same chain fires from that point down. Nothing upstream ever moves. Lock a baseline before a meeting to show deltas against it."
        : "The week as your team reported it. Head to Projections to play with your own numbers.";

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <div>
          <div className={s.eyebrow}>Ledger · {weekLabel}</div>
          <h2 className={s.title}>Setter Scorecard</h2>
        </div>
        {mode === "manager" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className={s.act}
              onClick={() => {
                setBaseline(rows.map((r) => ({ ...r })));
                onLockBaseline?.(JSON.stringify(rows));
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
                onLockBaseline?.(null);
              }}
            >
              Reset to actuals
            </button>
          </div>
        )}
        {mode === "sandbox" && (
          <button className={s.act} onClick={() => setRows(actualRows)}>
            Reset to actuals
          </button>
        )}
      </div>

      <p className={s.lede}>{lede}</p>

      <FunnelBars rows={rows} baseline={baseline} />

      <LedgerTable
        rows={rows}
        baseline={baseline}
        canEdit={canEdit}
        canEditTeam={canEditTeam}
        onCellEdit={cellEdit}
        onClosedEdit={closedEdit}
        onTeamEdit={teamEdit}
        onEditStart={editStart}
        onEditEnd={editEnd}
        ownRosterId={ownRosterId}
      />

      <DriverPanel
        rows={rows}
        baseline={baseline}
        enabled={mode === "manager"}
        onDriverEdit={driverEdit}
        onEditStart={editStart}
        onEditEnd={editEnd}
      />

      <Cards
        rows={rows}
        baseline={baseline}
        days={days}
        cadence={cadence}
        cdpbc={cdpbc}
        cdpbcEditable={mode === "manager"}
        onDays={setDays}
        onCadence={setCadence}
        onCdpbc={(v) => {
          setCdpbc(v);
          onCdpbcSave?.(v);
        }}
      />

      <p className={s.foot}>
        <strong>Two things to keep straight.</strong> These numbers are
        self-reported by your setters through their EOD forms. Rounding
        compounds down the chain, so a big scale-up can land a unit or two off
        a hand calc — directional, not penny-exact. Since Sep 1, 2026,
        &ldquo;on calendar&rdquo; means first consults scheduled that day and
        &ldquo;showed&rdquo; counts only those — so the show rate is a real rate.
        Set→scheduled still spans cohorts (this week&apos;s sets show up on later
        weeks&apos; calendars), and entries filed before Sep 1 predate these
        definitions.
      </p>
    </div>
  );
}
