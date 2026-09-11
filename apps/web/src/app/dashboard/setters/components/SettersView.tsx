"use client";

import { useMemo, useState, type ReactNode } from "react";
import { buildCards, readsCameUpShort, type ActivityData, type BookingsData, type CadenceData, type CardVM, type CrossCheckData, type SetsData, type SpeedData } from "../lib/cards";
import { UnlabeledPanel, type RosterOption } from "./UnlabeledPanel";
import { NoOutcomePanel } from "./NoOutcomePanel";
import { SetterDrawer } from "./SetterDrawer";
import { TeamSection } from "./TeamSection";
import { TeamStrip } from "./TeamStrip";

export type SettersTab = "setters" | "eods" | "attention";
type TeamFilter = "all" | "dm" | "outbound" | "confirmation";

/** The page body given its data — what the dev preview renders too. The strip stays on top; three tabs under it. */
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
  tab,
  onTab,
  eodBoard,
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
  /** The data-health card, shown under Needs attention. */
  health?: ReactNode;
  tab: SettersTab;
  onTab: (tab: SettersTab) => void;
  /** The filed-EODs board, shown under the EODs tab. */
  eodBoard?: ReactNode;
}) {
  const [open, setOpen] = useState<CardVM | null>(null);
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const cards = useMemo(() => buildCards(bookings, sets, activity, speed, cadence, checks), [bookings, sets, activity, speed, cadence, checks]);
  const stillLoading = !sets || !activity || speed === undefined || cadence === undefined || checks === undefined;
  const cameUpShort = readsCameUpShort(bookings, activity, sets, speed, cadence, checks);
  const sections: Array<{ team: "dm" | "outbound" | "confirmation"; description: string }> = [
    { team: "dm", description: "Book from the DM link. No dials to count — bookings and shows only." },
    { team: "outbound", description: "Work leads in the CRM. Dials, connects and texts are theirs; sets are credited by the initials on the booking, a claim, or — where the team allows it — a call or text in the CRM." },
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
  const noOutcome = live.filter((r) => r.verdict.due && r.verdict.result === "unknown").length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const stripNotes = [
    ...(unlabeledWorkedByOutbound > 0
      ? [`${bookings.labels.confirmation}: self-booked calls the confirmation setter handled, a closer or the owner confirmed, or nobody did. ${plural(unlabeledWorkedByOutbound, "self-booked call", "self-booked calls")} worked only by an outbound setter ${unlabeledWorkedByOutbound === 1 ? "sits" : "sit"} in ${bookings.labels.unlabeled}.`]
      : []),
    ...(unlabeled.length > 0
      ? [`${bookings.labels.unlabeled}: ${plural(unlabeled.length, "booking", "bookings")} with no setter named — ${unlabeledSelfBooked} self-booked${unlabeledWorkedByOutbound > 0 ? ` (${unlabeledWorkedByOutbound} worked by an outbound setter, the rest with no lead in the CRM or touched only by closers)` : ""}, ${unlabeled.length - unlabeledSelfBooked} hand-made or off-list. Listed under Needs attention.`]
      : []),
  ];
  const attentionCount = unlabeled.length + noOutcome;
  const tabs: Array<{ id: SettersTab; label: string }> = [
    { id: "setters", label: "Setters" },
    { id: "eods", label: "EODs" },
    { id: "attention", label: attentionCount > 0 ? `Needs attention · ${attentionCount}` : "Needs attention" },
  ];
  const filters: Array<{ id: TeamFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "dm", label: bookings.labels.dm },
    { id: "outbound", label: bookings.labels.outbound },
    { id: "confirmation", label: bookings.labels.confirmation },
  ];
  // One definitions list for the whole page: every metric label once, in card order.
  const definitions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const team of ["outbound", "confirmation", "dm"] as const) for (const c of cards[team]) for (const m of c.metrics) if (!seen.has(m.label)) seen.set(m.label, m.hint);
    return Array.from(seen.entries());
  }, [cards]);
  return (
    <>
      <TeamStrip strip={bookings.strip} basis={bookings.basis} notes={stripNotes} />
      <nav className="flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label="Setters page">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.id ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "setters" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-background p-0.5 text-sm" role="tablist" aria-label="Team">
              {filters.map((f) => (
                <button key={f.id} type="button" role="tab" aria-selected={teamFilter === f.id} onClick={() => setTeamFilter(f.id)} className={`rounded-md px-3 py-1.5 ${teamFilter === f.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                  {f.label}
                </button>
              ))}
            </div>
            {definitions.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none hover:text-foreground">Definitions</summary>
                <dl className="mt-2 grid max-w-3xl gap-x-4 gap-y-1 sm:grid-cols-2">
                  {definitions.map(([label, hint]) => (
                    <div key={label} className="flex gap-2">
                      <dt className="shrink-0 font-medium text-foreground">{label}</dt>
                      <dd>{hint}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </div>
          {stillLoading && <p className="text-xs text-muted-foreground">Still loading the rest of the numbers…</p>}
          {!stillLoading && cameUpShort && (
            <p className="text-xs text-muted-foreground">Some days in this range were too busy to read in one go, so a few of these counts may be low.</p>
          )}
          {sections
            .filter((s) => teamFilter === "all" || s.team === teamFilter)
            .map((s) => (
              <TeamSection key={s.team} label={bookings.labels[s.team]} description={s.description} cards={cards[s.team]} onOpen={setOpen} />
            ))}
        </>
      )}
      {tab === "eods" && eodBoard}
      {tab === "attention" && (
        <>
          <UnlabeledPanel records={bookings.records} notASet={bookings.notASet} rosters={rosterOptions} clerkId={clerkId} timezone={bookings.range.timezone} />
          <NoOutcomePanel records={bookings.records} timezone={bookings.range.timezone} />
          {health}
          {attentionCount === 0 && <p className="text-sm text-muted-foreground">Nothing needs attention in this range.</p>}
        </>
      )}
      <SetterDrawer card={open} records={bookings.records} timezone={bookings.range.timezone} clerkId={clerkId} rangeStart={rangeStart} rangeEnd={rangeEnd} checks={checks} onClose={() => setOpen(null)} />
    </>
  );
}
