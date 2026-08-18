"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { CalendarPlus, Loader2, Lock, Video } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Header } from "@/components/dashboard/header";
import { MeetingDetail } from "./components/MeetingDetail";
import { RepCards } from "./components/RepCards";
import { NextMeetingBrief } from "./components/NextMeetingBrief";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Manager Mode.
 *
 * Connect a calendar, see what the bot will join, see what it recorded, and
 * open any recording to read it back. The brief, rep cards and clipping are
 * later phases.
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
  const upcoming = useQuery(
    api.managerMeetingQueries.listUpcomingManagerEvents,
    clerkId ? { clerkId } : "skip",
  );

  const startConnect = useMutation(api.managerCalendar.startManagerCalendarConnect);
  const disconnect = useMutation(api.managerCalendar.disconnectManagerCalendar);
  const setAutoJoin = useMutation(api.managerCalendar.setManagerAutoJoin);

  const [openMeeting, setOpenMeeting] = useState<string | null>(null);
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
        {openMeeting ? (
          <MeetingDetail
            meetingId={openMeeting}
            onBack={() => setOpenMeeting(null)}
          />
        ) : (
        <>
        {justConnected && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Calendar connected. Meetings on it will be recorded from now on.
          </div>
        )}
        {connectFailed && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            That connection link had expired. Start again — they only last ten
            minutes.
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

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

        {/* Not connected yet. */}
        {state.canConnect && !state.connected && (
          <div className="rounded-xl border border-border bg-card p-8">
            <CalendarPlus className="h-5 w-5 text-muted-foreground" />
            <h2 className="mt-3 text-base font-semibold">
              Connect your calendar
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              {state.botName} will join <strong>every meeting on your
              calendar</strong> and record it — one-to-ones, team meetings,
              leadership calls and interviews. Recordings are yours alone; no
              closer and no other manager can see them.
            </p>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
              If you don&apos;t want a particular meeting recorded, remove the
              bot from it — the recording is discarded rather than kept.
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

        {/* Connected. */}
        {state.canConnect && state.connected && (
          <>
            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4">
              <div>
                <div className="text-sm font-semibold">Auto Record</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {state.autoJoin
                    ? `${state.botName} joins every meeting on your calendar`
                    : "Nothing is being recorded"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={state.autoJoin}
                  onChange={(e) =>
                    void setAutoJoin({ clerkId: clerkId!, enabled: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-border accent-foreground"
                />
                <button
                  onClick={() => void disconnect({ clerkId: clerkId! })}
                  className="text-xs text-muted-foreground underline"
                >
                  Disconnect
                </button>
              </div>
            </div>

            <NextMeetingBrief />

            <RepCards />

            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Coming up
              </h3>
              <div className="rounded-xl border border-border bg-card">
                {upcoming === undefined ? (
                  <div className="p-5 text-sm text-muted-foreground">Loading…</div>
                ) : upcoming.length === 0 ? (
                  <div className="p-5 text-sm text-muted-foreground">
                    Nothing on your calendar in the next week.
                  </div>
                ) : (
                  upcoming.map((e: any) => (
                    <div
                      key={e._id}
                      className="flex items-center justify-between border-b border-border/50 px-5 py-3 last:border-0"
                    >
                      <div>
                        <div className="text-sm font-medium">{e.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(e.startTime).toLocaleString()}
                        </div>
                      </div>
                      {/* A meeting with no video link is on the calendar but
                          unrecordable. Saying so beats a silent absence from
                          the recordings list later. */}
                      {!e.hasMeetingUrl ? (
                        <span className="text-xs text-muted-foreground">
                          no video link
                        </span>
                      ) : e.excluded ? (
                        <span className="text-xs text-amber-700">not recording</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          will record
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Recorded
              </h3>
              <div className="rounded-xl border border-border bg-card">
                {meetings === undefined ? (
                  <div className="p-5 text-sm text-muted-foreground">Loading…</div>
                ) : meetings.length === 0 ? (
                  <div className="p-5 text-sm text-muted-foreground">
                    Nothing recorded yet. Your next meeting with a video link
                    will appear here.
                  </div>
                ) : (
                  meetings.map((m: any) => (
                    <button
                      key={m._id}
                      onClick={() => setOpenMeeting(m._id)}
                      className="flex w-full items-center gap-3 border-b border-border/50 px-5 py-3 text-left last:border-0 hover:bg-muted/40"
                    >
                      <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{m.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {m.startedAt
                            ? new Date(m.startedAt).toLocaleString()
                            : "—"}
                          {m.duration
                            ? ` · ${Math.round(m.duration / 60)} min`
                            : ""}
                        </div>
                      </div>
                      {/* Why a recording produced nothing, when it produced
                          nothing — rather than a gap someone reads as "no
                          meeting happened". */}
                      {m.failureReason && (
                        <span className="text-xs text-amber-700">
                          {m.failureReason}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </section>
          </>
        )}
        </>
        )}
      </div>
    </>
  );
}
