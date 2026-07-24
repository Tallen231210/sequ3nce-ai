"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Loader2, UserCog, ExternalLink, ShieldAlert } from "lucide-react";

interface ImpersonateResult {
  url: string;
  targetEmail: string;
  teamName: string | null;
}

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImpersonateResult | null>(null);

  const recent = useQuery(api.adminAudit.recentAdminActions, { limit: 10 });

  async function findAndImpersonate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setResult(data as ImpersonateResult);
      }
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  }

  function openSession() {
    if (result) {
      window.open(result.url, "_blank", "noopener,noreferrer");
      // One-time token — clear so it can't be reused/confused with a stale one.
      setResult(null);
      setEmail("");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Impersonate a customer</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Sign in as a client&apos;s account to help with setup — no login
          sharing. Opens a Clerk-marked impersonation session in a new tab.
          Every impersonation is logged below.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="h-4 w-4" />
            Find account
          </CardTitle>
          <CardDescription>
            Enter the manager&apos;s login email (the one they sign in with).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!result ? (
            <form onSubmit={findAndImpersonate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@example.com"
                  autoFocus
                />
              </div>
              {error && (
                <p className="flex items-center gap-1.5 text-sm text-red-600">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}
              <Button type="submit" disabled={loading || !email.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Finding…
                  </>
                ) : (
                  "Find & impersonate"
                )}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
                <div className="font-medium text-zinc-900">
                  Impersonate{" "}
                  {result.teamName ? (
                    <span>{result.teamName}</span>
                  ) : (
                    <span className="text-amber-700">(no team on file)</span>
                  )}
                  ?
                </div>
                <div className="mt-0.5 text-zinc-600">{result.targetEmail}</div>
              </div>
              <div className="flex gap-2">
                <Button onClick={openSession}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open session
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setResult(null);
                    setEmail("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent admin activity</CardTitle>
          <CardDescription>Impersonation audit trail (last 10).</CardDescription>
        </CardHeader>
        <CardContent>
          {recent === undefined ? (
            <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
          ) : recent.length === 0 ? (
            <p className="text-sm text-zinc-500">No admin actions yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm">
              {recent.map((r: {
                action: string;
                targetEmail: string | null;
                targetTeamName: string | null;
                createdAt: number;
              }, i: number) => (
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
