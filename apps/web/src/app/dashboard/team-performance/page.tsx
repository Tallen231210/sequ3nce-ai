"use client";

import { useEffect, useMemo, useState } from "react";
import { CloserStatsView } from "../closer-stats/CloserStatsView";
import { PendingOutcomesNotice } from "./components/PendingOutcomesNotice";
import { GeistMono } from "geist/font/mono";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Loader2, Users } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Header } from "@/components/dashboard/header";
import { DailyGrid } from "./components/DailyGrid";
import { PeriodNav } from "./components/PeriodNav";
import { TeamView } from "./components/TeamView";
import { YearView } from "./components/YearView";
import { SettingsTab } from "./components/SettingsTab";
import { CloserScorecardSection } from "@/components/closer-scorecard/CloserScorecardSection";
import { useTeam } from "@/hooks/useTeam";
import { monthLabel } from "./lib/format";

const HEADER = {
 title: "Closer Performance",
 description: "Daily sales scoreboard — funnel, rates and cash by closer, and each closer's stats",
};

const TABS = [
 ["team", "Team"],
 ["closers", "Closer stats"],
 ["daily", "Daily numbers"],
 ["year", "Year"],
 ["settings", "Settings"],
] as const;

// Per-client custom tab (built for E2), gated on the closer_scorecard beta
// flag — same convention as the Setter EODs sidebar item.
const SCORECARD_TAB = ["scorecard", "Closer Scorecard"] as const;

type Tab = (typeof TABS)[number][0] | (typeof SCORECARD_TAB)[0];

function currentMonthKey(): string {
 const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function LoadingState() {
 return (
    <div className="flex h-[60vh] items-center justify-center">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-16">
 <div className="mx-auto max-w-md text-center">
 <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
 <Users className="h-5 w-5 text-muted-foreground" />
 </div>
        <h2 className="mt-4 text-base font-semibold">No performance data yet</h2>
 <p className="mt-1.5 text-sm text-muted-foreground">
 This board fills in from your closers&apos; calendars and completed
          calls. Once your team connects their calendars and starts taking
          calls, their numbers appear here automatically.
        </p>
      </div>
    </div>
  );
}

export default function TeamPerformancePage() {
  const { user, isLoaded } = useUser();
  const { team } = useTeam();
  const thisMonth = useMemo(currentMonthKey, []);
  const [monthKey, setMonthKey] = useState(thisMonth);
  const [weekIndex, setWeekIndex] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("team");

  const hasCloserScorecard = (
    (team as { betaFeatures?: string[] } | null | undefined)?.betaFeatures ?? []
  ).includes("closer_scorecard");
  const tabs: ReadonlyArray<readonly [Tab, string]> = hasCloserScorecard
    ? [TABS[0], TABS[1], TABS[2], SCORECARD_TAB, TABS[3], TABS[4]]
    : TABS;
  // A link can land on a tab (?tab=closers, from the old Closer Stats route).
  const [closerSubTab, setCloserSubTab] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("tab");
    if (wanted && (TABS.some(([id]) => id === wanted) || wanted === "scorecard")) setTab(wanted as Tab);
    setCloserSubTab(params.get("sub"));
    if (wanted) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // The month the page is on, as milliseconds, for tabs that take a range.
  const monthPeriod = useMemo(() => {
    const [y, m] = monthKey.split("-").map(Number);
    return {
      start: new Date(y, m - 1, 1).getTime(),
      end: new Date(y, m, 1).getTime() - 1,
      label: monthLabel(monthKey, true),
    };
  }, [monthKey]);

  const data = useQuery(
    api.closerPerformanceQueries.getTeamPerformance,
    isLoaded && user
      ? {
          clerkId: user.id,
          monthKey,
          // The daily grid always shows the whole month, so a week filter
          // left over from the Team tab must not narrow it.
          ...(weekIndex === null || tab === "daily" ? {} : { weekIndex }),
 }
      : "skip",
 );

  if (!isLoaded || data === undefined) {
    return (
      <>
        <Header {...HEADER} />
        <LoadingState />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Header {...HEADER} />
        <EmptyState />
      </>
    );
  }

  return (
    <>
      <Header {...HEADER} />

      <div className={`${GeistMono.variable} space-y-5 px-6 pb-16 pt-4`}>
        <nav className="flex gap-1 border-b border-border">
 {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
 onClick={() => setTab(id)}
              className={
                "relative px-4 py-2 text-sm font-medium transition-colors " +
 (tab === id
                  ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground"
 : "text-muted-foreground hover:text-foreground")
 }
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Sits above the board, because the board is what looks wrong. */}
        {tab !== "settings" && tab !== "scorecard" && <PendingOutcomesNotice teamId={data.teamId} />}

        {/* One date control for the page. Year steps through years and the
            per-client scorecard runs on Saturday weeks, so those two keep
            their own; everything else reads this. */}
        {tab !== "settings" && tab !== "year" && tab !== "scorecard" && (
 <PeriodNav
          monthKey={data.monthKey}
          currentMonthKey={thisMonth}
          weekIndex={weekIndex}
          isCurrentMonth={data.isCurrentMonth}
          showWeeks={tab === "team"}
 onMonthChange={(m) => {
            setMonthKey(m);
            setWeekIndex(null);
          }}
          onWeekChange={setWeekIndex}
        />
        )}

        {tab === "team" && (
 <TeamView
            data={data}
            weekIndex={weekIndex}
            onWeekChange={setWeekIndex}
          />
        )}
        {tab === "closers" && <CloserStatsView embedded initialSubTab={closerSubTab} period={monthPeriod} />}
        {tab === "daily" && <DailyGrid monthKey={data.monthKey} />}
        {tab === "scorecard" && <CloserScorecardSection />}
 {tab === "year" && (
 <YearView
            onOpenMonth={(m) => {
              // Clicking a month drops you into the full Team view for it —
              // the trend is only useful if you can chase down what caused it.
              setMonthKey(m);
              setWeekIndex(null);
              setTab("team");
 }}
          />
        )}
        {tab === "settings" && <SettingsTab />}
      </div>
    </>
  );
}
