"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Loader2, RotateCw, ShieldAlert } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComplianceFindings, type ComplianceReview } from "./ComplianceFindings";
import type { Id } from "../../../convex/_generated/dataModel";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The compliance section of a call page.
 *
 * Renders nothing at all unless the viewer is a manager on a team with
 * compliance switched on AND the call has been reviewed. The query does the
 * gating server-side and returns null otherwise, so a closer opening the same
 * page sees no gap where a panel would be.
 */
export function CallCompliancePanel({
  callId,
  onSeek,
}: {
  callId: string;
  onSeek?: (seconds: number) => void;
}) {
  const { user } = useUser();
  const data: any = useQuery(
    api.complianceSettings.getCallCompliance,
    user ? { clerkId: user.id, callId: callId as Id<"calls"> } : "skip",
  );
  const rerun = useAction(api.complianceSettings.rerunComplianceReview);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data) return null;

  const review = data.review as ComplianceReview | null;
  const failure = data.failure as string | null;

  async function runAgain() {
    setBusy(true);
    setError(null);
    try {
      const res: any = await rerun({
        clerkId: user!.id,
        callId: callId as Id<"calls">,
      });
      if (!res?.ok) setError(res?.reason ?? "Couldn't re-run the review.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't re-run the review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldAlert className="h-5 w-5" />
          Compliance
        </CardTitle>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAgain()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCw className="h-3 w-3" />
          )}
          Review again
        </button>
      </CardHeader>

      <CardContent>
        {/* A score is a record of a judgement made against the rules as they
            stood. Editing the rules doesn't rewrite history — it just means
            this number answers a question you're no longer asking, and saying
            so is the difference between explicable and confusing. */}
        {review && data.rulesChanged && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Your rules have changed since this call was reviewed. Review again to
            score it against the current ones.
          </p>
        )}

        {error && (
          <p className="mb-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        {/* Shown rather than hidden, and worded so it can't be mistaken for a
            clean result. A call we failed to review is the one state where
            saying nothing would be actively misleading. */}
        {!review && failure && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-900">
              This call couldn&apos;t be reviewed
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              {failure} Nothing was checked against your rules — this is not a
              clean result. Try again, and tell us if it keeps happening.
            </p>
          </div>
        )}

        {review && <ComplianceFindings review={review} onSeek={onSeek} />}

        {review && (
          <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            These are things worth a look against the rules you wrote, not a
            finding that any rule was broken. Speaker labels come from the
            recording and are occasionally wrong — read the quote before acting
            on it.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
