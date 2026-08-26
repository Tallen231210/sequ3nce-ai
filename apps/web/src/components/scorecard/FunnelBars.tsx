import { pct, fn, fp, rollup, type LedgerRow } from "./engine";
import { Delta } from "./Delta";
import s from "./scorecard.module.css";

const STAGES = ["Dials", "Connects", "Sets", "On calendar", "Showed"] as const;
const GATES = ["pickup", "connect→set", "set→calendar", "show"] as const;

export function FunnelBars({ rows, baseline }: { rows: LedgerRow[]; baseline: LedgerRow[] }) {
  const t = rollup(rows);
  const b = rollup(baseline);
  const sv = [t.dials, t.connects, t.sets, t.booked, t.showed];
  const bv = [b.dials, b.connects, b.sets, b.booked, b.showed];
  const max = Math.max(1, t.dials, b.dials);
  const gv = [t.pickup, t.c2s, pct(t.booked, t.sets), t.show];
  const gb = [b.pickup, b.c2s, pct(b.booked, b.sets), b.show];

  return (
    <div>
      {STAGES.map((name, i) => (
        <div key={name}>
          <div className={s.fstage}>
            <div className={s.flabel}>{name}</div>
            <div className={s.ftrack}>
              <div className={s.fghost} style={{ width: `${Math.max(0.6, (bv[i] / max) * 100)}%` }} />
              <div className={s.ffill} style={{ width: `${Math.max(0.6, (sv[i] / max) * 100)}%` }} />
            </div>
            <div className={s.fval}>{fn(sv[i])}</div>
            <div className={s.fdelta}>
              <Delta now={sv[i]} was={bv[i]} unit="" dp={0} />
            </div>
          </div>
          {i < 4 && (
            <div className={s.fgate}>
              <div className={s.flabel} />
              <div className={s.fgateInner}>
                {GATES[i]} {fp(gv[i])}{" "}
                <Delta now={gv[i]} was={gb[i]} unit="pp" dp={1} />
              </div>
              <div style={{ width: 130, flexShrink: 0 }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
