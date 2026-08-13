"use client";

// ============================================================================
// Showing the rows behind a number.
//
// A sales manager should never have to take a figure on faith. This panel
// answers "where did that come from" with the actual leads, the actual
// timestamps, and a plain sentence about what was and wasn't counted.
//
// It exists because three separate times this product reported a confident
// number computed from the wrong data and nobody could tell — including one
// location that spent weeks believing 1,083 of its leads had never been
// contacted. Every one of those dies in minutes once you can click the number.
// ============================================================================

import { useState } from "react";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Loader2, X } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

function when(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MetricDrill({
  metricId,
  rangeStart,
  rangeEnd,
  onClose,
}: {
  metricId: string;
  rangeStart: number;
  rangeEnd: number;
  onClose: () => void;
}) {
  const { user } = useUser();
  const [worstFirst, setWorstFirst] = useState(true);

  const data = useQuery(
    api.setterMetricDrill.drillMetric,
    user ? { clerkId: user.id, metricId, rangeStart, rangeEnd, worstFirst } : "skip",
  ) as any;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-4xl rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-sm font-semibold">
              {data?.metric?.label ?? "Where this number comes from"}
            </div>
            {data?.metric?.description && (
              <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                {data.metric.description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {data === undefined ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.ok ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            {data?.reason ?? "Nothing to show for this metric yet."}
          </div>
        ) : (
          <div className="px-5 py-4">
            {/* The rules in force, in words. Most disagreements about a metric
                turn out to be disagreements about this sentence. */}
            <div className="mb-4 rounded-lg border border-border bg-muted/40 px-3.5 py-3 text-xs leading-relaxed">
              <div>{data.basis}</div>
              <div className="mt-1 text-muted-foreground">
                Counting outreach on:{" "}
                <span className="font-medium text-foreground">
                  {data.countedChannels.join(" and ")}
                </span>
                . Built from {data.totalRows.toLocaleString()} leads.
                {data.truncated && " Showing a capped sample — the range is larger than we read in one go."}
              </div>
            </div>

            {/* Who actually did the work. Automation and people-we-can't-name
                are separated on purpose: one is expected, the other quietly
                breaks every per-setter number until someone fixes it. */}
            {data.attribution && (
              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                {/* Deliberately worded as touches, not people. A bare number
                    beside the word "setters" reads as a headcount — it was
                    misread that way the first time this shipped. */}
                <Pill
                  label={`touches by ${data.attribution.namedPeople} known ${data.attribution.namedPeople === 1 ? "setter" : "setters"}`}
                  value={data.attribution.namedTouches}
                  tone="ok"
                />
                <Pill
                  label="touches by automation"
                  value={data.attribution.automatedTouches}
                  tone="muted"
                  title="No user attached to these — a workflow or power dialer, not a person."
                />
                {data.attribution.unrecognisedTouches > 0 && (
                  <Pill
                    label={`touches by ${data.attribution.unrecognisedPeople} ${data.attribution.unrecognisedPeople === 1 ? "person" : "people"} we can't name`}
                    value={data.attribution.unrecognisedTouches}
                    tone="warn"
                    title="Real CRM users with no record on our side, so they're missing from every per-setter breakdown. Usually people added to the CRM since the last sync."
                  />
                )}
              </div>
            )}

            {data.neverContacted?.total > 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                <span className="font-medium">
                  {data.neverContacted.total.toLocaleString()} leads had no outreach at all
                </span>{" "}
                and are not part of this figure — you can&apos;t measure a response
                that never happened. They belong to contact rate instead.
              </div>
            )}

            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium text-muted-foreground">
                {worstFirst ? "Slowest first" : "Oldest first"}
              </div>
              <button
                onClick={() => setWorstFirst((w) => !w)}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {worstFirst ? "Show oldest first" : "Show slowest first"}
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Prospect</th>
                    <th className="px-3 py-2 font-medium">Arrived</th>
                    <th className="px-3 py-2 font-medium">First counted outreach</th>
                    <th className="px-3 py-2 text-right font-medium">Result</th>
                    <th className="px-3 py-2 font-medium">Who</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r: any) => (
                    <tr key={r.leadId} className="border-b border-border last:border-0 align-top">
                      <td className="px-3 py-2 font-medium">{r.leadName}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {when(r.steps[0]?.at)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {when(r.steps[1]?.at ?? null)}
                        {/* The thing we deliberately ignored. This line is what
                            turns "that number is wrong" into "ah, right". */}
                        {r.excluded && (
                          <div className="mt-0.5 text-[11px] italic text-amber-700">
                            {r.excluded}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {r.value}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.setterName ?? (
                          <span className="italic">automated</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.neverContacted?.sample?.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Show some of the leads with no outreach
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {data.neverContacted.sample.map((r: any) => (
                    <li key={r.leadId}>
                      {r.leadName} — arrived {when(r.steps[0]?.at)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: number;
  tone: "ok" | "muted" | "warn";
  title?: string;
}) {
  const cls =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "ok"
        ? "border-border bg-muted/40 text-foreground"
        : "border-border bg-muted/20 text-muted-foreground";
  return (
    <span title={title} className={`rounded-md border px-2 py-1 ${cls}`}>
      <span className="font-semibold tabular-nums">{value.toLocaleString()}</span>{" "}
      {label}
    </span>
  );
}
