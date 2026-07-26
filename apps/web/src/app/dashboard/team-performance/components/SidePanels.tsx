"use client";

import { Gift, TrendingUp } from "lucide-react";
import { fmtCurrency, fmtPct } from "../lib/format";
import { MONO } from "@/components/analytics/primitives/typography";

interface Projection {
 projectedCash: number; target: number; collected: number; remaining: number;
  needPerDay: number; daysElapsed: number; daysLeft: number;
  onTrack: boolean; pctOfTarget: number | null; isFinal: boolean;
}

/** Pace against the month's cash target. */
export function ProjectionCard({ projection }: { projection: Projection }) {
  const p = projection;
  const hasTarget = p.target > 0;
  const pct = Math.min(100, Math.max(0, p.pctOfTarget ?? 0));

  return (
    <div className="rounded-xl border border-border bg-card p-5">
 <div className="flex items-center gap-2">
 <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
 <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
 {p.isFinal ? "Final" : "Pace"}
 </h3>
        {!p.isFinal && hasTarget && (
          <span
            className={
              "ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold " +
 (p.onTrack
                ? "bg-emerald-100 text-emerald-700"
 : "bg-rose-100 text-rose-700")
 }
          >
            {p.onTrack ? "On track" : "Behind"}
 </span>
        )}
      </div>

      <div className="mt-3">
 <div className={`text-2xl font-semibold tracking-tight ${MONO}`}>
          {fmtCurrency(p.collected)}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
 collected {p.isFinal ? "" : `· day ${p.daysElapsed}`}
 {hasTarget && ` of ${fmtCurrency(p.target)} target`}
        </p>
      </div>

      {hasTarget && (
        <>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
 <div
              className={
                "h-full rounded-full transition-all " +
 (pct >= 100 ? "bg-emerald-500" : "bg-foreground/70")
 }
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className={`mt-1.5 flex justify-between text-[11px] ${MONO} text-muted-foreground`}>
            <span>{fmtPct(p.pctOfTarget)}</span>
            <span>{fmtCurrency(p.remaining)} to go</span>
          </div>
        </>
      )}

      {!p.isFinal && (
        <dl className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
 <div className="flex justify-between">
 <dt className="text-muted-foreground">Projected</dt>
 <dd className={`font-medium ${MONO}`}>
              {fmtCurrency(p.projectedCash)}
            </dd>
          </div>
          {hasTarget && p.daysLeft > 0 && (
            <div className="flex justify-between">
 <dt className="text-muted-foreground">Needed / day</dt>
 <dd className={`font-medium ${MONO}`}>
                {fmtCurrency(p.needPerDay)}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
 <dt className="text-muted-foreground">Days left</dt>
 <dd className={`font-medium ${MONO}`}>{p.daysLeft}</dd>
          </div>
        </dl>
      )}

      {!hasTarget && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
 Set monthly cash goals for your closers to see pace and projection.
        </p>
      )}
    </div>
  );
}

interface Prize {
  name: string | null; emoji: string | null; target: number;
  collected: number; pct: number | null; unlocked: boolean; remaining: number;
}

/** The team prize race. Hidden entirely unless a prize is configured. */
export function PrizeCard({ prize }: { prize: Prize }) {
  if (!prize.name || prize.target <= 0) return null;
  const pct = Math.min(100, Math.max(0, prize.pct ?? 0));

  return (
    <div
      className={
        "rounded-xl border p-5 " +
 (prize.unlocked
          ? "border-emerald-300 bg-emerald-50/60"
 : "border-border bg-card")
 }
    >
      <div className="flex items-center gap-2">
 <Gift className="h-3.5 w-3.5 text-muted-foreground" />
 <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Team prize</h3>
 </div>

      <div className="mt-3 flex items-center gap-3">
 {prize.emoji && (
          <span className="text-2xl leading-none" aria-hidden>
 {prize.emoji}
          </span>
        )}
        <div className="min-w-0">
 <p className="truncate text-sm font-medium">{prize.name}</p>
 <p className={`text-xs text-muted-foreground ${MONO}`}>
            {fmtCurrency(prize.collected)} / {fmtCurrency(prize.target)}
          </p>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
 <div
          className={
            "h-full rounded-full transition-all " +
 (prize.unlocked ? "bg-emerald-500" : "bg-foreground/70")
 }
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2 text-xs">
 {prize.unlocked ? (
          <span className="font-semibold text-emerald-700">
            Unlocked
          </span>
        ) : (
          <span className={`text-muted-foreground ${MONO}`}>
            {fmtCurrency(prize.remaining)} to unlock
          </span>
        )}
      </p>
    </div>
  );
}
