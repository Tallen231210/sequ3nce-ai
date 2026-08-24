import s from "./scorecard.module.css";

/** ▲/▼ vs baseline. `invert` marks metrics where down is good (dials/set). */
export function Delta({
  now,
  was,
  unit,
  dp,
  invert,
}: {
  now: number | null;
  was: number | null;
  unit: string;
  dp: number;
  invert?: boolean;
}) {
  if (now === null || was === null || !isFinite(now) || !isFinite(was)) return null;
  const d = now - was;
  if (Math.abs(d) < 0.05) return <span className={s.flat}>—</span>;
  const good = invert ? d < 0 : d > 0;
  return (
    <span className={good ? s.up : s.down}>
      {d > 0 ? "▲" : "▼"} {Math.abs(d).toFixed(dp)}
      {unit}
    </span>
  );
}
