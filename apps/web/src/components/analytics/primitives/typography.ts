import type { CSSProperties } from "react";

/**
 * Shared presentational constants for the Analytics tab redesign.
 *
 * MONO — applies Geist Mono (scoped via the `--font-geist-mono` CSS variable
 * that the analytics page wrapper defines) plus tabular figures. Use on every
 * number so digits align in columns and the tab reads like a financial
 * dashboard, not body copy. Single source of truth — do not re-inline this
 * string per component (that drift is what made the old sections inconsistent).
 */
export const MONO = "[font-family:var(--font-geist-mono)] tabular-nums";

/**
 * HATCH_STYLE — the diagonal hatch that marks "leaked" money in the capture
 * bar and its legend. Inline style rather than a Tailwind arbitrary value: a
 * multi-stop repeating-linear-gradient is exactly the kind of arbitrary class
 * that can silently fail to generate, so we render it as a guaranteed inline
 * background instead.
 */
export const HATCH_STYLE: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg,#e4e4e7 0 3px,#f4f4f5 3px 6px)",
};
