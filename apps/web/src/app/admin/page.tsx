"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Loader2, ExternalLink, ShieldAlert, Search, Users } from "lucide-react";

interface AdminAccount {
  teamId: string;
  teamName: string;
  emails: string[];
  primaryClerkId: string | null;
  subscriptionStatus: string | null;
  plan: string | null;
  comped: boolean;
  closerCount: number;
}

interface AuditRow {
  action: string;
  targetEmail: string | null;
  targetTeamName: string | null;
  createdAt: number;
}

interface ImpersonateResult {
  url: string;
  targetEmail: string;
  teamName: string | null;
}

export default function AdminPage() {
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [recent, setRecent] = useState<AuditRow[]>([]);
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImpersonateResult | null>(null);

  useEffect(() => {
    void loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      const res = await fetch("/api/admin/accounts");
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || "Failed to load accounts");
        setAccounts([]);
        return;
      }
      setAccounts(data.accounts ?? []);
      setRecent(data.recent ?? []);
    } catch {
      setLoadError("Failed to load accounts");
      setAccounts([]);
    }
  }

  // Match on company name OR any part of any email — you rarely know the
  // exact login address.
  const filtered = useMemo(() => {
    if (!accounts) return [];
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.teamName.toLowerCase().includes(q) ||
        a.emails.some((e) => e.toLowerCase().includes(q)),
    );
  }, [accounts, search]);

  async function impersonate(account: AdminAccount) {
    setError("");
    setResult(null);
    setPendingId(account.teamId);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          account.primaryClerkId
            ? { clerkId: account.primaryClerkId }
            : { email: account.emails[0] },
        ),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Something went wrong");
      else setResult(data as ImpersonateResult);
    } catch {
      setError("Request failed");
    } finally {
      setPendingId(null);
    }
  }

  function openSession() {
    if (!result) return;
    window.open(result.url, "_blank", "noopener,noreferrer");
    setResult(null);
    void loadAccounts(); // refresh the audit list
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Impersonate a customer</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Sign in as a client&apos;s account to help with setup — no login
          sharing. Opens a Clerk-marked session in a new tab; every
          impersonation is logged below.
        </p>
      </div>

      {/* Confirmation step — shown after picking an account */}
      {result && (
        <Card className="border-amber-300">
          <CardContent className="p-4">
            <div className="text-sm">
              <span className="text-zinc-600">About to sign in as</span>{" "}
              <span className="font-semibold">
                {result.teamName ?? "(no team on file)"}
              </span>{" "}
              <span className="text-zinc-600">— {result.targetEmail}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={openSession}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open session
              </Button>
              <Button variant="ghost" onClick={() => setResult(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounts</CardTitle>
          <CardDescription>
            Search by company name or any part of an email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. remotestack, or gianni@"
              className="pl-9"
              autoFocus
            />
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-sm text-red-600">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
          {loadError && (
            <p className="flex items-center gap-1.5 text-sm text-red-600">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              {loadError}
            </p>
          )}

          {accounts === null ? (
            <div className="flex items-center gap-2 py-6 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading accounts…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-sm text-zinc-500">
              No accounts match &ldquo;{search}&rdquo;.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
              {filtered.map((a) => {
                const live =
                  a.subscriptionStatus === "active" ||
                  a.subscriptionStatus === "trialing";
                return (
                  <li
                    key={a.teamId}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {a.teamName}
                        </span>
                        {live && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                            {a.comped ? "comped" : "active"}
                          </span>
                        )}
                        {a.closerCount > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                            <Users className="h-3 w-3" />
                            {a.closerCount}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        {a.emails.length > 0
                          ? a.emails.join(", ")
                          : "no manager login on file"}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        pendingId !== null ||
                        (!a.primaryClerkId && a.emails.length === 0)
                      }
                      onClick={() => impersonate(a)}
                    >
                      {pendingId === a.teamId ? (
                        <>
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Preparing…
                        </>
                      ) : (
                        "Impersonate"
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent admin activity</CardTitle>
          <CardDescription>Impersonation audit trail (last 10).</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-zinc-500">No admin actions yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm">
              {recent.map((r, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <span>
                    <span className="font-medium">{r.action}</span>{" "}
                    <span className="text-zinc-600">
                      {r.targetTeamName ?? r.targetEmail ?? "—"}
                    </span>
                  </span>
                  <span className="text-xs text-zinc-400">
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
