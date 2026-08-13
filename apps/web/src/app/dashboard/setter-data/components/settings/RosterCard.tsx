"use client";

// ============================================================================
// Telling us who your setters are.
//
// Until this is filled in, "outreach per setter" means "outreach by anyone with
// a CRM login". On one live team that put the manager's 864 touches and a
// support account into the setter leaderboard, alongside seven ids the CRM
// doesn't even list.
//
// Three roles, not a checkbox, because closers dial too — confirming a Zoom,
// chasing a no-show. That work is real and worth keeping; it just isn't setter
// performance.
//
// Ordered by how much each person actually did, so the choices that matter most
// are the ones you make first.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROLES = [
  { value: "setter", label: "Setter", hint: "Counts towards setter metrics" },
  { value: "closer", label: "Closer", hint: "Dials, but not setter work" },
  { value: "other", label: "Not sales", hint: "Manager, support, automation" },
] as const;

function ago(ms: number | null): string {
  if (!ms) return "never";
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function RosterCard() {
  const { user } = useUser();
  const data = useQuery(
    api.setterRoster.listRoster,
    user ? { clerkId: user.id } : "skip",
  ) as any;
  const setRole = useMutation(api.setterRoster.setRole);
  const resolveNames = useAction(api.setterRosterResolve.resolveMissingNamesForMyTeam);
  const triedResolving = useRef(false);

  // Go and fetch the names of anyone we can only show as an id.
  //
  // The CRM user sync fetches /users/ once with no paging, so agency-level
  // people and anyone past the first page never arrive — on one live team that
  // left 8 of 16 people nameless, including two doing over 800 touches each.
  // Nobody can decide whether "Unnamed user nLKs6QoN…" is a setter, so the card
  // resolves them on sight rather than asking the manager to guess.
  //
  // Once per mount: a second pass would only re-ask about ids GHL has already
  // told us it doesn't recognise.
  useEffect(() => {
    if (!user || !data || triedResolving.current) return;
    const nameless = data.people.filter((p: any) => !p.name && p.total > 0);
    if (nameless.length === 0) return;
    triedResolving.current = true;
    void resolveNames({ clerkId: user.id }).catch(() => {
      // Never block the roster on this. Worst case the manager sees the ids,
      // which is exactly where they were before.
    });
  }, [user, data, resolveNames]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function assign(crmUserId: string, role: string, displayName?: string) {
    if (!user) return;
    setBusy(crmUserId);
    setError(null);
    try {
      const res: any = await setRole({
        clerkId: user.id,
        crmUserId,
        role: role as any,
        displayName,
      });
      if (!res.success) setError(res.error ?? "Couldn't save that.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(null);
    }
  }

  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Looking at who&apos;s been
        working your leads…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-1 text-sm font-semibold">Who are your setters?</div>
      <p className="mb-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        Everyone who has touched a lead in the last {data.lookbackDays} days, busiest
        first. Until you say otherwise we count all of them as setters — which
        usually means managers and support accounts are sitting in your setter
        numbers.
      </p>

      {data.unassigned > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
          <span className="font-medium">{data.unassigned} people still unassigned.</span>{" "}
          Their activity is counted as setter work until you tell us otherwise.
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {error}
        </div>
      )}

      <div className="divide-y divide-border rounded-lg border border-border">
        {data.people.map((p: any) => (
          <div
            key={p.crmUserId}
            className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">
                  {p.name || `Unnamed user ${p.crmUserId.slice(0, 8)}…`}
                </span>
                {/* Active, but absent from the CRM's own user list. Worth
                    surfacing rather than hiding: it is usually someone who left,
                    someone in another location, or a gap in the user sync — and
                    all three are things a manager can resolve in seconds. */}
                {p.unlistedInCrm && (
                  <span
                    title="Doing work, but not in your CRM's user list. Often someone who's left, or an account from another location."
                    className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                  >
                    not in your CRM
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                {p.total === 0 ? (
                  "no outreach in this window"
                ) : (
                  <>
                    {p.total.toLocaleString()} touches · {p.calls.toLocaleString()} calls
                    · {p.texts.toLocaleString()} texts · last {ago(p.lastActiveAt)}
                  </>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {busy === p.crmUserId && (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
              {ROLES.map((r) => {
                const active = p.role === r.value;
                return (
                  <button
                    key={r.value}
                    title={r.hint}
                    disabled={busy === p.crmUserId}
                    onClick={() => void assign(p.crmUserId, r.value, p.name ?? undefined)}
                    className={
                      "rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 " +
                      (active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
