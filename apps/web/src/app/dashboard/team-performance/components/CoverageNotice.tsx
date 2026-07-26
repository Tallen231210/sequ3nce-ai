"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, UserPlus } from "lucide-react";
import { fmtNum, fmtPct } from "../lib/format";
import { MONO } from "@/components/analytics/primitives/typography";

interface Coverage {
  taken: number;
  missingOutcomes: number;
  outcomeCoverage: number | null;
  lowCoverage: boolean;
}

/**
 * Shown when most calls carry no logged outcome. Everything below "Taken" —
 * offers, closes, cash — exists only if a closer filled the post-call form,
 * so a board that quietly rendered "0 closes" would be presenting an absence
 * of data as a business result. This says so, and points at the fix.
 */
export function CoverageNotice({ coverage }: { coverage: Coverage }) {
  if (!coverage.lowCoverage || coverage.taken === 0) return null;

  const logged = Math.max(0, coverage.taken - coverage.missingOutcomes);
  const pct = coverage.outcomeCoverage === null ? 0 : coverage.outcomeCoverage * 100;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-5 dark:border-amber-800/70 dark:bg-amber-950/20">
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
          <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {fmtNum(coverage.missingOutcomes)} of {fmtNum(coverage.taken)} calls
            have no logged outcome
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-amber-800 dark:text-amber-300/85">
            Offers, closes and cash come from the post-call form.{" "}
            {logged === 0 ? (
              <>Not one call this period has one,</>
            ) : (
              <>
                Only{" "}
                <span className={`font-semibold ${MONO}`}>
                  {fmtPct(pct)}
                </span>{" "}
                of calls this period have one,
              </>
            )}{" "}
            so the bottom half of this board reads near zero — that reflects
            missing paperwork, not missing results. Bookings, calls taken and
            show rate are unaffected.
          </p>

          {/* Coverage meter — the number they need to move. */}
          <div className="mt-3.5 max-w-sm">
            <div className="flex items-center justify-between text-[11px] font-medium text-amber-800 dark:text-amber-300/80">
              <span>Outcome coverage</span>
              <span className={`${MONO}`}>
                {fmtNum(logged)} / {fmtNum(coverage.taken)}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-amber-200/70 dark:bg-amber-900/50">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{ width: `${Math.max(pct, 1.5)}%` }}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              href="/dashboard/team"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 underline-offset-2 hover:underline dark:text-amber-200"
            >
              Check who has the desktop app
              <ArrowRight className="h-3 w-3" />
            </Link>
            <span className="text-xs text-amber-700/80 dark:text-amber-400/70">
              Calls recorded by the meeting bot log their outcome automatically.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Bookings we could attribute to a person, just not to anyone with a seat —
 * typically a rep the team never onboarded. Naming them turns an anonymous
 * gap in the leaderboard into something a manager can act on.
 */
export function UnknownRepsNotice({
  unknownReps,
  bookedUnattributed,
}: {
  unknownReps: Array<{ name: string; count: number }>;
  bookedUnattributed: number;
}) {
  if (unknownReps.length === 0) return null;

  const named = unknownReps.reduce((s, r) => s + r.count, 0);
  const unnamed = Math.max(0, bookedUnattributed - named);

  return (
    <div className="rounded-xl border border-border bg-muted/40 px-5 py-4">
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background">
          <UserPlus className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            {unknownReps.length === 1
              ? `${fmtNum(unknownReps[0].count)} bookings belong to someone without a seat`
              : `${fmtNum(named)} bookings belong to people without a seat`}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            These meetings name a rep on the invite who isn&apos;t on Sequ3nce.
            They count in the team total but can&apos;t appear on the
            leaderboard — add them to your team and their numbers fill in.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {unknownReps.slice(0, 6).map((r) => (
              <span
                key={r.name}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs"
              >
                <span className="font-medium">{r.name}</span>
                <span className={`${MONO} text-muted-foreground`}>
                  {fmtNum(r.count)}
                </span>
              </span>
            ))}
            {unnamed > 0 && (
              <span className="inline-flex items-center rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">
                {fmtNum(unnamed)} unnamed
              </span>
            )}
            <Link
              href="/dashboard/team"
              className="ml-1 inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline"
            >
              Manage team
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
