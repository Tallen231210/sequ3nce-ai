"use client";

import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

const VERDICT: Record<string, { label: string; cls: string }> = {
  held: { label: "held", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  not_held: { label: "not held", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

/**
 * One rep, over time.
 *
 * The verdict on an agreement appears only where a record settles it.
 * Everything else shows no badge at all — not "unknown", not a hedge. A
 * manager glancing at this must be able to trust that a badge means we
 * checked, which requires the absence of one to mean nothing was claimed.
 */
export function RepHistory({
  closerId,
  onBack,
}: {
  closerId: string;
  onBack: () => void;
}) {
  const { user } = useUser();
  const d = useQuery(
    api.managerRepHistory.getRepHistory,
    user ? { clerkId: user.id, closerId: closerId as any } : "skip",
  );

  if (d === undefined) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!d) return null;

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">{d.name}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {d.meetingCount === 0
            ? "You haven't had a recorded one-to-one with them"
            : `${d.meetingCount} recorded one-to-one${d.meetingCount === 1 ? "" : "s"}`}
        </p>
      </div>

      {/* Never having spoken to someone is information, not an empty state. */}
      {d.meetingCount === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Once you record a one-to-one with them, what was agreed will appear
          here — along with whether it happened, where we can tell.
        </div>
      )}

      <div className="space-y-3">
        {d.timeline.map((t: any) => (
          <div key={t.meetingId} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-baseline justify-between gap-4">
              <div className="text-sm font-semibold">{t.title}</div>
              <div className="shrink-0 text-xs text-muted-foreground">
                {new Date(t.metAt).toLocaleDateString()}
                {t.duration ? ` · ${Math.round(t.duration / 60)} min` : ""}
              </div>
            </div>

            {t.summary && (
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {t.summary}
              </p>
            )}

            {t.agreements.length > 0 && (
              <ul className="mt-3.5 space-y-2">
                {t.agreements.map((a: any, i: number) => {
                  const v = VERDICT[a.verdict];
                  return (
                    <li key={i} className="flex items-start gap-2.5 text-[13px]">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                      <span className="flex-1 leading-relaxed">
                        {a.what}
                        {a.evidence && (
                          <span className="text-muted-foreground"> — {a.evidence}</span>
                        )}
                      </span>
                      {v && (
                        <span
                          className={
                            "mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium " +
                            v.cls
                          }
                        >
                          {v.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
