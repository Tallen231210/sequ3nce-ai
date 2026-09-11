/** Number formatting for the Setters page — one place, so every panel agrees. */

export const int = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : v.toLocaleString("en-US"));

export const pct = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : `${v}%`);

export const money = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `$${Math.round(v).toLocaleString("en-US")}`;

/** Working hours as people say them: "45m", "2.5h", "1d 3h" (a working day is the team's hours, ~8h). */
export const hours = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined) return "—";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = ms / 3600000;
  if (h < 8) return `${h.toFixed(1).replace(/\.0$/, "")}h`;
  const days = Math.floor(h / 8);
  const rest = Math.round(h - days * 8);
  return rest > 0 ? `${days}d ${rest}h` : `${days}d`;
};

export { humanDay } from "../../../../../convex/lib/dayLabel";
