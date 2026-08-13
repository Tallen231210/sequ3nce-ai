"use client";

// ============================================================================
// Who else can open this dashboard.
//
// Until now, nobody could — a `users` row was only ever created by first
// sign-in, which makes a NEW team. So a co-founder signing up landed on an
// empty team and the subscribe page, which reads as the company's account
// having lapsed rather than "we don't know you yet".
//
// The invite is just a record to match against. When they sign in with that
// email, the existing verified-email path in `ensureUserTeam` puts them on this
// team. No token to expire, nothing of ours to verify — Clerk has already
// proven the address.
// ============================================================================

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Check, Copy, Loader2, UserPlus, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Id } from "../../../convex/_generated/dataModel";

/* eslint-disable @typescript-eslint/no-explicit-any */

function joinUrl(email: string): string {
  const base =
    typeof window !== "undefined" ? window.location.origin : "https://sequ3nce.ai";
  return `${base}/join?e=${encodeURIComponent(email)}`;
}

export function ManagersCard() {
  const { user } = useUser();
  const clerkId = user?.id;

  const data: any = useQuery(
    api.teams.listTeamManagers,
    clerkId ? { clerkId } : "skip",
  );
  const createInvite = useMutation(api.teams.createManagerInvite);
  const revokeInvite = useMutation(api.teams.revokeManagerInvite);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Null means not a manager — the card shouldn't exist for them at all.
  if (!data) return null;

  async function invite() {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res: any = await createInvite({ clerkId: clerkId!, email });
      if (!res.success) setError(res.error ?? "Couldn't create that invite.");
      else setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create that invite.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(target: string) {
    try {
      await navigator.clipboard.writeText(joinUrl(target));
      setCopied(target);
      setTimeout(() => setCopied((c) => (c === target ? null : c)), 2000);
    } catch {
      setError("Couldn't copy — select the link and copy it manually.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Managers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          People who can open this dashboard. Everyone here has the same access
          you do, including billing. Closers don&apos;t need an invite —
          they use the desktop app.
        </p>

        {/* Current managers */}
        <div className="space-y-1.5">
          {data.members.map((m: any) => (
            <div
              key={m._id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="truncate">
                {m.name || m.email}
                {m.isYou && (
                  <span className="ml-2 text-xs text-muted-foreground">you</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {m.name ? m.email : ""}
              </span>
            </div>
          ))}
        </div>

        {/* Pending invites */}
        {data.pending.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Invited, not signed in yet
            </div>
            {data.pending.map((p: any) => (
              <div
                key={p._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm"
              >
                <span className="truncate">{p.email}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copy(p.email)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    {copied === p.email ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copied === p.email ? "Copied" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void revokeInvite({
                        clerkId: clerkId!,
                        inviteId: p._id as Id<"managerInvites">,
                      })
                    }
                    title="Cancel this invite"
                    className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Invite */}
        <div className="border-t border-border pt-4">
          <label className="text-xs font-medium" htmlFor="invite-email">
            Invite someone
          </label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <input
              id="invite-email"
              type="email"
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void invite();
              }}
              placeholder="name@company.com"
              className="min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground"
            />
            <button
              type="button"
              disabled={busy || !email.trim()}
              onClick={() => void invite()}
              className="inline-flex items-center gap-2 rounded-lg border border-foreground bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create invite
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Creates a link you send them yourself. They open it, sign in with
            that exact email, and land here — signing in with a different
            address would start a separate company instead.
          </p>
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
