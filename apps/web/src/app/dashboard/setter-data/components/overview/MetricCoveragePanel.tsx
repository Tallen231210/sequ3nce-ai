"use client";

// ============================================================================
// What we can measure for you, and what we can't.
//
// The second list is the point. A dashboard that silently omits a metric leaves
// a manager to conclude either that it doesn't exist or that their team scored
// zero — and on one live team, "contact rate 49%" was measuring a population
// half of which their setters were never meant to touch.
//
// Saying "we can't work this out, here's why, here's what would fix it" is
// slower to build and enormously more honest than a confident wrong number.
// Every reason is in the language a sales manager uses, not ours.
// ============================================================================

import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Check, Loader2, Lock } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function MetricCoveragePanel() {
  const { user } = useUser();
  const status = useQuery(
    api.setterFunnels.getFunnelStatus,
    user ? { clerkId: user.id } : "skip",
  ) as any;

  if (status === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Working out what we can
        measure…
      </div>
    );
  }
  if (!status) return null;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-1 text-sm font-semibold">What we can measure</div>
      <p className="mb-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        Based on what your CRM actually gives us. Anything we can&apos;t work out
        is listed below with the reason — we&apos;d rather tell you than show you a
        number we don&apos;t trust.
        {!status.funnel.configured && (
          <>
            {" "}
            You haven&apos;t set your funnel up yet, so these are our best
            assumptions about how you work.
          </>
        )}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Available
          </div>
          <ul className="space-y-2">
            {status.available.map((m: any) => (
              <li key={m.id} className="flex gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                <div>
                  <div className="text-[13px] font-medium">{m.label}</div>
                  <div className="text-[11px] leading-relaxed text-muted-foreground">
                    {m.description}
                  </div>
                </div>
              </li>
            ))}
            {status.available.length === 0 && (
              <li className="text-xs text-muted-foreground">
                Nothing yet — connect a CRM to get started.
              </li>
            )}
          </ul>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Not available yet
          </div>
          <ul className="space-y-2">
            {status.blocked.map((m: any) => (
              <li key={m.id} className="flex gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div>
                  <div className="text-[13px] font-medium text-muted-foreground">
                    {m.label}
                  </div>
                  {/* The reason and the remedy in one sentence. A locked metric
                      with no explanation is indistinguishable from a broken one. */}
                  <div className="text-[11px] leading-relaxed text-muted-foreground">
                    {m.reason}
                  </div>
                </div>
              </li>
            ))}
            {status.blocked.length === 0 && (
              <li className="text-xs text-muted-foreground">
                Everything we know how to measure is available to you.
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
