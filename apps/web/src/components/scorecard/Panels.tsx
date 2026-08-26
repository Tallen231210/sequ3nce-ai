"use client";

// The rate-driver panel and the three cards (capacity, revenue, how to read).

import React from "react";
import { pct, fp, fr, fn, money, rollup, type LedgerRow } from "./engine";
import { Delta } from "./Delta";
import s from "./scorecard.module.css";

const DRIVERS: Array<{ label: string; sub: string }> = [
  { label: "Pickup", sub: "connects off dials" },
  { label: "Connect→set", sub: "sets off connects" },
  { label: "Set→calendar", sub: "calls off sets" },
  { label: "Show", sub: "shows off calls" },
];

export function DriverPanel({
  rows,
  baseline,
  enabled,
  onDriverEdit,
  onEditStart,
  onEditEnd,
}: {
  rows: LedgerRow[];
  baseline: LedgerRow[];
  enabled: boolean;
  onDriverEdit: (gap: number, pctValue: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  const t = rollup(rows);
  const b = rollup(baseline);
  const gv = [t.pickup, t.c2s, pct(t.booked, t.sets), t.show];
  const gb = [b.pickup, b.c2s, pct(b.booked, b.sets), b.show];
  return (
    <div className={s.drivers}>
      <div className={s.dhead}>
        <div className={s.dtitle}>Team rate drivers</div>
        <div className={s.dnote}>
          {enabled
            ? "Set a rate — the funnel below it recalculates and every setter moves pro-rata."
            : "Team-level levers — your manager's controls."}
        </div>
      </div>
      <div className={s.drow}>
        {DRIVERS.map((d, gap) => (
          <div key={d.label} className={s.driver}>
            <div className={s.dlabel}>{d.label}</div>
            {enabled ? (
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 2 }}>
                <DriverInput
                  computed={gv[gap]}
                  onApply={(p) => onDriverEdit(gap, p)}
                  onEditStart={onEditStart}
                  onEditEnd={onEditEnd}
                />
                <span style={{ fontSize: 12, color: "var(--mute)" }}>%</span>
              </span>
            ) : (
              <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fp(gv[gap])}</span>
            )}
            <div className={s.dsub}>
              {d.sub} · <Delta now={gv[gap]} was={gb[gap]} unit="pp" dp={1} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Cards({
  rows,
  baseline,
  days,
  cadence,
  cdpbc,
  cdpbcEditable,
  onDays,
  onCadence,
  onCdpbc,
}: {
  rows: LedgerRow[];
  baseline: LedgerRow[];
  days: number;
  cadence: number;
  cdpbc: number;
  cdpbcEditable: boolean;
  onDays: (n: number) => void;
  onCadence: (n: number) => void;
  onCdpbc: (n: number) => void;
}) {
  const t = rollup(rows);
  const b = rollup(baseline);
  const dpd = days > 0 && rows.length ? t.dials / days / rows.length : null;
  const cw = cadence > 0 ? t.dials / cadence : null;
  const bcw = cadence > 0 ? b.dials / cadence : null;
  const rev = t.booked * cdpbc;
  const brev = b.booked * cdpbc;
  const up = rev >= brev;

  return (
    <div className={s.cards}>
      <div className={s.card}>
        <div className={s.ctitle}>Capacity check</div>
        <label className={s.crow}>
          Working days in week{" "}
          <input
            type="number"
            className={s.num}
            style={{ width: 44 }}
            value={days}
            min={0}
            onChange={(e) => onDays(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className={s.crow}>
          Dials per lead (cadence){" "}
          <input
            type="number"
            className={s.num}
            style={{ width: 44 }}
            value={cadence}
            min={0}
            onChange={(e) => onCadence(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <div className={s.cdiv}>
          <div className={s.cstat}>
            <span style={{ color: "var(--mute)" }}>Avg dials/setter/day</span>
            <strong className={dpd !== null && dpd < 150 ? s.redText : s.greenText}>
              {fr(dpd)} / 150
            </strong>
          </div>
          <div className={s.cstat}>
            <span style={{ color: "var(--mute)" }}>Contacts worked</span>
            <strong>
              {fr(cw)} <Delta now={cw} was={bcw} unit="" dp={0} />
            </strong>
          </div>
          <div className={s.cstat}>
            <span style={{ color: "var(--mute)" }}>Contact→set</span>
            <strong>{fp(cw ? pct(t.sets, cw) : null)}</strong>
          </div>
        </div>
      </div>

      <div className={s.card}>
        <div className={s.ctitle}>What the swing is worth</div>
        {cdpbcEditable ? (
          <label className={s.crow}>
            CDPBC (collected $ / booked call){" "}
            <input
              type="number"
              className={s.num}
              style={{ width: 64 }}
              value={cdpbc || ""}
              min={0}
              onChange={(e) => onCdpbc(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
        ) : (
          <div className={s.crow}>
            <span>CDPBC (collected $ / booked call)</span>
            <strong>{cdpbc ? money(cdpbc) : "—"}</strong>
          </div>
        )}
        <div className={s.cdiv}>
          {!(cdpbc > 0) ? (
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--mute)" }}>
              {cdpbcEditable
                ? "Enter your CDPBC to price the funnel. Collected dollars ÷ booked calls, trailing 60–90 days."
                : "Your manager hasn't set a CDPBC yet."}
            </div>
          ) : (
            <>
              <div className={s.big}>{money(rev)}</div>
              <div className={s.sm}>off {fn(t.booked)} booked calls</div>
              <div
                style={{ marginTop: 8, fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
                className={up ? s.greenText : s.redText}
              >
                {up ? "+" : "−"}
                {money(Math.abs(rev - brev))} vs baseline
              </div>
            </>
          )}
        </div>
      </div>

      <div className={s.card}>
        <div className={s.ctitle}>Read the ledger</div>
        <ul>
          <li>Pickup is the constraint. Move it before you touch talk tracks.</li>
          <li>Connect→set holds steady across pods — the setting skill is not the problem.</li>
          <li>Dials/set is your true cost per set. Lower is better.</li>
          <li>Show rate belongs to setters and confirmations, never to closers.</li>
        </ul>
      </div>
    </div>
  );
}

/** A rate input that shows the computed value at rest but lets you type
 *  freely while focused — a controlled toFixed(1) reformat per keystroke
 *  makes "12.5" impossible to enter. */
function DriverInput({
  computed,
  onApply,
  onEditStart,
  onEditEnd,
}: {
  computed: number | null;
  onApply: (p: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);
  return (
    <input
      type="number"
      step={0.1}
      min={0}
      className={s.num + " " + s.numBold}
      style={{ width: 62 }}
      value={
        draft !== null
          ? draft
          : computed === null || !isFinite(computed)
            ? ""
            : computed.toFixed(1)
      }
      onFocus={(e) => {
        onEditStart();
        setDraft(e.target.value);
      }}
      onBlur={() => {
        onEditEnd();
        setDraft(null);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const p = parseFloat(e.target.value);
        if (!isNaN(p) && p >= 0) onApply(p);
      }}
    />
  );
}
