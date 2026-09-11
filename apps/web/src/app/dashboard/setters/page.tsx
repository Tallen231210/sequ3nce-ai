"use client";

// ============================================================================
// Setters — one page per team on the attribution engine. Six subscriptions
// (bookings by call date, sets by booked date, Close activity, speed, cadence,
// the EOD cross-check) merged per person on the client; a drawer per setter. Only teams with the
// setter_teams flag see it; the sidebar hides it for everyone else.
// ============================================================================

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Loader2, Settings2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Header } from "@/components/dashboard/header";
import { useTeam } from "@/hooks/useTeam";
import { DateRangeSelect } from "../setter-data/components/DateRangeSelect";
import { DataHealthCard } from "../setter-eods/DataHealthCard";
import { SettersView, type SettersTab } from "./components/SettersView";
import { coverageLines } from "./lib/cards";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { EodBoard } from "./components/EodBoard";

const DAY_MS = 24 * 60 * 60 * 1000;

export default function SettersPage() {
  const { team, clerkId, isLoading } = useTeam();
  const flags = (team as { betaFeatures?: string[] } | null | undefined)?.betaFeatures ?? [];
  const flagged = flags.includes("setter_teams");
  const [range, setRange] = useState(() => ({ start: Date.now() - 7 * DAY_MS, end: Date.now() }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"roster" | "team" | "posts" | "crm">("roster");
  const [flash, setFlash] = useState<string | null>(null);
  const [tab, setTabState] = useState<SettersTab>("setters");
  const setTab = (next: SettersTab) => {
    setTabState(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "setters") params.delete("view");
    else params.set("view", next);
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  };
  // The CRM OAuth callback lands on the old route with ?connected=1 or
  // ?ghl_error=…, and the bounce forwards the query string here. Open the
  // drawer on the CRM tab so the result is actually seen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected") === "1";
    const error = params.get("ghl_error");
    const view = params.get("view");
    if (view === "eods" || view === "attention") setTabState(view);
    if (!connected && !error) return;
    setFlash(connected ? "Close is connected." : `Couldn't connect to Close — try again. If it keeps failing, send us this: ${error}`);
    setSettingsTab("crm");
    setSettingsOpen(true);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const args = clerkId && flagged ? { clerkId, rangeStart: range.start, rangeEnd: range.end } : "skip";
  const bookings = useQuery(api.settersPageQueries.getSettersBookings, args);
  const sets = useQuery(api.settersPageQueries.getSettersSets, args);
  const activity = useQuery(api.settersPageQueries.getSettersActivity, args);
  const speed = useQuery(api.settersPageQueries.getSettersSpeed, args);
  const cadence = useQuery(api.settersPageQueries.getSettersCadence, args);
  const checks = useQuery(api.setterEodCrossCheck.getSettersCrossCheck, args);

  if (isLoading) {
    return (
      <>
        <Header title="Setters" />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }
  if (!flagged) {
    return (
      <>
        <Header title="Setters" />
        <div className="px-6 py-12">
          <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-8 text-center">
            <h2 className="text-lg font-semibold">Not switched on for this team</h2>
            <p className="mt-2 text-sm text-muted-foreground">The Setters page is enabled per team. Setter Data and Setter EODs are still in the sidebar.</p>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <Header title="Setters" description="Every setter, by team — what the calendar and the CRM measured, beside what they filed." />
      <div className="space-y-5 px-6 py-6 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Whole days, from the first day you pick through today. Up to 14 days at a time.
            {bookings?.rangeClampedToDays ? ` Showing the last ${bookings.rangeClampedToDays} days of the range you picked.` : ""}
          </p>
          <div className="flex items-center gap-2">
            <DateRangeSelect rangeStart={range.start} rangeEnd={range.end} onChange={(start, end) => setRange({ start, end })} maxDays={14} />
            <button type="button" onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:border-foreground/40">
              <Settings2 className="h-4 w-4" />
              Settings
            </button>
          </div>
        </div>
        {clerkId && (
          <SettingsDrawer
            clerkId={clerkId}
            open={settingsOpen}
            onClose={() => {
              setSettingsOpen(false);
              setFlash(null);
            }}
            checks={checks}
            initialTab={settingsTab}
            flash={flash}
            coverage={bookings ? coverageLines(bookings, activity, sets, speed, cadence, checks) : []}
          />
        )}
        {bookings === undefined && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {bookings === null && <p className="text-sm text-muted-foreground">Nothing to show for this range.</p>}
        {bookings && (
          <SettersView
            bookings={bookings}
            sets={sets ?? null}
            activity={activity ?? null}
            speed={speed}
            cadence={cadence}
            checks={checks}
            clerkId={clerkId}
            rangeStart={range.start}
            rangeEnd={range.end}
            health={<DataHealthCard />}
            tab={tab}
            onTab={setTab}
            eodBoard={clerkId ? <EodBoard clerkId={clerkId} rangeStart={range.start} rangeEnd={range.end} checks={checks} /> : null}
          />
        )}
      </div>
    </>
  );
}
