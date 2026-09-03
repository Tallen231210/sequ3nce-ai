"use client";

import { createContext, useContext } from "react";

export interface SetterHome {
  name: string;
  pod: string | null;
  teamName: string;
  today: string;
  filedToday: boolean;
  todayEntry: {
    dials: number;
    pickUps: number;
    sets: number;
    newLeadsHit: number;
    followUps: number;
    callsOnCalendar: number | null;
    callsShown: number | null;
    callsClosed: number | null;
    cashCollected: number | null;
    note: string;
    submittedAt: number;
  } | null;
  /** Today and the days a setter may still file for, newest first. */
  recentDays: Array<{ dayKey: string; filed: boolean }>;
}

export const SetterContext = createContext<{
  sessionToken: string;
  home: SetterHome;
  refresh: () => void;
} | null>(null);

export function useSetter() {
  const ctx = useContext(SetterContext);
  if (!ctx) throw new Error("useSetter outside SetterShell");
  return ctx;
}
