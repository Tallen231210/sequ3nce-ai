"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getCloserPerformance,
  getCloserDailyEntries,
  saveCloserDailyEntry,
  getTeamLeaderboardForCloser,
  getCloserYearPerformance,
  type SelfPerformance,
  type SelfYearPerformance,
  type DailyEntryRow,
  type LeaderboardRow,
} from "@/lib/closer/client";
import { getCloserInfo } from "@/lib/closer/session";
import { PerformanceDayForm } from "./PerformanceDayForm";
import { PerformanceGrid } from "./PerformanceGrid";
import { PerformanceStats } from "./PerformanceStats";
import { PerformanceYear } from "./PerformanceYear";

type Section = "today" | "history" | "stats" | "year";

const SECTIONS: Array<[Section, string]> = [
  ["today", "Today"],
  ["history", "Previous days"],
  ["stats", "My stats"],
  ["year", "Year"],
];

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map((s) => parseInt(s, 10));
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Where closers report their day.
 *
 * The manager's board counts only what is submitted here, so this is the
 * source of the team's numbers rather than a supplement to them. Everything
 * arrives pre-filled from what was recorded, which makes a normal day a glance
 * and a tap — but nothing counts until it is submitted.
 *
 * Ported from the desktop app. No closerId is passed anywhere: the server
 * resolves that from the session.
 */
export function NumbersView() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("today");
  const [monthKey] = useState(currentMonthKey);

  const [perf, setPerf] = useState<SelfPerformance | null>(null);
  const [rows, setRows] = useState<DailyEntryRow[]>([]);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [yearData, setYearData] = useState<SelfYearPerformance | null>(null);
  const [yearLoading, setYearLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingDay, setSavingDay] = useState<string | null>(null);
  const [errorDay, setErrorDay] = useState<Record<string, string | null>>({});

  const closerId = getCloserInfo()?.closerId ?? "";

  /** Any failure here means we couldn't establish who this is — sign in again
   *  rather than showing an error the closer can do nothing about. */
  const guard = useCallback(() => router.replace("/app/login"), [router]);

  const load = useCallback(async () => {
    try {
      const [p, entries, lb] = await Promise.all([
        getCloserPerformance(closerId, monthKey),
        getCloserDailyEntries(closerId, monthKey),
        getTeamLeaderboardForCloser(closerId, monthKey),
      ]);
      setPerf(p);
      setRows(entries?.rows ?? []);
      setBoard(lb?.rows ?? []);
    } catch {
      guard();
    } finally {
      setLoading(false);
    }
  }, [monthKey, closerId, guard]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fetched only once the Year tab is opened — it reads a year of the team's
  // daily rows, which is no small query to run for a tab nobody clicked.
  useEffect(() => {
    if (section !== "year") return;
    let cancelled = false;
    setYearLoading(true);
    void getCloserYearPerformance(closerId, year)
      .then((d) => {
        if (cancelled) return;
        setYearData(d);
        setYearLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        guard();
        setYearLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, year, closerId, guard]);

  const submitDay = async (
    dayKey: string,
    values: Record<string, number | null>,
  ) => {
    setSavingDay(dayKey);
    setErrorDay((e) => ({ ...e, [dayKey]: null }));
    const res = await saveCloserDailyEntry(closerId, dayKey, values);
    if (!res.success) {
      setErrorDay((e) => ({ ...e, [dayKey]: res.error ?? "Could not save" }));
      setSavingDay(null);
      return;
    }
    // Reload rather than patch locally: a manager may have corrected the day
    // since it loaded, and their figure is the one that counts.
    await load();
    setSavingDay(null);
  };

  // Editing a cell submits that day: a closer correcting a number IS a closer
  // telling us the day is right, so it needs no separate confirm action.
  const commitCell = (
    dayKey: string,
    key: string,
    value: number | null,
  ) => submitDay(dayKey, { [key]: value });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading your numbers…
      </div>
    );
  }

  const today = rows[0] ?? null;
  const previous = rows.slice(1);
  const outstanding = rows.filter((r) => !r.confirmedAt).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My numbers</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            What you submit here is what your team&apos;s board shows
          </p>
        </div>
        {perf && (
          <div className="text-right">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Submitted
            </div>
            <div className="font-mono text-xl font-bold leading-tight">
              {perf.daysSubmitted}/{perf.daysElapsed}
            </div>
          </div>
        )}
      </div>

      {outstanding > 0 && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
          <p className="text-xs leading-relaxed text-amber-800">
            <span className="font-semibold">
              {outstanding} day{outstanding === 1 ? "" : "s"} not submitted.
            </span>{" "}
            Days you don&apos;t submit don&apos;t count toward your totals or
            the team board — they aren&apos;t estimated for you.
          </p>
        </div>
      )}

      {/* Scrolls sideways rather than wrapping: four tabs on a narrow laptop
          should stay one row, the way tabs read everywhere else. */}
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={
              "relative shrink-0 px-3.5 py-2 text-sm font-medium transition-colors " +
              (section === id
                ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {label}
            {id === "history" && outstanding > 1 && (
              <span className="ml-1.5 text-[10px] font-semibold text-amber-600">
                {outstanding - (today && !today.confirmedAt ? 1 : 0)}
              </span>
            )}
          </button>
        ))}
      </nav>

      {section === "today" && today && (
        <div className="rounded-lg border border-border bg-muted/30 p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">
              {dayLabel(today.dayKey)}
            </h2>
            {today.confirmedAt && (
              <span className="text-[11px] font-medium text-emerald-600">
                Submitted
              </span>
            )}
          </div>

          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            {today.confirmedAt
              ? "You’ve submitted today. Change anything that needs correcting and hit Update — you can do this any time, including weeks from now."
              : today.measuredExists
                ? "These are the calls we recorded today. Check them, fix anything that’s off, and submit."
                : "We only capture numbers automatically when the meeting bot joins your calls — it didn’t today, so nothing is filled in. Enter your day below."}
          </p>

          <PerformanceDayForm
            row={today}
            saving={savingDay === today.dayKey}
            error={errorDay[today.dayKey] ?? null}
            onSubmit={(v) => void submitDay(today.dayKey, v)}
          />
        </div>
      )}

      {section === "history" && (
        <PerformanceGrid
          rows={previous}
          savingDay={savingDay}
          errors={errorDay}
          onCommit={(d, k, v) => void commitCell(d, k, v)}
          onConfirm={(d) => void submitDay(d, {})}
        />
      )}

      {section === "stats" && <PerformanceStats perf={perf} board={board} />}

      {section === "year" &&
        (yearLoading && !yearData ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading your year…
          </div>
        ) : (
          <PerformanceYear data={yearData} onYearChange={setYear} />
        ))}
    </div>
  );
}
