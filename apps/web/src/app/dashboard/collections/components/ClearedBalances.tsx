"use client";

// ============================================================================
// Recently cleared balances, with an undo.
//
// Clearing is two clicks from a Slack channel that customer success can reach,
// which is the point — but it means a mis-tick can write off a real deal. A
// cleared balance keeps every field it had, so putting it back is only unsetting
// the markers; the work here is making it findable.
// ============================================================================

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Loader2, Undo2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";

export function ClearedBalances() {
  const { user, isLoaded } = useUser();
  const data = useQuery(
    api.collectionsSettings.getClearedBalances,
    isLoaded && user ? { clerkId: user.id } : "skip",
  );
  const undo = useMutation(api.collectionsSettings.undoBalance);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  if (data.count === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing cleared in the last 30 days.
        </p>
      </div>
    );
  }

  const restore = async (callId: string) => {
    if (!user) return;
    setBusy(callId);
    setError(null);
    try {
      const result = await undo({ clerkId: user.id, callId: callId as never });
      if (!result.success && result.error) setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't restore that");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6">
      <p className="mb-4 text-sm text-muted-foreground">
        Cleared in the last 30 days. Restoring one puts it back on the
        outstanding list and into the digest.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-900">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Prospect</th>
              <th className="px-4 py-2.5 font-medium">Closer</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th className="px-4 py-2.5 font-medium">Marked as</th>
              <th className="px-4 py-2.5 font-medium">When</th>
              {data.canEdit && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {data.balances.map((b) => (
              <tr key={b.callId} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">{b.prospectName}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {b.closerName}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {money(b.balance)}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (b.clearedAs === "settled"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-zinc-200 text-zinc-700")
                    }
                  >
                    {b.clearedAs === "settled" ? "Collected" : "Written off"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {b.clearedAt ? formatWhen(b.clearedAt) : "—"}
                </td>
                {data.canEdit && (
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => restore(b.callId)}
                      disabled={busy === b.callId}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      Restore
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
