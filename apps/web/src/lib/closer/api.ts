"use client";

/**
 * Closer data access on the web.
 *
 * Ported from apps/desktop/src/renderer/convex.ts, keeping the same function
 * names and shapes so porting each remaining view stays mechanical. Only the
 * functions the current views need live here — extend per view rather than
 * copying 75 unused ones across.
 *
 * The one deliberate difference: nothing passes a closerId. The server takes
 * that from the session. See ./session.ts.
 */

import { closerFetch, CONVEX_SITE_URL, type CloserInfo } from "./session";

export type { CloserInfo };

// ---------------------------------------------------------------- auth ----

export interface LoginResult {
  success: boolean;
  error?: string;
  sessionToken?: string;
  closer?: CloserInfo;
  /** Set when the email belongs to closers on more than one team. */
  kind?: "signed_in" | "team_picker";
  pickerToken?: string;
  choices?: TeamChoice[];
}

export interface TeamChoice {
  closerId: string;
  teamName: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${CONVEX_SITE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

/** Legacy password sign-in. Kept so existing closers aren't stranded. */
export async function loginWithPassword(
  email: string,
  password: string,
): Promise<LoginResult> {
  return post<LoginResult>("/loginCloser", {
    email,
    password,
    userAgent:
      typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  });
}

/** Ask for a 6-digit code by email. The preferred path for everyone new. */
export async function requestSignInCode(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  return post("/closer/magicLink/request", { email });
}

export async function verifySignInCode(
  email: string,
  code: string,
): Promise<LoginResult> {
  return post<LoginResult>("/closer/magicLink/verify", { email, code });
}

/** Second step when one email belongs to closers on several teams. */
export async function pickTeam(
  pickerToken: string,
  closerId: string,
): Promise<LoginResult> {
  return post<LoginResult>("/closer/magicLink/pickTeam", {
    pickerToken,
    closerId,
  });
}

// ------------------------------------------------------------ my numbers --

export interface PerfTotals {
  slots: number;
  booked: number;
  taken: number;
  offers: number;
  closes: number;
  cash: number;
  contractValue: number;
  missingOutcomes: number;
}

/**
 * The closer's own month.
 *
 * Note this carries `weekCash`, `projection` and `prize`, which the desktop
 * copy of this type was missing even though its views read them — the desktop
 * app has TypeScript's strict mode off, so nothing complained. Shapes below
 * are taken from the live response, not inferred.
 */
export interface SelfPerformance {
  monthKey: string;
  timezone: string;
  closerName: string;
  totals: PerfTotals;
  rates: {
    bookedPct: number | null;
    showPct: number | null;
    offerClosePct: number | null;
    closePct: number | null;
  };
  rag: Record<string, "green" | "amber" | "red" | "na">;
  targets: Record<string, number>;
  capacityReliable: boolean;
  avgCash: number | null;
  avgDeal: number | null;
  goal: number | null;
  pctGoal: number | null;
  daysSubmitted: number;
  daysElapsed: number;
  /** Cash per week of the month — five entries, W1 through W5. */
  weekCash: number[];
  projection: {
    collected: number;
    target: number;
    projectedCash: number;
    needPerDay: number;
    remaining: number;
    daysElapsed: number;
    daysLeft: number;
    pctOfTarget: number;
    onTrack: boolean;
    isFinal: boolean;
  } | null;
  /** Shared team prize, so it's the TEAM's cash against the target. */
  prize: {
    name: string;
    emoji: string;
    target: number;
    collected: number;
    remaining: number;
    pct: number;
    unlocked: boolean;
  } | null;
}

export interface YearMonthRow {
  monthKey: string;
  monthIndex: number;
  isCurrent: boolean;
  isFuture: boolean;
  hasData: boolean;
  totals: PerfTotals;
  rates: {
    bookedPct: number | null;
    showPct: number | null;
    offerPct: number | null;
    closePct: number | null;
  };
  daysSubmitted: number;
  daysInMonth: number;
  avgCash: number | null;
  avgDeal: number | null;
  goal: number | null;
  pctGoal: number | null;
  momPct: number | null;
}

export interface SelfYearPerformance {
  year: number;
  currentYear: number;
  months: YearMonthRow[];
  yearTotals: PerfTotals;
  activeMonths: number;
  bestMonthKey: string | null;
  avgCashPerActiveMonth: number;
  truncated: boolean;
}

export interface DailyEntryRow {
  dayKey: string;
  measured: Record<string, number>;
  /** False when the bot recorded nothing — ask them to fill it in, not confirm. */
  measuredExists: boolean;
  reported: Record<string, number | undefined> | null;
  confirmedAt: number | null;
  managerCorrected: Record<string, number | undefined> | null;
}

export interface LeaderboardRow {
  closerId: string;
  name: string;
  isYou: boolean;
  booked: number;
  taken: number;
  offers: number;
  closes: number;
  cash: number;
  avgCash: number | null;
  avgDeal: number | null;
  showPct: number | null;
  closePct: number | null;
}

export async function getCloserPerformance(monthKey?: string) {
  return closerFetch<SelfPerformance>("/getCloserPerformance", {
    ...(monthKey ? { monthKey } : {}),
  });
}

export async function getCloserDailyEntries(monthKey: string) {
  return closerFetch<{ monthKey: string; rows: DailyEntryRow[] }>(
    "/getCloserDailyEntries",
    { monthKey },
  );
}

export async function getTeamLeaderboardForCloser(monthKey?: string) {
  return closerFetch<{ monthKey: string; rows: LeaderboardRow[] }>(
    "/getTeamLeaderboardForCloser",
    { ...(monthKey ? { monthKey } : {}) },
  );
}

export async function getCloserYearPerformance(year?: number) {
  return closerFetch<SelfYearPerformance>("/getCloserYearPerformance", {
    ...(typeof year === "number" ? { year } : {}),
  });
}

export async function saveCloserDailyEntry(
  dayKey: string,
  values: Record<string, number | null>,
): Promise<{ success: boolean; error?: string }> {
  // This one reports its own failures rather than throwing: a rejected value
  // ("cash cannot be negative") belongs next to the field, not in a boundary.
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("sequ3nce_closer_session")
      : null;
  try {
    const res = await fetch(`${CONVEX_SITE_URL}/saveCloserDailyEntry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayKey,
        values,
        ...(token ? { sessionToken: token } : {}),
      }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (res.status === 401) return { success: false, error: "Please sign in again" };
    return { success: !!data.success, error: data.error };
  } catch {
    return { success: false, error: "Could not reach the server" };
  }
}
