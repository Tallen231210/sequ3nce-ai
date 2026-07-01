import { cn } from "@/lib/utils";
import { MONO } from "./typography";

/**
 * TrendDelta — the single source of truth for period-over-period trend chips
 * on the Analytics tab. Replaces the ad-hoc trend rendering scattered across
 * sections that (a) double-drew arrows (formatTrend baked "↑"/"↓" into the
 * text AND components rendered a lucide arrow beside it) and (b) used
 * saturated red/green everywhere regardless of magnitude.
 *
 * ONE arrow, drawn from the sign of `value`. Color carries good/bad, not the
 * arrow. Neutral (below threshold) renders a muted em-dash — no false signal
 * on tiny movements.
 *
 * Semantics:
 *   - `value` is a signed percent change (e.g. -92 means "down 92%").
 *   - `invert=false` (default): up is good (revenue, close rate, lead quality).
 *   - `invert=true`: down is good (leak buckets, no-shows, uncollected).
 *
 * The arrow always points in the direction of the raw change; only the color
 * reflects whether that change is good or bad.
 */
interface TrendDeltaProps {
  value: number;
  invert?: boolean;
  /** Movements smaller than this (absolute) render as neutral. */
  neutralThreshold?: number;
  /** Trailing muted label, e.g. "vs prior period". */
  suffix?: string;
  className?: string;
}

export function TrendDelta({
  value,
  invert = false,
  neutralThreshold = 0.5,
  suffix,
  className,
}: TrendDeltaProps) {
  const isNeutral = Math.abs(value) < neutralThreshold;

  if (isNeutral) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-zinc-400",
          className,
        )}
      >
        <span className={MONO}>—</span>
        {suffix && <span className="text-zinc-400">{suffix}</span>}
      </span>
    );
  }

  const isUp = value > 0;
  const isGood = invert ? !isUp : isUp;
  const color = isGood ? "text-emerald-600" : "text-red-600";

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs", className)}
    >
      <span className={cn("inline-flex items-center gap-0.5 font-medium", color)}>
        <Arrow up={isUp} />
        <span className={MONO}>{Math.abs(value).toFixed(0)}%</span>
      </span>
      {suffix && <span className="text-zinc-400">{suffix}</span>}
    </span>
  );
}

/** Minimal directional arrow — cleaner than lucide's TrendingUp zigzag. */
function Arrow({ up }: { up: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {up ? (
        <path
          d="M6 2.5V9.5M6 2.5L2.5 6M6 2.5L9.5 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M6 9.5V2.5M6 9.5L2.5 6M6 9.5L9.5 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
