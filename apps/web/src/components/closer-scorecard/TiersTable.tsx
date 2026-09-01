"use client";

// Tier pitch analysis: what each closer pitched vs what they actually closed
// at. The downsell gap (AOV − avg tier pitched) is negative when a rep
// pitches high but closes low.

import React from "react";
import { fn, money, rat, tierStats, type CloserLedgerRow } from "./engine";
import s from "../scorecard/scorecard.module.css";

const TIER_KEYS = ["p1", "p2", "p3"] as const;

function Cell({
  value,
  onEdit,
  onEditStart,
  onEditEnd,
}: {
  value: number;
  onEdit: (v: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  return (
    <input
      type="number"
      className={s.num}
      value={value}
      min={0}
      onFocus={onEditStart}
      onBlur={onEditEnd}
      onChange={(e) => onEdit(Math.max(0, Number(e.target.value) || 0))}
    />
  );
}

export function TiersTable({
  rows,
  prices,
  onTierEdit,
  onEditStart,
  onEditEnd,
}: {
  rows: CloserLedgerRow[];
  prices: number[];
  onTierEdit: (closerId: string, key: "p1" | "p2" | "p3", value: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  const keys = TIER_KEYS.slice(0, prices.length);
  const teamRow: CloserLedgerRow = rows.reduce(
    (a, r) => ({
      ...a,
      gross: a.gross + r.gross,
      closes: a.closes + r.closes,
      p1: a.p1 + r.p1,
      p2: a.p2 + r.p2,
      p3: a.p3 + r.p3,
    }),
    { closerId: "team", name: "Team", booked: 0, live: 0, closes: 0, gross: 0, collected: 0, fub: 0, fus: 0, p1: 0, p2: 0, p3: 0 },
  );
  const teamStats = tierStats(teamRow, prices);

  return (
    <div style={{ marginTop: 24 }}>
      <div className={s.eyebrow}>Tier pitches</div>
      <div className={s.scroll}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.left}>Closer</th>
              {keys.map((k, i) => (
                <th key={k}>@ {money(prices[i])}</th>
              ))}
              <th className={s.sep}>Pitched</th>
              <th>Avg tier pitched</th>
              <th>AOV</th>
              <th>Downsell gap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const ts = tierStats(r, prices);
              const aov = rat(r.gross, r.closes);
              return (
                <tr key={r.closerId} className={i % 2 === 1 ? s.stripe : undefined}>
                  <td className={s.left}>{r.name}</td>
                  {keys.map((k) => (
                    <td key={k}>
                      <Cell
                        value={r[k]}
                        onEdit={(v) => onTierEdit(r.closerId, k, v)}
                        onEditStart={onEditStart}
                        onEditEnd={onEditEnd}
                      />
                    </td>
                  ))}
                  <td className={s.sep}>{fn(ts.pitched)}</td>
                  <td>{money(ts.avgTier)}</td>
                  <td>{money(aov)}</td>
                  <td
                    style={
                      ts.downsellGap !== null
                        ? { color: ts.downsellGap < 0 ? "var(--red)" : "var(--green)" }
                        : undefined
                    }
                  >
                    {money(ts.downsellGap)}
                  </td>
                </tr>
              );
            })}
            <tr className={s.tot + " " + s.team}>
              <td className={s.left + " " + s.totLabel}>Team</td>
              {keys.map((k) => (
                <td key={k}>{fn(teamRow[k])}</td>
              ))}
              <td className={s.sep}>{fn(teamStats.pitched)}</td>
              <td>{money(teamStats.avgTier)}</td>
              <td>{money(rat(teamRow.gross, teamRow.closes))}</td>
              <td>{money(teamStats.downsellGap)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
