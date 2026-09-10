"use client";

import { useMemo, useState, type ReactNode } from "react";
import { buildCards, type ActivityData, type BookingsData, type CadenceData, type CardVM, type CrossCheckData, type SetsData, type SpeedData } from "../lib/cards";
import { CoveragePanel } from "./CoveragePanel";
import { UnlabeledPanel, type RosterOption } from "./UnlabeledPanel";
import { NoOutcomePanel } from "./NoOutcomePanel";
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
  const partial = [
    ...(sets?.truncated.length ? [`sets: ${sets.truncated.join(", ")}`] : []),
    ...(speed?.truncated.length ? [`speed: ${speed.truncated.join(", ")}`] : []),
    ...(cadence?.truncated.length ? [`cadence: ${cadence.truncated.join(", ")}`] : []),
    ...(checks?.truncated.length ? [`EOD cross-check: ${checks.truncated.join(", ")}`] : []),
  ];
  const coverage = [...bookings.coverage, ...(activity?.coverage ?? []), ...(partial.length ? [`Partial: some reads hit their cap (${partial.join(" · ")}).`] : [])];
  const loadingNote = !sets || !activity || speed === undefined || cadence === undefined || checks === undefined ? "Still reading sets, Close activity, speed, cadence and the EOD cross-check…" : null;
  const sections: Array<{ team: "dm" | "outbound" | "confirmation"; description: string }> = [
    { team: "dm", description: "Book from the DM link. No dials to count — bookings and shows only." },
    { team: "outbound", description: "Work leads in Close. Dials, connects and texts are theirs; sets are credited by the initials on the booking, a claim, or — where the team allows it — a Close touch." },
    { team: "confirmation", description: "Call people who booked themselves. Coverage and response time are the job; shows are the result." },
  ];
  const rosterOptions: RosterOption[] = [
    ...bookings.outbound.map((r) => ({ rosterId: r.rosterId, name: r.name, role: "booking" as const, active: r.active })),
    ...bookings.confirmation.map((r) => ({ rosterId: r.rosterId, name: r.name, role: "confirmation" as const, active: r.active })),
  ];
  const live = bookings.records.filter((r) => !r.isFollowUp);
  const unlabeled = live.filter((r) => r.lane === "unattributed");
  const unlabeledSelfBooked = unlabeled.filter((r) => r.isFunnel).length;
  const unlabeledWorkedByOutbound = unlabeled.filter((r) => r.isFunnel && r.touches.some((t) => t.rosterId !== null)).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const stripNotes = [
    ...(unlabeledWorkedByOutbound > 0
      ? [`${bookings.labels.confirmation}: self-booked calls the confirmation setter handled, a closer or the owner confirmed, or nobody did. ${plural(unlabeledWorkedByOutbound, "self-booked call", "self-booked calls")} worked only by an outbound setter ${unlabeledWorkedByOutbound === 1 ? "sits" : "sit"} in ${bookings.labels.unlabeled}.`]
      : []),
    ...(unlabeled.length > 0
      ? [`${bookings.labels.unlabeled}: ${plural(unlabeled.length, "booking", "bookings")} with no setter named — ${unlabeledSelfBooked} self-booked${unlabeledWorkedByOutbound > 0 ? ` (${unlabeledWorkedByOutbound} worked by an outbound setter, the rest with no lead in Close or touched only by closers)` : ""}, ${unlabeled.length - unlabeledSelfBooked} hand-made or off-list. Listed below the sections.`]
      : []),
  ];
  return (
    <>
      <TeamStrip strip={bookings.strip} basis={bookings.basis} notes={stripNotes} />
      {health}
      {loadingNote && <p className="text-xs text-muted-foreground">{loadingNote}</p>}
      {sections.map((s) => (
        <TeamSection key={s.team} label={bookings.labels[s.team]} description={s.description} cards={cards[s.team]} onOpen={setOpen} />
      ))}
      <UnlabeledPanel records={bookings.records} notASet={bookings.notASet} rosters={rosterOptions} clerkId={clerkId} label={bookings.labels.unlabeled} timezone={bookings.range.timezone} />
      <NoOutcomePanel records={bookings.records} timezone={bookings.range.timezone} />
      <CoveragePanel lines={coverage} />
      <SetterDrawer card={open} records={bookings.records} timezone={bookings.range.timezone} clerkId={clerkId} rangeStart={rangeStart} rangeEnd={rangeEnd} checks={checks} onClose={() => setOpen(null)} />
    </>
  );
}
