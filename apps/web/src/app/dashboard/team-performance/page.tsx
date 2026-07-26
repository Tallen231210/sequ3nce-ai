"use client";

import { useMemo, useState } from "react";
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

const HEADER = {
  title: "Team Performance",
  description: "Daily sales scoreboard — funnel, rates and cash by closer",
};

const TABS = [
  ["team", "Team"],
  ["daily", "Daily numbers"],
  ["year", "Year"],
  ["settings", "Settings"],
] as const;

type Tab = (typeof TABS)[number][0];

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
  const thisMonth = useMemo(currentMonthKey, []);
  const [monthKey, setMonthKey] = useState(thisMonth);
  const [weekIndex, setWeekIndex] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("team");

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

      <div className="space-y-5 px-6 pb-16 pt-4">
        <nav className="flex gap-1 border-b border-border">
          {TABS.map(([id, label]) => (
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

        {tab !== "settings" && tab !== "year" && (
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
        {tab === "daily" && <DailyGrid monthKey={data.monthKey} />}
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
