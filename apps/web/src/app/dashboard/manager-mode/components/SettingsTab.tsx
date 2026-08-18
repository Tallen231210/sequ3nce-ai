"use client";

import { useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { api } from "../../../../../convex/_generated/api";

/**
 * Recording settings and the calendar connection.
 *
 * Moved off the Overview because it's a thing you set once. A permanent
 * settings card above the day's work makes the tab feel like a config screen
 * rather than a place to prepare for a meeting.
 */
export function SettingsTab({ state }: { state: any }) {
  const { user } = useUser();
  const clerkId = user?.id;
  const setAutoJoin = useMutation(api.managerCalendar.setManagerAutoJoin);
  const disconnect = useMutation(api.managerCalendar.disconnectManagerCalendar);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-sm font-semibold">Auto Record</div>
            <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
              {state.autoJoin
                ? `${state.botName} joins every meeting on your calendar that has a video link — one-to-ones, team meetings, leadership calls and interviews.`
                : "Nothing is being recorded. Your meetings will come and go without the bot."}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={state.autoJoin}
            onClick={() =>
              void setAutoJoin({ clerkId: clerkId!, enabled: !state.autoJoin })
            }
            className={
              "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors " +
              (state.autoJoin ? "bg-foreground" : "bg-muted-foreground/30")
            }
          >
            <span
              className={
                "absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all " +
                (state.autoJoin ? "left-[22px]" : "left-0.5")
              }
            />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="text-sm font-semibold">Not everything should be recorded</div>
        <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
          If a particular meeting shouldn&apos;t be, remove the bot when it
          joins — recording stops the moment it leaves, and anything recorded
          up to that point stays until you delete it. Recordings are yours
          alone; no closer and no other manager can see them.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-6">
          <div>
            <div className="text-sm font-semibold">Google Calendar</div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Connected. Disconnecting stops all recording and forgets the
              calendar.
            </p>
          </div>
          <button
            onClick={() => void disconnect({ clerkId: clerkId! })}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-rose-300 hover:text-rose-600"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
