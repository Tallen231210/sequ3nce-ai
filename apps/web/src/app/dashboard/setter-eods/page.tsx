"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Check, Copy, Loader2, Plus, RefreshCw } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { CustomRangeControl } from "@/components/CustomRangeControl";
import { NotificationsCard } from "./NotificationsCard";
import { RosterIdentityInputs } from "./RosterIdentityInputs";
import { ScorecardSection } from "./ScorecardSection";
import { Header } from "@/components/dashboard/header";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Setter EODs: the roster, each setter's personal link, and the board.
//
// The manager's whole job here: add each setter once, send them their link,
// then read the numbers. Built for E2 (dials / pick ups / sets / new leads /
// follow ups), team-agnostic on purpose.
// ============================================================================

export default function SetterEodsPage() {
  const { user } = useUser();
  const clerkId = user?.id;

  const rosterData = useQuery(
    api.setterEod.listRoster,
    clerkId ? { clerkId } : "skip",
  );
  const [boardDays, setBoardDays] = useState<number>(7);
  const [boardRange, setBoardRange] = useState<{ start: number; end: number } | null>(null);
  const board = useQuery(
    api.setterEod.getEodBoard,
    clerkId
      ? boardRange
        ? { clerkId, rangeStartMs: boardRange.start, rangeEndMs: boardRange.end }
        : { clerkId, days: boardDays }
      : "skip",
  );

  const addSetter = useMutation(api.setterEod.addSetter);
  const setActive = useMutation(api.setterEod.setSetterActive);
  const rotate = useMutation(api.setterEod.rotateSetterToken);

  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rosterData === undefined) {
    return (
      <>
        <Header title="Setter EODs" description="Daily numbers from your setters" />
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }
  if (!rosterData) return null;

  const active = rosterData.roster.filter((r: any) => r.active);
  const inactive = rosterData.roster.filter((r: any) => !r.active);
  const filedCount = active.filter((r: any) => r.filedToday).length;

  return (
    <>
      <Header
        title="Setter EODs"
        description="Self-reported by your setters — their own end-of-day numbers, filed through personal links"
      />
      <div className="max-w-5xl space-y-6 p-6">
        {/* Roster */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <span className="text-sm font-semibold">Your setters</span>
            <span className="text-[12px] text-muted-foreground">
              {active.length === 0
                ? "none yet"
                : `${filedCount} of ${active.length} filed today`}
            </span>
          </div>

          <form
            className="flex gap-2 border-b border-border/60 px-5 py-3.5"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!clerkId || !newName.trim()) return;
              setBusy(true);
              setError(null);
              try {
                await addSetter({ clerkId, name: newName.trim() });
                setNewName("");
              } catch (err: any) {
                setError(err?.data ?? "Couldn't add them");
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Setter's name"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add setter
            </button>
          </form>
          {error && (
            <p className="border-b border-border/60 px-5 py-2 text-[13px] text-rose-600">
              {error}
            </p>
          )}

          {active.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              Add your setters by name. Each gets a personal EOD link to send
              them — no logins, no app.
            </p>
          ) : (
            active.map((r: any) => (
              <div
                key={r._id}
                className="flex flex-wrap items-center gap-3 border-b border-border/50 px-5 py-3 last:border-0"
              >
                <span className="min-w-32 text-sm font-medium">{r.name}</span>
                {clerkId && (
                  <RosterIdentityInputs
                    clerkId={clerkId}
                    rosterId={r._id}
                    email={r.email}
                    pod={r.pod}
                  />
                )}
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                    (r.filedToday
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700")
                  }
                >
                  {r.filedToday ? "filed today" : "not filed today"}
                </span>
                <span className="ml-auto flex items-center gap-3 text-[12px]">
                  <CopyLink token={r.token} />
                  <button
                    onClick={async () => {
                      if (!clerkId) return;
                      if (
                        !window.confirm(
                          `New link for ${r.name}? Their old link stops working.`,
                        )
                      )
                        return;
                      await rotate({ clerkId, rosterId: r._id });
                    }}
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    title="Issue a new link (old one stops working)"
                  >
                    <RefreshCw className="h-3 w-3" />
                    new link
                  </button>
                  <button
                    onClick={() =>
                      clerkId && setActive({ clerkId, rosterId: r._id, active: false })
                    }
                    className="text-muted-foreground underline hover:text-rose-600"
                  >
                    remove
                  </button>
                </span>
              </div>
            ))
          )}

          {inactive.length > 0 && (
            <div className="border-t border-border/60 px-5 py-2.5 text-[12px] text-muted-foreground">
              Removed:{" "}
              {inactive.map((r: any, i: number) => (
                <span key={r._id}>
                  {i > 0 && ", "}
                  {r.name}{" "}
                  <button
                    onClick={() =>
                      clerkId && setActive({ clerkId, rosterId: r._id, active: true })
                    }
                    className="underline"
                  >
                    restore
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        <NotificationsCard />
      <ScorecardSection />

        {/* The board */}
        <section>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              {boardRange ? "Custom range" : `Last ${boardDays} days`}
            </h3>
            <div className="flex items-center gap-1.5 text-[12px]">
              {[7, 14, 31].map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setBoardRange(null);
                    setBoardDays(d);
                  }}
                  className={
                    "rounded-md border px-2 py-1 transition-colors " +
                    (!boardRange && boardDays === d
                      ? "border-foreground font-medium"
                      : "border-border text-muted-foreground hover:text-foreground")
                  }
                >
                  {d}d
                </button>
              ))}
              <CustomRangeControl range={boardRange} onChange={setBoardRange} />
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            {board === undefined ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : !board || board.rows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Numbers appear here as setters file.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-semibold">Setter</th>
                    {board.dayKeys.map((dk: string) => (
                      <th key={dk} className="px-3 py-2.5 text-right font-semibold">
                        {dk.slice(5)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((row: any) => (
                    <tr key={row.rosterId} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 font-medium">{row.name}</td>
                      {board.dayKeys.map((dk: string) => {
                        const e = row.entries[dk];
                        return (
                          <td key={dk} className="px-3 py-2.5 text-right align-top">
                            {e ? (
                              <div
                                className="tabular-nums leading-snug"
                                title={`dials ${e.dials} · pick ups ${e.pickUps} · sets ${e.sets} · new leads ${e.newLeadsHit} · follow ups ${e.followUps}${e.note ? `\n${e.note}` : ""}`}
                              >
                                <div className="font-semibold">{e.sets} sets</div>
                                <div className="text-[11px] text-muted-foreground">
                                  {e.dials}d · {e.pickUps}p
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {e.newLeadsHit}n · {e.followUps}f
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            d = dials · p = pick ups · n = new leads hit · f = follow ups. Hover
            a cell for the full numbers and any note.
          </p>
        </section>
      </div>
    </>
  );
}

function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/setter-eod/${token}`;
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" /> copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> copy their link
        </>
      )}
    </button>
  );
}
