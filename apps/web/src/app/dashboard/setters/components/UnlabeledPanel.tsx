"use client";

// Bookings with no setter named on them, listed under whoever on the roster
// touched them so they can be assigned (here) or claimed (from the setter's
// EOD page). Every line says where the booking came from, who touched it
// and when relative to the booking, and how the call went.

import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../../../convex/_generated/api";
import type { BookingsData } from "../lib/cards";
import { humanDay } from "../lib/format";

type Rec = BookingsData["records"][number];
export interface RosterOption {
  rosterId: string;
  name: string;
  role: "booking" | "confirmation";
}

const NOBODY = "__nobody";
const verdictWord = (r: Rec) => (r.verdict.result === "showed" ? "showed" : r.verdict.result === "no_show" ? "no-show" : r.verdict.result === "rescheduled" ? "rescheduled" : r.verdict.due ? "no verdict" : "upcoming");
const sourceWord = (r: Rec) => (r.isFunnel ? "self-booked" : r.eventName ? `booked via "${r.eventName}"` : "hand-made on the calendar");

function touchLine(r: Rec, rosterId: string | null, confirmationName: string | null): string {
  const own = r.touches.filter((t) => t.rosterId === rosterId);
  const parts: string[] = [];
  if (rosterId && own.length > 0) {
    const kinds = new Set(own.map((t) => t.kind));
    const verb = kinds.has("dial") && kinds.has("sms") ? "dialed and texted" : kinds.has("dial") ? "dialed" : "texted";
    parts.push(`${verb} ${own.every((t) => t.afterBooking) ? "after the booking" : "before the booking"}`);
  }
  if (r.isFunnel && confirmationName) {
    const conf = r.touches.some((t) => t.name === confirmationName);
    parts.push(`${confirmationName}: ${conf ? "contacted" : "no contact"}`);
  }
  return parts.join(" · ");
}

export function UnlabeledPanel({ records, rosters, clerkId, label, timezone }: { records: Rec[]; rosters: RosterOption[]; clerkId: string; label: string; timezone: string }) {
  const assign = useMutation(api.settersPageClaims.assign);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unlabeled = records.filter((r) => !r.isFollowUp && r.lane === "unattributed");
  const claimed = records.filter((r) => !r.isFollowUp && r.claim);
  if (unlabeled.length === 0 && claimed.length === 0) return null;
  const confirmationName = rosters.find((r) => r.role === "confirmation")?.name ?? null;
  const nameOf = new Map(rosters.map((r) => [r.rosterId, r.name]));

  // Group by the roster setter who touched the booking; one booking can sit under two names.
  const groups = new Map<string, Rec[]>();
  for (const r of unlabeled) {
    const ids = Array.from(new Set(r.touches.map((t) => t.rosterId).filter((id): id is string => id !== null)));
    for (const id of ids.length > 0 ? ids : [NOBODY]) groups.set(id, [...(groups.get(id) ?? []), r]);
  }
  const ordered = [...Array.from(groups.keys()).filter((k) => k !== NOBODY).sort((a, b) => (groups.get(b)?.length ?? 0) - (groups.get(a)?.length ?? 0)), ...(groups.has(NOBODY) ? [NOBODY] : [])];

  const act = async (key: string, what: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await what();
    } catch (err) {
      setError(err instanceof ConvexError && typeof err.data === "string" ? err.data : "Couldn't save that — try again");
    } finally {
      setBusy(null);
    }
  };
  const when = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone });

  const Row = ({ r, groupId }: { r: Rec; groupId: string }) => (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 py-2 last:border-b-0">
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{r.title}</span>
        <span className="text-muted-foreground"> · {humanDay(r.dayKey)} {when(r.startTime)} with {r.closerName}</span>
        <span className="block text-xs text-muted-foreground">
          {sourceWord(r)}
          {touchLine(r, groupId === NOBODY ? null : groupId, confirmationName) ? ` · ${touchLine(r, groupId === NOBODY ? null : groupId, confirmationName)}` : ""} · {verdictWord(r)}
        </span>
      </span>
      <select
        aria-label={`Assign ${r.title}`}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        value=""
        disabled={busy === r.key}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          if (v === "not_a_set") void act(r.key, () => assign({ clerkId, bookingKey: r.key, notASet: true }));
          else void act(r.key, () => assign({ clerkId, bookingKey: r.key, rosterId: v as never }));
        }}
      >
        <option value="">Assign to…</option>
        {rosters.map((o) => (
          <option key={o.rosterId} value={o.rosterId}>
            {o.name}
          </option>
        ))}
        <option value="not_a_set">Not a set</option>
      </select>
    </li>
  );

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold">
          {label} · {unlabeled.length}
        </h2>
        <p className="text-xs text-muted-foreground">
          Bookings with no setter named on them: no initials, no DM link name, no claim. Listed under whoever on the roster contacted them. Assign one here, or the setter claims it from their EOD page; write the initials on the calendar and it moves on its own next time.
        </p>
      </div>
      <div className="px-5 py-2">
        {ordered.map((g) => (
          <div key={g} className="py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {g === NOBODY ? "Nobody on the roster touched these" : `Touched by ${nameOf.get(g) ?? "a setter"}`} · {groups.get(g)?.length ?? 0}
            </h3>
            <ul>
              {(groups.get(g) ?? []).map((r) => (
                <Row key={`${g}:${r.key}`} r={r} groupId={g} />
              ))}
            </ul>
          </div>
        ))}
        {claimed.length > 0 && (
          <details className="py-2 text-sm">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">Claimed or assigned in this range · {claimed.length}</summary>
            <ul className="mt-1">
              {claimed.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 py-2 text-sm last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{r.title}</span>
                    <span className="text-muted-foreground"> · {humanDay(r.dayKey)} · credited to {nameOf.get(r.claim!.rosterId) ?? "a setter"} ({r.claim!.byRosterId ? "claimed by the setter" : "assigned by a manager"})</span>
                  </span>
                  <button type="button" disabled={busy === r.key} className="text-xs text-muted-foreground underline hover:text-rose-600 disabled:opacity-50" onClick={() => void act(r.key, () => assign({ clerkId, bookingKey: r.key }))}>
                    undo
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        {error && <p className="py-2 text-xs text-rose-600">{error}</p>}
      </div>
    </section>
  );
}
