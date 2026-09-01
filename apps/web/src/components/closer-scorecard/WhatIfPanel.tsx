"use client";

// Which single lever is worth the most for each closer, against the team's
// bests — "this gap is worth $X" framing, straight from the reference HTML's
// renderDiag. Computed client-side off the whiteboard rows like everything
// else, so projections update it live.

import React, { useState } from "react";
import {
  deltaDollars,
  fp,
  fx,
  money,
  roll,
  whatIf,
  type CloserLedgerRow,
} from "./engine";
import s from "../scorecard/scorecard.module.css";

export function WhatIfPanel({
  rows,
  cpc,
  target,
}: {
  rows: CloserLedgerRow[];
  cpc: number | null;
  target: number | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) return null;
  const results = whatIf(rows);

  return (
    <div style={{ marginTop: 24 }}>
      <div className={s.eyebrow}>What the gaps are worth</div>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {rows.map((r, i) => {
          const w = results[i];
          const m = roll([r], cpc);
          const gap = deltaDollars(target, m);
          const tag =
            target !== null && m.cdpbc !== null && m.cdpbc >= target
              ? "at target"
              : m.roas !== null && m.roas >= 4
                ? "under target · ROAS holds"
                : target !== null
                  ? "under target"
                  : "";
          return (
            <div
              key={r.closerId}
              style={{
                border: "1px solid var(--rule)",
                borderRadius: 8,
                padding: "10px 12px",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{r.name || "—"}</strong>
                {tag && <span style={{ fontSize: 11, color: "var(--mute)" }}>{tag}</span>}
              </div>
              <div style={{ fontSize: 12, color: "var(--mute)", marginTop: 2 }}>
                CDPBC {money(m.cdpbc)} · ROAS {fx(m.roas)}
                {gap !== null && gap > 0.5 && (
                  <> · gap to target <strong style={{ color: "var(--red)" }}>{money(gap)}</strong></>
                )}
              </div>
              {w.pick ? (
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  Work on <strong>{w.pick.label}</strong> —{" "}
                  {w.pick.key === "aov" ? money(w.pick.current) : fp(w.pick.current)} →{" "}
                  {w.pick.key === "aov" ? money(w.pick.teamBest) : fp(w.pick.teamBest)} (team
                  best) = <span style={{ color: "var(--green)" }}>+{money(w.pick.gain)}</span>
                  <span style={{ color: "var(--mute)" }}> · {w.pick.note}</span>
                </div>
              ) : (
                <div style={{ fontSize: 12, marginTop: 6, color: "var(--mute)" }}>
                  Team best on every lever — this is your control group; document what they do.
                </div>
              )}
              <button
                type="button"
                onClick={() => setOpen(open === r.closerId ? null : r.closerId)}
                style={{
                  marginTop: 6, fontSize: 11, color: "var(--mute)",
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                {open === r.closerId ? "hide the other levers" : "all levers"}
              </button>
              {open === r.closerId && (
                <div style={{ marginTop: 6, display: "grid", gap: 2 }}>
                  {w.options.map((o) => (
                    <div key={o.key} style={{ fontSize: 11, color: "var(--mute)" }}>
                      {o.label}: {o.key === "aov" ? money(o.current) : fp(o.current)} → team best{" "}
                      {o.key === "aov" ? money(o.teamBest) : fp(o.teamBest)} ={" "}
                      {o.gain > 0.5 ? `+${money(o.gain)}` : "no gain"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
