"use client";

// The per-setter ledger. Editing rules come in as `canEdit(rosterId)` — the
// manager edits everything, the sandbox edits one row, read-only edits none.

import React from "react";
import {
  FIELDS,
  fp,
  fr,
  fn,
  rollup,
  type LedgerRow,
} from "./engine";
import { Delta } from "./Delta";
import s from "./scorecard.module.css";

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

function RateCells({ row, base }: { row: LedgerRow; base: LedgerRow | null }) {
  const m = rollup([row]);
  const bm = base ? rollup([base]) : null;
  return (
    <>
      <td className={s.sep}>
        {fp(m.pickup)}
        {bm && <div><Delta now={m.pickup} was={bm.pickup} unit="pp" dp={1} /></div>}
      </td>
      <td>
        {fp(m.c2s)}
        {bm && <div><Delta now={m.c2s} was={bm.c2s} unit="pp" dp={1} /></div>}
      </td>
      <td>{fr(m.dps)}</td>
      <td>
        {fp(m.show)}
        {bm && <div><Delta now={m.show} was={bm.show} unit="pp" dp={1} /></div>}
      </td>
      <td>{fp(m.setToClose)}</td>
    </>
  );
}

export function LedgerTable({
  rows,
  baseline,
  canEdit,
  canEditTeam,
  onCellEdit,
  onClosedEdit,
  onTeamEdit,
  onEditStart,
  onEditEnd,
  ownRosterId,
}: {
  rows: LedgerRow[];
  baseline: LedgerRow[];
  canEdit: (rosterId: string) => boolean;
  canEditTeam: boolean;
  onCellEdit: (rosterId: string, fieldIdx: number, value: number) => void;
  onClosedEdit: (rosterId: string, value: number) => void;
  onTeamEdit: (fieldIdx: number | "closed", value: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  ownRosterId?: string | null;
}) {
  const pods = Array.from(new Set(rows.map((r) => r.pod ?? "—"))).sort();
  const team = rollup(rows);
  const baseTeam = rollup(baseline);
  const baseById = new Map(baseline.map((r) => [r.rosterId, r]));

  return (
    <div className={s.scroll}>
      <table className={s.table}>
        <thead>
          <tr>
            <th className={s.left}>Setter</th>
            <th>Dials</th><th>Connects</th><th>Sets</th><th>On cal.</th><th>Showed</th><th>Closed</th>
            <th className={s.sep}>Pickup</th><th>Conn→set</th><th>Dials/set</th><th>Show</th><th>Set→close</th>
          </tr>
        </thead>
        <tbody>
          {pods.map((pod) => {
            const podRows = rows.filter((r) => (r.pod ?? "—") === pod);
            const podBase = baseline.filter((r) => (r.pod ?? "—") === pod);
            const pm = rollup(podRows);
            const pbm = rollup(podBase.length ? podBase : podRows);
            return (
              <React.Fragment key={pod}>
                <tr className={s.podhead}>
                  <td colSpan={12}>Pod {pod}</td>
                </tr>
                {podRows.map((r, i) => {
                  const editable = canEdit(r.rosterId);
                  const own = ownRosterId === r.rosterId;
                  return (
                    <tr
                      key={r.rosterId}
                      className={
                        (i % 2 === 1 ? s.stripe + " " : "") +
                        (!editable && ownRosterId ? s.dimmed : "") +
                        (own ? " " + s.ownRow : "")
                      }
                    >
                      <td className={s.left}>{r.name}</td>
                      {FIELDS.map((f, fi) => (
                        <td key={f}>
                          <Cell
                            value={r[f]}
                            editable={editable}
                            onEdit={(v) => onCellEdit(r.rosterId, fi, v)}
                            onEditStart={onEditStart}
                            onEditEnd={onEditEnd}
                          />
                        </td>
                      ))}
                      <td>
                        <Cell
                          value={r.closed}
                          editable={editable}
                          onEdit={(v) => onClosedEdit(r.rosterId, v)}
                          onEditStart={onEditStart}
                          onEditEnd={onEditEnd}
                        />
                      </td>
                      <RateCells row={r} base={baseById.get(r.rosterId) ?? null} />
                    </tr>
                  );
                })}
                <tr className={s.tot}>
                  <td className={s.left + " " + s.totLabel}>Pod {pod}</td>
                  <td>{fn(pm.dials)}</td>
                  <td>{fn(pm.connects)}</td>
                  <td>{fn(pm.sets)}</td>
                  <td>{fn(pm.booked)}</td>
                  <td>{fn(pm.showed)}</td>
                  <td>{fn(pm.closed)}</td>
                  <td className={s.sep}>
                    {fp(pm.pickup)}
                    <div><Delta now={pm.pickup} was={pbm.pickup} unit="pp" dp={1} /></div>
                  </td>
                  <td>
                    {fp(pm.c2s)}
                    <div><Delta now={pm.c2s} was={pbm.c2s} unit="pp" dp={1} /></div>
                  </td>
                  <td>
                    {fr(pm.dps)}
                    <div><Delta now={pm.dps} was={pbm.dps} unit="" dp={0} invert /></div>
                  </td>
                  <td>
                    {fp(pm.show)}
                    <div><Delta now={pm.show} was={pbm.show} unit="pp" dp={1} /></div>
                  </td>
                  <td>{fp(pm.setToClose)}</td>
                </tr>
              </React.Fragment>
            );
          })}

          <tr>
            <td colSpan={12} style={{ height: 12 }} />
          </tr>
          <tr className={s.tot + " " + s.team}>
            <td className={s.left + " " + s.totLabel}>Team</td>
            {FIELDS.map((f, fi) => (
              <td key={f}>
                <Cell
                  value={team[f]}
                  editable={canEditTeam}
                  bold
                  width={70}
                  onEdit={(v) => onTeamEdit(fi, v)}
                  onEditStart={onEditStart}
                  onEditEnd={onEditEnd}
                />
              </td>
            ))}
            <td>
              <Cell
                value={team.closed}
                editable={canEditTeam}
                bold
                width={54}
                onEdit={(v) => onTeamEdit("closed", v)}
                onEditStart={onEditStart}
                onEditEnd={onEditEnd}
              />
            </td>
            <td className={s.sep}>
              {fp(team.pickup)}
              <div><Delta now={team.pickup} was={baseTeam.pickup} unit="pp" dp={1} /></div>
            </td>
            <td>
              {fp(team.c2s)}
              <div><Delta now={team.c2s} was={baseTeam.c2s} unit="pp" dp={1} /></div>
            </td>
            <td>
              {fr(team.dps)}
              <div><Delta now={team.dps} was={baseTeam.dps} unit="" dp={0} invert /></div>
            </td>
            <td>
              {fp(team.show)}
              <div><Delta now={team.show} was={baseTeam.show} unit="pp" dp={1} /></div>
            </td>
            <td>{fp(team.setToClose)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
