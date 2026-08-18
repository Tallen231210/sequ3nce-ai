"use client";

import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { ChevronRight, Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Sparkline, relativeDays } from "./Sparkline";

/* eslint-disable @typescript-eslint/no-explicit-any */

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

/**
 * The change since the previous fortnight, or nothing.
 *
 * Absent when there's no prior window and when the move is small. A column of
 * "+0%" is noise that hides the two numbers that actually moved.
 */
function Delta({ now, before }: { now: number | null; before: number | null }) {
  if (now === null || before === null) return null;
  const d = Math.round(now - before);
  if (Math.abs(d) < 5) return null;
  return (
    <span
      className={
        "ml-1 text-[11px] font-semibold " +
        (d > 0 ? "text-emerald-600" : "text-rose-600")
      }
    >
      {d > 0 ? "↑" : "↓"}
      {Math.abs(d)}
    </span>
  );
}

const SEVERITY_STYLE: Record<string, string> = {
  high: "border-rose-300 bg-rose-50 text-rose-800",
  medium: "border-amber-300 bg-amber-50 text-amber-800",
  low: "border-border bg-muted/40 text-muted-foreground",
};

export function RepCards({
  onOpenRep,
  limit,
}: {
  onOpenRep: (id: string) => void;
  limit?: number;
}) {
  const { user } = useUser();
  const data = useQuery(
    api.managerRepCards.listRepCards,
    user ? { clerkId: user.id } : "skip",
  );

  if (data === undefined) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data || data.cards.length === 0) return null;

  const cards = limit ? data.cards.slice(0, limit) : data.cards;

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Your team
        </h3>
        <span className="text-[11px] text-muted-foreground">
          last {data.windowDays} days · sorted by who needs you most
        </span>
      </div>

      <div className="space-y-2.5">
        {cards.map((c: any) => (
          <button
            key={c.closerId}
            onClick={() => onOpenRep(String(c.closerId))}
            className="block w-full rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-foreground/25"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{c.name}</span>
                <Sparkline values={c.trend} />
              </div>
              <div className="flex items-center gap-2.5">
                {/* When you last sat down with them. A manager scanning for who
                    they've neglected shouldn't have to open each rep. */}
                <span className="text-[11px] text-muted-foreground">
                  {c.lastMetAt
                    ? `spoke ${relativeDays(c.lastMetAt)}`
                    : "never recorded a 1:1"}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>

            <div className="mt-3.5 flex flex-wrap gap-x-8 gap-y-2">
              <Stat label="Taken" value={String(c.taken)} />
              <Stat
                label="Show"
                value={pct(c.showPct)}
                delta={<Delta now={c.showPct} before={c.priorShowPct} />}
              />
              <Stat
                label="Offer→close"
                value={pct(c.offerClosePct)}
                delta={<Delta now={c.offerClosePct} before={c.priorOfferClosePct} />}
              />
              <Stat
                label="Close"
                value={pct(c.closePct)}
                delta={<Delta now={c.closePct} before={c.priorClosePct} />}
              />
              <Stat label="Closes" value={String(c.closes)} />
              <Stat label="Cash" value={money(c.cash)} />
            </div>

            {/* What was agreed last time, so the next one-to-one starts where
                the last one ended rather than from a blank page. */}
            {c.lastAgreements.length > 0 && (
              <div className="mt-3.5 border-t border-border/60 pt-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Agreed last time
                </div>
                <ul className="mt-1.5 space-y-1">
                  {c.lastAgreements.map((a: string, i: number) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {c.suggestions.length > 0 && (
              <ul className="mt-3.5 space-y-1.5">
                {c.suggestions.map((s: any) => (
                  <li
                    key={s.code}
                    className={
                      "rounded-lg border px-3 py-2 text-[13px] " +
                      (SEVERITY_STYLE[s.severity] ?? SEVERITY_STYLE.low)
                    }
                  >
                    <span className="font-medium">{s.text}</span>
                    {/* The number that produced it, always — so a manager can
                        see why rather than take our word for it. */}
                    <span className="ml-1.5 opacity-70">— {s.evidence}</span>
                  </li>
                ))}
              </ul>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-[17px] font-semibold tracking-tight">
        {value}
        {delta}
      </div>
    </div>
  );
}
