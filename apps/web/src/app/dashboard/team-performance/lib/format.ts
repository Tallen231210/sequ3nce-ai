/** Shared formatting + RAG styling for the Team Performance Sheet. */

export type Rag = "green" | "amber" | "red" | "na";

export function fmtCurrency(n: number | null | undefined, compact = false): string {
  if (n === null || n === undefined) return "—";
  if (compact && Math.abs(n) >= 1000) {
    return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  }
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString("en-US");
}

export function fmtSigned(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(0)}%`;
}

/**
 * RAG → text colour. Deliberately colour-plus-shape everywhere it's used:
 * a sales floor board gets read at a glance and ~8% of men have some form of
 * colour-vision deficiency, so red/green alone would fail a chunk of users.
 */
export const RAG_TEXT: Record<Rag, string> = {
  green: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-rose-600 dark:text-rose-400",
  na: "text-muted-foreground",
};

export const RAG_DOT: Record<Rag, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  na: "bg-muted-foreground/30",
};

export const RAG_BAR: Record<Rag, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  na: "bg-muted-foreground/25",
};

/** Month label from a "YYYY-MM" key, without tripping over timezones. */
export function monthLabel(monthKey: string, long = false): string {
  const [y, m] = monthKey.split("-").map((s) => parseInt(s, 10));
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString("en-US", {
    month: long ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map((s) => parseInt(s, 10));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Initials for the leaderboard avatar. Handles single-word names. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
