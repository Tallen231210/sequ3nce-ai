"use client";

import { createContext, useContext } from "react";

/** One EOD field, as the server describes it (convex/setterEodFields.ts). */
export interface EodFieldView {
  key: string;
  label: string;
  hint: string;
  optional: boolean;
  measured?: boolean;
}

/** A filed day, every field the table knows; absent optionals are null. */
export interface EodEntryView {
  dials: number;
  pickUps: number;
  sets: number;
  newLeadsHit: number;
  followUps: number;
  callsOnCalendar: number | null;
  callsShown: number | null;
  callsClosed: number | null;
  cashCollected: number | null;
  newSelfBooked: number | null;
  contacted: number | null;
  reached: number | null;
  confirmed: number | null;
  rescheduled: number | null;
  cancelled: number | null;
  confirmedOnCalendar: number | null;
  confirmedShowed: number | null;
  formShape: "booking" | "confirmation";
  note: string;
  submittedAt: number;
}

export interface SetterHome {
  name: string;
  pod: string | null;
  /** Which form this person files — the server decides from the roster role. */
  role: "booking" | "confirmation";
  eodFields: EodFieldView[];
  teamName: string;
  today: string;
  filedToday: boolean;
  todayEntry: EodEntryView | null;
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
