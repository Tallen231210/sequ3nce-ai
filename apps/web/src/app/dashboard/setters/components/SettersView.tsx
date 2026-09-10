"use client";

import { useMemo, useState, type ReactNode } from "react";
import { buildCards, type ActivityData, type BookingsData, type CadenceData, type CardVM, type CrossCheckData, type SetsData, type SpeedData } from "../lib/cards";
import { CoveragePanel } from "./CoveragePanel";
import { SetterDrawer } from "./SetterDrawer";
import { TeamSection } from "./TeamSection";
import { TeamStrip } from "./TeamStrip";

/** The page body given its data — what the dev preview renders too. */
export function SettersView({
  bookings,
  sets,
  activity,
  speed,
  cadence,
  checks,
  clerkId,
  rangeStart,
  rangeEnd,
  health,
}: {
  bookings: BookingsData;
  sets: SetsData | null;
  activity: ActivityData | null;
  speed?: SpeedData | null;
  cadence?: CadenceData | null;
  checks?: CrossCheckData | null;
  clerkId: string;
  rangeStart: number;
  rangeEnd: number;
  health?: ReactNode;
}) {
  const [open, setOpen] = useState<CardVM | null>(null);
  const cards = useMemo(() => buildCards(bookings, sets, activity, speed, cadence, checks), [bookings, sets, activity, speed, cadence, checks]);
  const coverage = [...bookings.coverage, ...(activity?.coverage ?? [])];
  const loadingNote = !sets || !activity || speed === undefined || cadence === undefined || checks === undefined ? "Still reading sets, Close activity, speed, cadence and the EOD cross-check…" : null;
  const sections: Array<{ team: "dm" | "outbound" | "confirmation"; description: string }> = [
    { team: "dm", description: "Book from the DM link. No dials to count — bookings and shows only." },
    { team: "outbound", description: "Work leads in Close. Dials, connects and texts are theirs; sets are credited by initials or a Close touch." },
    { team: "confirmation", description: "Call people who booked themselves. Coverage and response time are the job; shows are the result." },
  ];
  return (
    <>
      <TeamStrip strip={bookings.strip} basis={bookings.basis} />
      {health}
      {loadingNote && <p className="text-xs text-muted-foreground">{loadingNote}</p>}
      {sections.map((s) => (
        <TeamSection key={s.team} label={bookings.labels[s.team]} description={s.description} cards={cards[s.team]} onOpen={setOpen} />
      ))}
      <CoveragePanel lines={coverage} />
      <SetterDrawer card={open} records={bookings.records} timezone={bookings.range.timezone} clerkId={clerkId} rangeStart={rangeStart} rangeEnd={rangeEnd} checks={checks} onClose={() => setOpen(null)} />
    </>
  );
}
