"use client";

import type { CardVM, MetricVM } from "../lib/cards";
import { hours, int, money, pct } from "../lib/format";

function show(m: MetricVM, v: number | null | undefined): string {
  if (m.format === "pct") return pct(v);
  if (m.format === "money") return money(v);
  if (m.format === "hours") return hours(v);
  if (m.format === "ratio") return v === null || v === undefined ? "—" : v.toFixed(1);
  if (m.format === "days") return v === null || v === undefined ? "—" : `${v}d`;
  return int(v);
}

function Metric({ m }: { m: MetricVM }) {
  const hasFiled = m.filed !== undefined;
  return (
    <div className="min-w-0" title={m.hint}>
      <div className="text-[11px] uppercase leading-tight tracking-wide text-muted-foreground">{m.label}</div>
      <div className="text-base font-semibold tabular-nums">{show(m, m.measured)}</div>
      {m.detail && <div className="text-[11px] tabular-nums text-muted-foreground">{m.detail}</div>}
      {hasFiled && (
        <div className={`text-[11px] tabular-nums ${m.drift ? "font-medium text-amber-700" : "text-muted-foreground"}`} title="What they typed on their EOD for the same days">
          filed {show(m, m.filed)}
        </div>
      )}
    </div>
  );
}

/** How their EODs held up against the CRM and the calendar over the range — the numbers are in the drawer's EOD tab. */
function Consistency({ c }: { c: NonNullable<CardVM["consistency"]> }) {
  const filed = c.daysDue > 0 ? `filed ${c.daysFiled} of ${c.daysDue} due days` : c.daysFiled > 0 ? `filed ${c.daysFiled} ${c.daysFiled === 1 ? "day" : "days"}` : "nothing filed yet";
  const off = c.daysFiled === 0 ? null : c.daysFlagged === 0 ? "all within tolerance of the CRM and the calendar" : `${c.daysFlagged} ${c.daysFlagged === 1 ? "day" : "days"} off vs measured`;
  const late = c.daysDue > c.daysFiled;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 border-t border-border pt-2 text-[11px]" title="EOD entries beside what the CRM and the calendar measured for the same days. Open the card for the numbers.">
      <span className="uppercase tracking-wide text-muted-foreground">EODs</span>
      <span className={late ? "font-medium text-amber-700" : "text-muted-foreground"}>{filed}</span>
      {off && (
        <>
          <span className="text-muted-foreground">·</span>
          <span className={c.daysFlagged > 0 ? "font-medium text-amber-700" : "text-muted-foreground"}>{off}</span>
        </>
      )}
    </div>
  );
}

function SetterCard({ card, onOpen }: { card: CardVM; onOpen: (card: CardVM) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      className="w-full rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{card.name}</span>
        {!card.active && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">inactive</span>}
        {card.team !== "dm" && !card.linked && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-800" title="No Close user linked on the roster, so dials and texts can't be counted">
            not linked
          </span>
        )}
        {!card.configured && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-800">not in roster</span>
        )}
        {card.note && <span className="text-xs text-muted-foreground">{card.note}</span>}
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-4 xl:grid-cols-6">
        {card.metrics.map((m) => (
          <Metric key={m.key} m={m} />
        ))}
      </div>
      {card.consistency && <Consistency c={card.consistency} />}
    </button>
  );
}

/** One team type: a card per person, measured beside filed. */
export function TeamSection({
  label,
  description,
  cards,
  onOpen,
}: {
  label: string;
  description: string;
  cards: CardVM[];
  onOpen: (card: CardVM) => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold">{label}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {cards.length === 0 && <p className="text-sm text-muted-foreground">Nobody on this team yet — add them in settings.</p>}
        {cards.map((c) => (
          <SetterCard key={c.key} card={c} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
