"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { CalendarPlus, Loader2, Lock } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Header } from "@/components/dashboard/header";
import { MeetingDetail } from "./components/MeetingDetail";
import { RepCards } from "./components/RepCards";
import { NextMeetingBrief } from "./components/NextMeetingBrief";
import { RepHistory } from "./components/RepHistory";
import { MeetingsTab } from "./components/MeetingsTab";
import { ClipsTab } from "./components/ClipsTab";
import { SettingsTab } from "./components/SettingsTab";
import { TabBar, type ManagerTab } from "./components/TabBar";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Manager Mode.
 *
 * Five tabs. Overview is where a manager lands and should answer "what am I
 * walking into and who needs me" without a click; the rest are the places you
 * go on purpose.
 *
 * Opening a meeting or a rep replaces the tab content rather than navigating,
 * so going back doesn't lose which tab you were on.
 */
export default function ManagerModePage() {
  const { user } = useUser();
  const params = useSearchParams();
  const clerkId = user?.id;

  const state = useQuery(
    api.managerCalendar.getManagerCalendarState,
    clerkId ? { clerkId } : "skip",
  );
  const meetings = useQuery(
    api.managerMeetingQueries.listManagerMeetings,
    clerkId ? { clerkId } : "skip",
  );
  const clips = useQuery(
    api.managerMeetingClips.listAllClips,
    clerkId ? { clerkId } : "skip",
  );

  const startConnect = useMutation(api.managerCalendar.startManagerCalendarConnect);

  const [tab, setTab] = useState<ManagerTab>("overview");
  const [openMeeting, setOpenMeeting] = useState<string | null>(null);
  const [openRep, setOpenRep] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The callback redirects back here with a result rather than to a generic
  // success page, so a failed connection is visible where it was started.
  const justConnected = params.get("connected") === "1";
  const connectFailed = params.get("connected") === "0";

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { nonce } = await startConnect({ clerkId: clerkId! });
      // The nonce carries the identity through Google. Nothing else needs to.
      window.location.href = `/api/auth/google/authorize?managerNonce=${nonce}`;
    } catch (e: any) {
      setError(e?.data ?? "Couldn't start the connection.");
      setBusy(false);
    }
  }

  function openMeetingFrom(id: string) {
    setOpenRep(null);
    setOpenMeeting(id);
  }

  if (state === undefined) {
    return (
      <>
        <Header title="Manager Mode" description="Your meetings, recorded" />
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }
  if (!state) return null;

  return (
    <>
      <Header
        title="Manager Mode"
        description="Your one-to-ones, team meetings, leadership calls and interviews"
      />

      <div className="max-w-4xl space-y-5 p-6">
        {justConnected && (
          <Banner tone="good">
            Calendar connected. Meetings on it will be recorded from now on.
          </Banner>
        )}
        {connectFailed && (
          <Banner tone="warn">
            That connection link had expired. Start again — they only last ten
            minutes.
          </Banner>
        )}
        {error && <Banner tone="bad">{error}</Banner>}

        {/* Not on the right plan. Say which plan, rather than just refusing. */}
        {!state.canConnect && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
            <h2 className="mt-3 text-base font-semibold">
              Manager Mode needs Overwatch
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Your team is on {state.tier ?? "a plan without recording"}. Manager
              Mode records your own meetings, which needs the bot.
            </p>
          </div>
        )}

        {/* Not connected yet — no tabs, because every one of them would be
            empty and a row of empty tabs reads as a broken feature. */}
        {state.canConnect && !state.connected && (
          <div className="rounded-xl border border-border bg-card p-8">
            <CalendarPlus className="h-5 w-5 text-muted-foreground" />
            <h2 className="mt-3 text-base font-semibold">Connect your calendar</h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              {state.botName} will join <strong>every meeting on your
              calendar</strong> and record it — one-to-ones, team meetings,
              leadership calls and interviews. Recordings are yours alone; no
              closer and no other manager can see them.
            </p>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
              If you don&apos;t want a particular meeting recorded, remove the bot
              from it — the recording is discarded rather than kept.
            </p>
            <button
              onClick={() => void connect()}
              disabled={busy}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarPlus className="h-4 w-4" />
              )}
              Connect Google Calendar
            </button>
          </div>
        )}

        {state.canConnect && state.connected && (
          <>
            <TabBar
              active={tab}
              onChange={(t) => {
                setTab(t);
                setOpenMeeting(null);
                setOpenRep(null);
              }}
              counts={{
                meetings: meetings?.length ?? 0,
                clips: clips?.length ?? 0,
              }}
            />

            {/* A drill-in takes over the content area. The tab stays selected
                underneath, so Back returns you where you were. */}
            {openRep ? (
              <RepHistory closerId={openRep} onBack={() => setOpenRep(null)} />
            ) : openMeeting ? (
              <MeetingDetail
                meetingId={openMeeting}
                onBack={() => setOpenMeeting(null)}
              />
            ) : tab === "overview" ? (
              <div className="space-y-5">
                <NextMeetingBrief />
                <RepCards onOpenRep={setOpenRep} />
              </div>
            ) : tab === "meetings" ? (
              <MeetingsTab onOpenMeeting={openMeetingFrom} />
            ) : tab === "reps" ? (
              <RepCards onOpenRep={setOpenRep} />
            ) : tab === "clips" ? (
              <ClipsTab onOpenMeeting={openMeetingFrom} />
            ) : (
              <SettingsTab state={state} />
            )}
          </>
        )}
      </div>
    </>
  );
}

const TONE: Record<string, string> = {
  good: "border-emerald-300 bg-emerald-50 text-emerald-800",
  warn: "border-amber-300 bg-amber-50 text-amber-800",
  bad: "border-rose-300 bg-rose-50 text-rose-700",
};

function Banner({
  tone,
  children,
}: {
  tone: "good" | "warn" | "bad";
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${TONE[tone]}`}>
      {children}
    </div>
  );
}
