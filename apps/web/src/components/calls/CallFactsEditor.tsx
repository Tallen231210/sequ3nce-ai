"use client";

// ============================================================================
// Correcting the numbers on a call.
//
// The EOD form corrects daily totals; Collections works per call. So this is
// the only place a mis-read payment plan can actually be put right — a closer
// can fix their whole day and a wrong balance here stays wrong, because the
// thing they corrected isn't the thing Collections reads.
//
// Marks AI-read figures as such. A number we guessed and a number a person
// confirmed must never look identical when the difference decides whether a
// customer gets chased for money.
// ============================================================================

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Check, Loader2, Sparkles } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/* eslint-disable @typescript-eslint/no-explicit-any */

const OUTCOMES: { value: string; label: string }[] = [
  { value: "closed", label: "Closed" },
  { value: "follow_up", label: "Follow-up" },
  { value: "lost", label: "Not closed" },
  { value: "no_show", label: "No show" },
  { value: "rescheduled", label: "Rescheduled" },
];

export interface CallFacts {
  outcome?: string | null;
  cashCollected?: number | null;
  contractValue?: number | null;
  outcomeSource?: string | null;
  primaryObjection?: string | null;
  /** The closed-call equivalent — what they raised and the closer worked past. */
  objectionsOvercome?: string | null;
  /** Every objection raised, in order, when AI read the call. */
  objections?: string[] | null;
}

const OBJECTION_LABELS: Record<string, string> = {
  spouse_partner: "needed to speak to their partner",
  price_money: "the price",
  timing: "timing",
  need_to_think: "wanted to think about it",
  not_qualified: "not a fit",
  logistics: "logistics",
  competitor: "a competitor",
  other: "something else",
};

const label = (o: string) => OBJECTION_LABELS[o] ?? o.replace(/_/g, " ");

/** Empty string clears the value; anything unparseable is left alone. */
function toNumberOrNull(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export function CallFactsEditor({
  callId,
  facts,
  compact = false,
  onSaved,
}: {
  callId: string;
  facts: CallFacts;
  /** Inline on the Collections list, rather than a panel on the call page. */
  compact?: boolean;
  onSaved?: () => void;
}) {
  const { user } = useUser();
  const update = useMutation(api.callFacts.updateCallFacts);

  const [outcome, setOutcome] = useState(facts.outcome ?? "");
  const [cash, setCash] = useState(
    facts.cashCollected != null ? String(facts.cashCollected) : "",
  );
  const [contract, setContract] = useState(
    facts.contractValue != null ? String(facts.contractValue) : "",
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep in step when the underlying call changes beneath us — extraction can
  // land while a manager has the page open.
  useEffect(() => {
    setOutcome(facts.outcome ?? "");
    setCash(facts.cashCollected != null ? String(facts.cashCollected) : "");
    setContract(facts.contractValue != null ? String(facts.contractValue) : "");
  }, [facts.outcome, facts.cashCollected, facts.contractValue]);

  const isAi = facts.outcomeSource === "ai";
  const dirty =
    outcome !== (facts.outcome ?? "") ||
    cash !== (facts.cashCollected != null ? String(facts.cashCollected) : "") ||
    contract !==
      (facts.contractValue != null ? String(facts.contractValue) : "");

  async function save() {
    if (!user) return;
    const cashValue = toNumberOrNull(cash);
    const contractValue = toNumberOrNull(contract);
    if (cashValue === undefined || contractValue === undefined) {
      setError("Those need to be numbers.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res: any = await update({
        clerkId: user.id,
        callId: callId as Id<"calls">,
        outcome: outcome === "" ? null : outcome,
        cashCollected: cashValue,
        contractValue,
      });
      if (!res.success) setError(res.error ?? "Couldn't save that.");
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        onSaved?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-foreground";

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {isAi && (
        <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-relaxed text-violet-900">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Read from the recording, not entered by anyone. Worth a glance if
            the deal was on a payment plan — correcting it here fixes it
            everywhere, including Collections.
          </span>
        </div>
      )}

      {/* The objection trail, shown only when there is more than one — because
          one objection needs no explaining, and several is exactly the case
          where the single answer looks arbitrary unless you can see how it got
          there. A prospect who opens on their partner and ends on the price
          raised a price objection; this is what makes that legible. */}
      {isAi && (facts.objections?.length ?? 0) > 1 && (() => {
        // On a closed call the recorded answer lives in objectionsOvercome —
        // primaryObjection is deliberately cleared, since a deal that closed has
        // no blocker. Reading only the one field left the sentence pointing at a
        // bold word that wasn't there.
        const closed = facts.outcome === "closed";
        const recorded = closed
          ? facts.objectionsOvercome
          : facts.primaryObjection;
        return (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Objections, in the order they came up:{" "}
            {facts.objections!.map((o, i) => (
              <span key={o}>
                {i > 0 && <span className="text-muted-foreground/60"> → </span>}
                <span
                  className={
                    o === recorded ? "font-medium text-foreground" : undefined
                  }
                >
                  {label(o)}
                </span>
              </span>
            ))}
            {recorded
              ? closed
                ? ". Recorded as the one in bold — what they worked past to buy."
                : ". Recorded as the one in bold — the last thing standing between them and yes."
              : "."}
          </p>
        );
      })()}

      <div className={compact ? "flex flex-wrap items-end gap-2" : "grid gap-3 sm:grid-cols-3"}>
        <div className={compact ? "w-36" : ""}>
          <label className="text-[11px] font-medium text-muted-foreground">
            Outcome
          </label>
          <select
            value={outcome}
            disabled={busy}
            onChange={(e) => setOutcome(e.target.value)}
            className={`mt-1 ${inputClass}`}
          >
            <option value="">Not set</option>
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className={compact ? "w-32" : ""}>
          <label className="text-[11px] font-medium text-muted-foreground">
            Cash collected
          </label>
          <input
            value={cash}
            disabled={busy}
            onChange={(e) => setCash(e.target.value)}
            placeholder="—"
            inputMode="decimal"
            className={`mt-1 ${inputClass}`}
          />
        </div>

        <div className={compact ? "w-32" : ""}>
          <label className="text-[11px] font-medium text-muted-foreground">
            Contract value
          </label>
          <input
            value={contract}
            disabled={busy}
            onChange={(e) => setContract(e.target.value)}
            placeholder="—"
            inputMode="decimal"
            className={`mt-1 ${inputClass}`}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-lg border border-foreground bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saved && !busy && <Check className="h-3.5 w-3.5" />}
          {saved && !busy ? "Saved" : "Save"}
        </button>
        <span className="text-[11px] text-muted-foreground">
          Cash is what was taken on the day. On a payment plan that&apos;s the
          deposit, not the total.
        </span>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
