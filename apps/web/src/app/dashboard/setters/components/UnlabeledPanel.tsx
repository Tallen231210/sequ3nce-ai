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
type NotASet = BookingsData["notASet"][number];
export interface RosterOption {
  rosterId: string;
  name: string;
  role: "booking" | "confirmation";
  active: boolean;
}

const NOBODY = "__nobody";

/** How the call went, in a sentence. */
const verdictLine = (r: Rec): string =>
  r.verdict.result === "showed"
    ? "They showed up."
    : r.verdict.result === "no_show"
      ? "They didn't show."
      : r.verdict.result === "rescheduled"
        ? "The call was moved."
        : r.verdict.due
          ? "Nobody knows whether they showed."
          : "The call hasn't happened yet.";

/** Where the booking came from, and what the group's setter did about it. */
function storyLine(r: Rec, rosterId: string | null): string {
  const parts: string[] = [];
  parts.push(r.isFunnel ? "They booked themselves." : r.eventName ? `Booked through the "${r.eventName}" link.` : "Typed onto the calendar by hand.");
  const own = rosterId ? r.touches.filter((t) => t.rosterId === rosterId) : [];
  if (own.length > 0) {
    const kinds = new Set(own.map((t) => t.kind));
    const verb = kinds.has("dial") && kinds.has("sms") ? "Called and texted" : kinds.has("dial") ? "Called" : "Texted";
    parts.push(`${verb} them ${own.every((t) => t.afterBooking) ? "after they booked" : "before they booked"}.`);
  }
  // A self-book in this list was, by definition, not contacted by the confirmation setter.
  if (r.isFunnel) parts.push("The confirmation setter never contacted them.");
  return parts.join(" ");
}

export function UnlabeledPanel({
  records,
  notASet,
  rosters,
  clerkId,
  label,
  timezone,
}: {
  records: Rec[];
  notASet: NotASet[];
  /** Every roster row, active or not — names for the groups; only active ones are offered for assignment. */
  rosters: RosterOption[];
  clerkId: string;
  label: string;
  timezone: string;
}) {
  const assign = useMutation(api.settersPageClaims.assign);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const unlabeled = records.filter((r) => !r.isFollowUp && r.lane === "unattributed");
  const claimed = records.filter((r) => !r.isFollowUp && r.claim);
  if (unlabeled.length === 0 && claimed.length === 0 && notASet.length === 0) return null;
  const nameOf = new Map(rosters.map((r) => [r.rosterId, r.name]));
  const options = rosters.filter((r) => r.active);

  // Group by the roster setter who touched the booking; one booking can sit under two names.
  const groups = new Map<string, Rec[]>();
  for (const r of unlabeled) {
    const ids = Array.from(new Set(r.touches.map((t) => t.rosterId).filter((id): id is string => id !== null)));
    for (const id of ids.length > 0 ? ids : [NOBODY]) groups.set(id, [...(groups.get(id) ?? []), r]);
  }
  const ordered = [...Array.from(groups.keys()).filter((k) => k !== NOBODY).sort((a, b) => (groups.get(b)?.length ?? 0) - (groups.get(a)?.length ?? 0)), ...(groups.has(NOBODY) ? [NOBODY] : [])];

  const act = async (key: string, what: () => Promise<unknown>, doneText: string | null) => {
    setBusy((s) => new Set(s).add(key));
    setError(null);
    try {
      await what();
      setSaved((m) => {
        const next = new Map(m);
        if (doneText) next.set(key, doneText);
        else next.delete(key);
        return next;
      });
    } catch (err) {
      setError(err instanceof ConvexError && typeof err.data === "string" ? err.data : "Couldn't save that — try again");
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  };
  const when = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone });
  const onPick = (r: Rec, v: string) => {
    if (!v) return;
    if (v === "not_a_set") {
      if (!window.confirm(`Mark "${r.title}" as not a set? It drops out of every count, and you can undo it below.`)) return;
      void act(r.key, () => assign({ clerkId, bookingKey: r.key, notASet: true }), "Marked not a set");
    } else {
      void act(r.key, () => assign({ clerkId, bookingKey: r.key, rosterId: v as never }), `Assigned to ${nameOf.get(v) ?? "the setter"}`);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold">Who booked these? · {unlabeled.length}</h2>
        <p className="text-xs text-muted-foreground">Nobody&apos;s initials are on them. Pick the setter who booked it, or mark it as not a set.</p>
        <details className="mt-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">Why are these here?</summary>
          <p className="mt-1 max-w-3xl">
            A booking lands here when nothing on it names a setter: no initials on the title, no name in the booking link, and nobody has claimed it. They are grouped under
            whoever called or texted the lead, so the likely owner is next to the booking. A setter can also claim their own from their end-of-day page. Write the initials on the
            calendar and the next booking like it sorts itself.
          </p>
        </details>
      </div>
      <div className="px-5 py-2">
        {ordered.map((g) => (
          <div key={g} className="py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {g === NOBODY ? "No setter called or texted these" : `${nameOf.get(g) ?? "A former setter"} called or texted these`} · {groups.get(g)?.length ?? 0}
            </h3>
            <ul>
              {(groups.get(g) ?? []).map((r) => {
                const line = storyLine(r, g === NOBODY ? null : g);
                const done = saved.get(r.key);
                return (
                  <li key={`${g}:${r.key}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 py-2 last:border-b-0">
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{r.title}</span>
                      <span className="text-muted-foreground"> · {humanDay(r.dayKey)} {when(r.startTime)} with {r.closerName}</span>
                      <span className="block text-xs text-muted-foreground">{line}</span>
                      <span className="block text-xs text-muted-foreground">{verdictLine(r)}</span>
                    </span>
                    {done ? (
                      <span className="text-xs font-medium text-emerald-700">{done} ✓</span>
                    ) : (
                      <select aria-label={`Assign ${r.title}`} className="rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-50" value="" disabled={busy.has(r.key)} onChange={(e) => onPick(r, e.target.value)}>
                        <option value="">{busy.has(r.key) ? "Saving…" : "Whose is it?"}</option>
                        {options.map((o) => (
                          <option key={o.rosterId} value={o.rosterId}>
                            {o.name}
                          </option>
                        ))}
                        <option value="not_a_set">Not a set</option>
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {(claimed.length > 0 || notASet.length > 0) && (
          <details className="py-2 text-sm">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">Already sorted out · {claimed.length + notASet.length}</summary>
            <ul className="mt-1">
              {claimed.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 py-2 text-sm last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{r.title}</span>
                    <span className="text-muted-foreground"> · {humanDay(r.dayKey)} · credited to {nameOf.get(r.claim!.rosterId) ?? "a setter"} ({r.claim!.byRosterId ? "claimed by the setter" : "assigned by a manager"})</span>
                  </span>
                  <button type="button" aria-label={`Undo the credit on ${r.title}`} disabled={busy.has(r.key)} className="text-xs text-muted-foreground underline hover:text-rose-600 disabled:opacity-50" onClick={() => void act(r.key, () => assign({ clerkId, bookingKey: r.key }), null)}>
                    undo
                  </button>
                </li>
              ))}
              {notASet.map((n) => (
                <li key={n.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 py-2 text-sm last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{n.title}</span>
                    <span className="text-muted-foreground"> · {humanDay(n.dayKey)} with {n.closerName} · marked not a set</span>
                  </span>
                  <button type="button" aria-label={`Undo "not a set" on ${n.title}`} disabled={busy.has(n.key)} className="text-xs text-muted-foreground underline hover:text-rose-600 disabled:opacity-50" onClick={() => void act(n.key, () => assign({ clerkId, bookingKey: n.key }), null)}>
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
