"use client";

// How far a filed EOD number may sit from what Close / the calendar measured
// before the page, the daily post and the Monday post flag it. Percent of
// the MEASURED number, with a floor so one call on a quiet day isn't a flag.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../../../convex/_generated/api";
import { CALENDAR_GAP, TOLERANCE_LIMITS } from "../../../../../convex/lib/eodCrossCheck";

const input = "w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring";

type Draft = { dialsPct: string; pickUpsPct: string; confirmationPct: string; minGap: string };

const ROWS: Array<{ key: keyof Draft; label: string; hint: string; unit: "%" | "" }> = [
  { key: "dialsPct", label: "Dials", hint: "The CRM counts every attempt, so this one can be tight.", unit: "%" },
  { key: "pickUpsPct", label: "Pick-ups", hint: "Looser: a call length is only a guess at whether a person answered.", unit: "%" },
  { key: "confirmationPct", label: "The confirmation setter's numbers", hint: "Self-books, people contacted, people reached.", unit: "%" },
  { key: "minGap", label: "Never flag a gap this small", hint: "On a quiet day a percentage would flag a single call. This stops that.", unit: "" },
];

export function ToleranceForm({ clerkId }: { clerkId: string }) {
  const config = useQuery(api.settersPageConfig.getConfig, { clerkId });
  const save = useMutation(api.settersPageConfig.setTolerances);
  const [draft, setDraft] = useState<Draft>({ dialsPct: "", pickUpsPct: "", confirmationPct: "", minGap: "" });
  const [status, setStatus] = useState<string | null>(null);
  const seeded = useRef(false);
  useEffect(() => {
    if (!config || seeded.current) return;
    seeded.current = true;
    const t = config.tolerances;
    setDraft({ dialsPct: String(t.dialsPct), pickUpsPct: String(t.pickUpsPct), confirmationPct: String(t.confirmationPct), minGap: String(t.minGap) });
  }, [config]);
  if (!config) return null;

  const submit = async () => {
    const n = (s: string) => Number(s.trim());
    const tolerances = { dialsPct: n(draft.dialsPct), pickUpsPct: n(draft.pickUpsPct), confirmationPct: n(draft.confirmationPct), minGap: n(draft.minGap) };
    if (Object.values(tolerances).some((v) => !Number.isFinite(v))) {
      setStatus("Every box needs a number");
      return;
    }
    try {
      await save({ clerkId, tolerances });
      setStatus("Saved");
      setTimeout(() => setStatus(null), 1500);
    } catch (err) {
      setStatus(err instanceof ConvexError && typeof err.data === "string" ? err.data : "Couldn't save — try again");
    }
  };
  const d = config.toleranceDefaults;

  return (
    <section className="rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold">How far off can an end-of-day form be before we flag it?</h3>
      <details className="mb-3 mt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">Why this matters</summary>
        <p className="mt-1 max-w-3xl">
          A number is flagged when it sits further than this from what the CRM or the calendar saw that day, as a share of what we saw. A flag never blocks anything and always
          shows both numbers, on the cards, in the setter&apos;s card, in the daily post and in the Monday post. Sets only count against a setter when they claim more than the
          calendar credits, and calls on the calendar can be {CALENDAR_GAP} out either way — a booking made near midnight lands on a different day for the two of us.
        </p>
      </details>
      <div className="space-y-3">
        {ROWS.map((r) => (
          <label key={r.key} className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <span className="w-44 pt-1.5 text-sm">{r.label}</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                min={r.unit === "%" ? TOLERANCE_LIMITS.pctMin : TOLERANCE_LIMITS.minGapMin}
                max={r.unit === "%" ? TOLERANCE_LIMITS.pctMax : TOLERANCE_LIMITS.minGapMax}
                value={draft[r.key]}
                onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })}
                className={input}
              />
              <span className="text-sm text-muted-foreground">{r.unit}</span>
            </span>
            <span className="basis-full text-xs text-muted-foreground sm:basis-auto sm:flex-1 sm:pt-1.5">
              {r.hint} Default {d[r.key]}
              {r.unit}.
            </span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={submit} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:border-foreground/40">
          Save
        </button>
        {status && <span className={`text-xs ${status === "Saved" ? "text-emerald-600" : "text-rose-600"}`}>{status}</span>}
      </div>
    </section>
  );
}
