"use client";

// The per-closer ledger. Manager-only mount in v1, so every count cell is
// editable; rates are derived and never editable. Mirrors the setter
// LedgerTable's structure and the reference HTML's columns.

import React from "react";
import {
  FIELDS,
  deltaDollars,
  fn,
  fp,
  fx,
  money,
  roll,
  type CloserLedgerRow,
} from "./engine";
import { Delta } from "../scorecard/Delta";
import s from "../scorecard/scorecard.module.css";

export interface RowExtras {
  filedDays: number;
  expectedDays: number;
  missedDayKeys: string[];
  callsCompleted: number;
  callsConfirmed: number;
}

function Cell({
  value,
  editable,
  bold,
  onEdit,
  onEditStart,
  onEditEnd,
  width,
}: {
  value: number;
  editable: boolean;
  bold?: boolean;
  onEdit: (v: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  width?: number;
}) {
  if (!editable) return <>{fn(value)}</>;
  return (
    <input
      type="number"
      className={s.num + (bold ? " " + s.numBold : "")}
      style={width ? { width } : undefined}
      value={value}
      min={0}
      onFocus={onEditStart}
      onBlur={onEditEnd}
      onChange={(e) => onEdit(Math.max(0, Number(e.target.value) || 0))}
    />
  );
}

/** Derived columns for one row (or the team), with deltas vs baseline. */
function RateCells({
  row,
  base,
  cpc,
  target,
}: {
  row: CloserLedgerRow | CloserLedgerRow[];
  base: CloserLedgerRow | CloserLedgerRow[] | null;
  cpc: number | null;
  target: number | null;
}) {
  const m = roll(Array.isArray(row) ? row : [row], cpc);
  const bm = base ? roll(Array.isArray(base) ? base : [base], cpc) : null;
  const gap = deltaDollars(target, m);
  const cdpbcColor =
    target !== null && m.cdpbc !== null
      ? m.cdpbc >= target
        ? "var(--green)"
        : "var(--red)"
      : undefined;
  return (
    <>
      <td className={s.sep}>
        {fp(m.show)}
        {bm && <div><Delta now={m.show} was={bm.show} unit="pp" dp={1} /></div>}
      </td>
      <td>
        {fp(m.lc)}
        {bm && <div><Delta now={m.lc} was={bm.lc} unit="pp" dp={1} /></div>}
      </td>
      <td>
        <strong>{fp(m.bc)}</strong>
        {bm && <div><Delta now={m.bc} was={bm.bc} unit="pp" dp={1} /></div>}
      </td>
      <td>{money(m.aov)}</td>
      <td>{fp(m.coll)}</td>
      <td>{money(m.gdpbc)}</td>
      <td style={cdpbcColor ? { color: cdpbcColor, fontWeight: 600 } : undefined}>
        {money(m.cdpbc)}
        {bm && <div><Delta now={m.cdpbc} was={bm.cdpbc} unit="$" dp={0} /></div>}
      </td>
      <td>
        {money(m.cdplc)}
        {bm && <div><Delta now={m.cdplc} was={bm.cdplc} unit="$" dp={0} /></div>}
      </td>
      <td>{fx(m.roas)}</td>
      <td>{fp(m.fushow)}</td>
      <td>
        {gap === null ? (
          "—"
        ) : gap > 0.5 ? (
          <span style={{ color: "var(--red)" }}>{money(gap)}</span>
        ) : (
          <span style={{ color: "var(--green)" }}>at target</span>
        )}
      </td>
    </>
  );
}

export function CloserLedgerTable({
  rows,
  baseline,
  extras,
  cpc,
  target,
  onCellEdit,
  onExtraEdit,
  onTeamEdit,
  onEditStart,
  onEditEnd,
}: {
  rows: CloserLedgerRow[];
  baseline: CloserLedgerRow[];
  extras: Map<string, RowExtras>;
  cpc: number | null;
  target: number | null;
  onCellEdit: (closerId: string, fieldIdx: number, value: number) => void;
  onExtraEdit: (closerId: string, key: "fub" | "fus", value: number) => void;
  onTeamEdit: (fieldIdx: number, value: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  const team = roll(rows, cpc);
  const baseById = new Map(baseline.map((r) => [r.closerId, r]));

  return (
    <div className={s.scroll}>
      <table className={s.table}>
        <thead>
          <tr>
            <th className={s.left}>Closer</th>
            <th>Booked</th><th>Live</th><th>Closes</th><th>Gross $</th><th>Collected $</th>
            <th>FU bkd</th><th>FU shown</th>
            <th className={s.sep}>Show</th><th>Live close</th><th>Bkd close</th>
            <th>AOV</th><th>Collect</th><th>GDPBC</th><th>CDPBC</th>
            <th title="Cash collected per live call — collected ÷ live">CDPLC</th><th>ROAS</th>
            <th>FU show</th><th>Gap $</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const ex = extras.get(r.closerId);
            const missed = ex ? ex.missedDayKeys.length : 0;
            return (
              <tr key={r.closerId} className={i % 2 === 1 ? s.stripe : undefined}>
                <td className={s.left}>
                  {r.name}
                  {ex && ex.expectedDays > 0 && (
                    <div
                      style={{
                        fontSize: 10,
                        color: missed > 0 ? "var(--red)" : "var(--mute)",
                      }}
                      title={
                        missed > 0
                          ? `EOD not filed: ${ex.missedDayKeys.join(", ")}`
                          : "Every worked day has a filed EOD"
                      }
                    >
                      filed {ex.filedDays}/{ex.expectedDays}
                    </div>
                  )}
                  {ex && ex.callsCompleted > 0 && (
                    <div
                      style={{ fontSize: 10, color: "var(--mute)" }}
                      title="Calls whose figures the closer confirmed or corrected"
                    >
                      {ex.callsConfirmed}/{ex.callsCompleted} calls ✓
                    </div>
                  )}
                </td>
                {FIELDS.map((f, fi) => (
                  <td key={f}>
                    <Cell
                      value={r[f]}
                      editable
                      width={fi >= 3 ? 76 : undefined}
                      onEdit={(v) => onCellEdit(r.closerId, fi, v)}
                      onEditStart={onEditStart}
                      onEditEnd={onEditEnd}
                    />
                  </td>
                ))}
                <td>
                  <Cell
                    value={r.fub}
                    editable
                    onEdit={(v) => onExtraEdit(r.closerId, "fub", v)}
                    onEditStart={onEditStart}
                    onEditEnd={onEditEnd}
                  />
                </td>
                <td>
                  <Cell
                    value={r.fus}
                    editable
                    onEdit={(v) => onExtraEdit(r.closerId, "fus", v)}
                    onEditStart={onEditStart}
                    onEditEnd={onEditEnd}
                  />
                </td>
                <RateCells row={r} base={baseById.get(r.closerId) ?? null} cpc={cpc} target={target} />
              </tr>
            );
          })}

          <tr>
            <td colSpan={19} style={{ height: 12 }} />
          </tr>
          <tr className={s.tot + " " + s.team}>
            <td className={s.left + " " + s.totLabel}>Team</td>
            {FIELDS.map((f, fi) => (
              <td key={f}>
                <Cell
                  value={team[f]}
                  editable
                  bold
                  width={fi >= 3 ? 84 : 70}
                  onEdit={(v) => onTeamEdit(fi, v)}
                  onEditStart={onEditStart}
                  onEditEnd={onEditEnd}
                />
              </td>
            ))}
            <td>{fn(team.fub)}</td>
            <td>{fn(team.fus)}</td>
            <RateCells row={rows} base={baseline.length ? baseline : null} cpc={cpc} target={target} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
