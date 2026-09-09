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
// bookmarked on a phone, filled in thirty seconds, done. The fields come
// from the server and depend on the person's role (see setterEodFields.ts);
// a confirmation setter's link shows her form, without the measured prefill
// the signed-in app has.
// ============================================================================

const CORE = ["dials", "pickUps", "sets", "newLeadsHit", "followUps"] as const;

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
      const next: Record<string, string> = {};
      for (const f of ctx.eodFields) next[f.key] = e[f.key] != null ? String(e[f.key]) : "";
      setValues(next);
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
          <p className="mt-1.5 text-sm text-muted-foreground">Ask your manager for your current EOD link.</p>
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
            Done — you can close this. Reopen your link any time tonight to correct a number.
          </p>
        </div>
      </Shell>
    );
  }

  const isConfirmation = ctx.role === "confirmation";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const num = (k: string) => {
        const raw = (values[k] ?? "").trim();
        return raw === "" ? undefined : Number(raw);
      };
      const args: Record<string, unknown> = { token, note: note.trim() || undefined };
      for (const k of CORE) args[k] = isConfirmation ? 0 : (num(k) ?? 0);
      for (const f of ctx!.eodFields) if (f.optional) args[f.key] = num(f.key);
      await submit(args as Parameters<typeof submit>[0]);
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
          <a href="/setter" className="mt-3 block rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-center text-[12px] text-sky-800">
            The setter app is live — sign in with your email at <span className="font-medium underline">sequ3nce.ai/setter</span>
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-md px-5 py-8">
        <h1 className="text-xl font-semibold tracking-tight">{ctx.setterName} — end of day</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.today}
          {ctx.existing ? " · already filed, submitting again updates it" : ""}
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {ctx.eodFields.map((f) => (
            <div key={f.key}>
              <label className="text-sm font-medium">
                {f.label}
                {f.hint && <span className="ml-1.5 font-normal text-muted-foreground">({f.hint})</span>}
              </label>
              <input
                // Numeric keypad on phones — this form lives on phones.
                type="number"
                inputMode="numeric"
                min={0}
                required={!f.optional}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ))}

          <div>
            <label className="text-sm font-medium">
              Anything else <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <button type="submit" disabled={busy} className="w-full rounded-lg bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-50">
            {busy ? "Saving…" : ctx.existing ? "Update today's numbers" : "Submit"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-background px-5">{children}</div>;
}
