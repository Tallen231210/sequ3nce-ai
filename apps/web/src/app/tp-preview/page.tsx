"use client";

/**
 * DEV-ONLY visual preview for the Team Performance Sheet.
 *
 * Renders the real components against fixture data so the design can be
 * reviewed without a signed-in session. Returns 404 in production builds —
 * this must never be reachable by a customer.
 */

import { useState } from "react";
import { notFound } from "next/navigation";
import { TeamView } from "../dashboard/team-performance/components/TeamView";
import { PeriodNav } from "../dashboard/team-performance/components/PeriodNav";

const RAG_ALL = (
  a: string, b: string, c: string, d: string,
) => ({ bookedPct: a, showPct: b, offerClosePct: c, closePct: d }) as never;

/** Remotestack, July 2026 — real numbers: bookings but almost no logged outcomes. */
const LOW_COVERAGE = {
  monthKey: "2026-07",
  isCurrentMonth: true,
  timezone: "America/New_York",
  targets: { bookedPct: 70, showPct: 65, offerClosePct: 40, closePct: 25 },
  compPct: 20,
  teamTotals: {
    slots: 611, booked: 504, taken: 47, offers: 0, closes: 0,
    cash: 0, contractValue: 0, missingOutcomes: 47,
  },
  teamRates: { bookedPct: 82.5, showPct: 9.3, offerClosePct: null, closePct: 0 },
  teamRatesRag: RAG_ALL("green", "red", "na", "red"),
  bookedUnattributed: 226,
  unknownReps: [{ name: "Callum B", count: 204 }],
  coverage: {
    taken: 47, missingOutcomes: 47, outcomeCoverage: 0, lowCoverage: true,
  },
  economics: { adSpend: 0, costPerBooked: null, teamNet: 0 },
  perCloser: [
    {
      closerId: "a", name: "Gianni Scott",
      totals: { slots: 260, booked: 214, taken: 20, offers: 0, closes: 0, cash: 0, contractValue: 0, missingOutcomes: 20 },
      rates: { bookedPct: 82.3, showPct: 9.3, offerClosePct: null, closePct: 0 },
      rag: RAG_ALL("green", "red", "na", "red"),
      avgDeal: null, net: 0, goal: null, pctGoal: null, wowPct: null,
      overriddenFields: [], openHoursPerDay: 4.5,
    },
    {
      closerId: "b", name: "Anthony",
      totals: { slots: 205, booked: 171, taken: 6, offers: 0, closes: 0, cash: 0, contractValue: 0, missingOutcomes: 6 },
      rates: { bookedPct: 83.4, showPct: 3.5, offerClosePct: null, closePct: 0 },
      rag: RAG_ALL("green", "red", "na", "red"),
      avgDeal: null, net: 0, goal: null, pctGoal: null, wowPct: null,
      overriddenFields: [], openHoursPerDay: 4.0,
    },
    {
      closerId: "c", name: "Nick",
      totals: { slots: 146, booked: 119, taken: 21, offers: 0, closes: 0, cash: 0, contractValue: 0, missingOutcomes: 21 },
      rates: { bookedPct: 81.5, showPct: 17.6, offerClosePct: null, closePct: 0 },
      rag: RAG_ALL("green", "red", "na", "red"),
      avgDeal: null, net: 0, goal: null, pctGoal: null, wowPct: null,
      overriddenFields: [], openHoursPerDay: 7.2,
    },
  ],
  weekCash: [0, 0, 0, 0, 0],
  projection: {
    projectedCash: 0, target: 0, collected: 0, remaining: 0, needPerDay: 0,
    daysElapsed: 25, daysLeft: 6, onTrack: true, pctOfTarget: null, isFinal: false,
  },
  teamTarget: 0, sumRepGoals: 0,
  prize: { name: null, emoji: null, target: 0, collected: 0, pct: null, unlocked: false, remaining: 0 },
  activeClosers: 3,
};

/** A team using the product fully — the state this board is designed for. */
const HEALTHY = {
  ...LOW_COVERAGE,
  teamTotals: {
    slots: 420, booked: 310, taken: 214, offers: 168, closes: 61,
    cash: 427_500, contractValue: 980_000, missingOutcomes: 12,
  },
  teamRates: { bookedPct: 73.8, showPct: 69, offerClosePct: 36.3, closePct: 28.5 },
  teamRatesRag: RAG_ALL("green", "green", "amber", "green"),
  bookedUnattributed: 4,
  unknownReps: [],
  coverage: { taken: 214, missingOutcomes: 12, outcomeCoverage: 0.944, lowCoverage: false },
  economics: { adSpend: 62_000, costPerBooked: 200, teamNet: 280_900 },
  perCloser: [
    {
      closerId: "a", name: "Marcus Webb",
      totals: { slots: 148, booked: 112, taken: 84, offers: 71, closes: 27, cash: 196_000, contractValue: 410_000, missingOutcomes: 3 },
      rates: { bookedPct: 75.7, showPct: 75, offerClosePct: 38, closePct: 32.1 },
      rag: RAG_ALL("green", "green", "green", "green"),
      avgDeal: 7259, net: 134_400, goal: 180_000, pctGoal: 108.9, wowPct: 14,
      overriddenFields: [], openHoursPerDay: 2.4,
    },
    {
      closerId: "b", name: "Priya Raman",
      totals: { slots: 142, booked: 108, taken: 76, offers: 58, closes: 21, cash: 151_500, contractValue: 340_000, missingOutcomes: 4 },
      rates: { bookedPct: 76.1, showPct: 70.4, offerClosePct: 36.2, closePct: 27.6 },
      rag: RAG_ALL("green", "green", "amber", "green"),
      avgDeal: 7214, net: 99_600, goal: 160_000, pctGoal: 94.7, wowPct: -6,
      overriddenFields: ["taken"], openHoursPerDay: 3.1,
    },
    {
      closerId: "c", name: "Dev Okonkwo",
      totals: { slots: 130, booked: 90, taken: 54, offers: 39, closes: 13, cash: 80_000, contractValue: 230_000, missingOutcomes: 5 },
      rates: { bookedPct: 69.2, showPct: 60, offerClosePct: 33.3, closePct: 24.1 },
      rag: RAG_ALL("green", "amber", "amber", "green"),
      avgDeal: 6154, net: 46_000, goal: 150_000, pctGoal: 53.3, wowPct: -22,
      overriddenFields: [], openHoursPerDay: 6.8,
    },
  ],
  weekCash: [88_000, 132_000, 96_500, 111_000, 0],
  projection: {
    projectedCash: 530_100, target: 490_000, collected: 427_500,
    remaining: 62_500, needPerDay: 10_417, daysElapsed: 25, daysLeft: 6,
    onTrack: true, pctOfTarget: 87.2, isFinal: false,
  },
  teamTarget: 490_000, sumRepGoals: 490_000,
  prize: {
    name: "Cabo team trip", emoji: "🏝️", target: 500_000,
    collected: 427_500, pct: 85.5, unlocked: false, remaining: 72_500,
  },
};

export default function Preview() {
  if (process.env.NODE_ENV === "production") notFound();
  const [scenario, setScenario] = useState<"healthy" | "low">("healthy");
  const [weekIndex, setWeekIndex] = useState<number | null>(null);
  const data = scenario === "healthy" ? HEALTHY : LOW_COVERAGE;

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center gap-2 border-b border-border px-6 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Preview
        </span>
        {(["healthy", "low"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScenario(s)}
            className={
              "rounded-lg border px-3 py-1 text-sm " +
              (scenario === s
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground")
            }
          >
            {s === "healthy" ? "Healthy team" : "Low coverage (Remotestack)"}
          </button>
        ))}
      </div>

      <div className="space-y-5 px-6 pb-16 pt-4">
        <PeriodNav
          monthKey={data.monthKey}
          currentMonthKey="2026-07"
          weekIndex={weekIndex}
          isCurrentMonth
          onMonthChange={() => {}}
          onWeekChange={setWeekIndex}
        />
        <TeamView
          data={data}
          weekIndex={weekIndex}
          onWeekChange={setWeekIndex}
        />
      </div>
    </div>
  );
}
