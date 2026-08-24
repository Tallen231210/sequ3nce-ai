"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Calendar, Loader2, Search } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { ManagerEodSettings } from "./ManagerEodSettings";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// The Manager EOD, in-app. Same numbers the Slack digest sends, live —
// built entirely from recordings: call counts are mechanical, the
// "why calls didn't close" section reads the transcripts through the
// objection classifier, and money is deliberately absent.
// ============================================================================

const DAY_LABEL = ["Today", "Yesterday", "2 days ago", "3 days ago"];

export function ManagerEodTab() {
  const { user } = useUser();
  const [dayOffset, setDayOffset] = useState(0);

  const report = useQuery(
    api.managerEodDigest.getManagerEodReport,
    user ? { clerkId: user.id, dayOffset: -dayOffset } : "skip",
  );

  return (
    <div className="space-y-5">
      <ManagerEodSettings />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {DAY_LABEL.map((label, i) => (
            <button
              key={label}
              onClick={() => setDayOffset(i)}
              className={
                "rounded-md border px-2.5 py-1 text-[12px] transition-colors " +
                (dayOffset === i
                  ? "border-foreground font-medium text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          Built entirely from recordings — no forms required
        </span>
      </div>

      {report === undefined ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : !report ? null : (
        <>
          {/* The day in three numbers */}
          <section className="grid grid-cols-3 gap-3">
            <Stat value={report.callsTaken} label="live calls taken" />
            <Stat value={report.realConversations} label="real conversations" />
            <Stat value={report.closes} label="closed" />
          </section>
          {report.botsNotAdmitted > 0 && (
            <p className="text-[12px] text-muted-foreground">
              {report.botsNotAdmitted} meeting
              {report.botsNotAdmitted === 1 ? "" : "s"} the bot couldn&apos;t
              see — it was never let in, so those calls can&apos;t be counted
              or read.
            </p>
          )}

          {/* Why calls didn't close */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Why calls didn&apos;t close
            </div>
            {report.reasons.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {report.realConversations === 0
                  ? "No conversations to read for this day."
                  : report.closes === report.realConversations
                    ? "Every real conversation closed."
                    : "No objections read off these calls yet."}
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {report.reasons.map((r: any) => (
                  <li key={r.key} className="text-sm leading-relaxed">
                    <span className="font-medium">{r.label}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {r.count} call{r.count === 1 ? "" : "s"}
                    </span>
                    {r.calls.length > 0 && (
                      <span className="ml-2 inline-flex flex-wrap gap-1.5">
                        {r.calls.map((c: any) => (
                          <Link
                            key={c.callId}
                            href={`/dashboard/calls/${c.callId}`}
                            className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            {c.label}
                          </Link>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {report.unreadCalls > 0 && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                {report.unreadCalls} call{report.unreadCalls === 1 ? "" : "s"}{" "}
                not yet read by the AI — counted above, never guessed at.
              </p>
            )}
          </section>

          {/* One call worth reviewing */}
          {report.reviewPick && (
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                <Search className="h-3 w-3" />
                One call worth reviewing
              </div>
              <p className="mt-2.5 text-sm leading-relaxed">
                <Link
                  href={`/dashboard/calls/${report.reviewPick.callId}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {report.reviewPick.label}
                </Link>{" "}
                <span className="text-muted-foreground">
                  — {report.reviewPick.objectionCount} objection
                  {report.reviewPick.objectionCount === 1 ? "" : "s"},{" "}
                  {report.reviewPick.durationMin} min
                  {report.reviewPick.outcome
                    ? `, ${report.reviewPick.outcome.replace(/_/g, " ")}`
                    : ""}
                  .
                </span>
              </p>
            </section>
          )}

          {/* Tomorrow */}
          <section className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-5 py-4">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              <span className="font-medium">{report.tomorrowBooked}</span>{" "}
              booked call{report.tomorrowBooked === 1 ? "" : "s"} on the
              calendar tomorrow.
            </span>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{label}</div>
    </div>
  );
}
