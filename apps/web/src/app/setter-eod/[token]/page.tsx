"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Logo } from "@/components/ui/logo";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// A setter's end-of-day form. Their personal link is the whole login —
// bookmarked on a phone, filled in thirty seconds, done.
// ============================================================================

const FIELDS: Array<{ key: string; label: string; hint?: string }> = [
  { key: "dials", label: "Dials", hint: "phone call attempts today — every attempt counts, incl. no-answers" },
  { key: "pickUps", label: "Pick ups", hint: "dials where a human answered and you spoke" },
  { key: "sets", label: "Sets", hint: "new sales calls you booked today — prospect committed, time locked in" },
  { key: "newLeadsHit", label: "New leads hit", hint: "brand-new leads you contacted for the first time today" },
  { key: "followUps", label: "Follow ups", hint: "existing leads you re-contacted today" },
  { key: "callsOnCalendar", label: "Calls on the calendar", hint: "first consults from YOUR sets that were scheduled for today" },
  { key: "callsShown", label: "Calls shown", hint: "of those, how many showed — follow-ups / second calls don't count" },
  { key: "callsClosed", label: "Calls closed", hint: "deals from YOUR sets that closed today — follow-up closes count" },
  { key: "cashCollected", label: "Cash collected ($)", hint: "cash collected today from your sets' deals — later payments count" },
];
const OPTIONAL_KEYS = new Set(["callsOnCalendar", "callsShown", "callsClosed", "cashCollected"]);

export default function SetterEodPage() {
  const { token } = useParams<{ token: string }>();
  const ctx = useQuery(api.setterEod.getEodFormContext, token ? { token } : "skip");
  const submit = useMutation(api.setterEod.submitEod);

  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill with today's earlier submission so re-opening the link edits
  // rather than starting from zeros.
  useEffect(() => {
    if (ctx?.existing && Object.keys(values).length === 0) {
      const e: any = ctx.existing;
      setValues({
        dials: String(e.dials),
        pickUps: String(e.pickUps),
        sets: String(e.sets),
        newLeadsHit: String(e.newLeadsHit),
        followUps: String(e.followUps),
        callsOnCalendar: e.callsOnCalendar != null ? String(e.callsOnCalendar) : "",
        callsShown: e.callsShown != null ? String(e.callsShown) : "",
        callsClosed: e.callsClosed != null ? String(e.callsClosed) : "",
        cashCollected: e.cashCollected != null ? String(e.cashCollected) : "",
      });
      setNote(e.note ?? "");
    }
  }, [ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ctx === undefined) {
    return (
      <Shell>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Shell>
    );
  }
  if (ctx === null) {
    return (
      <Shell>
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold">This link isn&apos;t active</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Ask your manager for your current EOD link.
          </p>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="max-w-sm text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <h1 className="mt-3 text-lg font-semibold">Filed for {ctx.today}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Done — you can close this. Reopen your link any time tonight to
            correct a number.
          </p>
        </div>
      </Shell>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const opt = (k: string) => {
        const raw = (values[k] ?? "").trim();
        return raw === "" ? undefined : Number(raw);
      };
      await submit({
        token,
        dials: Number(values.dials ?? 0),
        pickUps: Number(values.pickUps ?? 0),
        sets: Number(values.sets ?? 0),
        newLeadsHit: Number(values.newLeadsHit ?? 0),
        followUps: Number(values.followUps ?? 0),
        callsOnCalendar: opt("callsOnCalendar"),
        callsShown: opt("callsShown"),
        callsClosed: opt("callsClosed"),
        cashCollected: opt("cashCollected"),
        note: note.trim() || undefined,
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.data ?? "That didn't save — check the numbers and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border py-6">
        <div className="flex justify-center">
          <Logo height={30} />
          <a
            href="/setter"
            className="mt-3 block rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-center text-[12px] text-sky-800"
          >
            The setter app is live — sign in with your email at{" "}
            <span className="font-medium underline">sequ3nce.ai/setter</span>
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-md px-5 py-8">
        <h1 className="text-xl font-semibold tracking-tight">
          {ctx.setterName} — end of day
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.today}
          {ctx.existing ? " · already filed, submitting again updates it" : ""}
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="text-sm font-medium">
                {f.label}
                {f.hint && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    ({f.hint})
                  </span>
                )}
              </label>
              <input
                // Numeric keypad on phones — this form lives on phones.
                type="number"
                inputMode="numeric"
                min={0}
                required
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ))}

          <div>
            <label className="text-sm font-medium">
              Anything else{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-50"
          >
            {busy ? "Saving…" : ctx.existing ? "Update today's numbers" : "Submit"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      {children}
    </div>
  );
}
