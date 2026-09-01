"use client";

// The EOD form — the tab a setter opens every evening. Same fields as the
// old tokenized form plus Zion's three additions; resubmitting replaces
// today's numbers.

import React, { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSetter } from "../_components/SetterContext";

const FIELDS: Array<{ key: string; label: string; hint?: string }> = [
  { key: "dials", label: "Dials", hint: "phone call attempts today — every attempt counts, incl. no-answers" },
  { key: "pickUps", label: "Pick ups", hint: "dials where a human answered and you spoke" },
  { key: "sets", label: "Sets", hint: "new sales calls you booked today — prospect committed, time locked in" },
  { key: "newLeadsHit", label: "New leads hit", hint: "brand-new leads you contacted for the first time today" },
  { key: "followUps", label: "Follow ups", hint: "existing leads you re-contacted today" },
  { key: "callsOnCalendar", label: "Calls on the calendar", hint: "first consults from YOUR sets that were scheduled for today" },
  { key: "callsShown", label: "Calls shown", hint: "of those, how many showed — follow-ups / second calls don't count" },
  { key: "callsClosed", label: "Calls closed", hint: "of today's shows, how many closed" },
];

export default function SetterEodPage() {
  const { sessionToken, home } = useSetter();
  const submit = useMutation(api.setterApp.submitEod);
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // The home query re-pushes whenever ANYTHING in its read set changes
  // (the team doc gets patched by unrelated crons). Prefill exactly once
  // per submission, keyed on submittedAt — never off object identity, or a
  // background refresh wipes half-typed numbers.
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  useEffect(() => {
    const e = home.todayEntry;
    if (!e) return;
    if (loadedAt === e.submittedAt) return;
    setLoadedAt(e.submittedAt);
    setValues({
      dials: String(e.dials),
      pickUps: String(e.pickUps),
      sets: String(e.sets),
      newLeadsHit: String(e.newLeadsHit),
      followUps: String(e.followUps),
      callsOnCalendar: e.callsOnCalendar != null ? String(e.callsOnCalendar) : "",
      callsShown: e.callsShown != null ? String(e.callsShown) : "",
      callsClosed: e.callsClosed != null ? String(e.callsClosed) : "",
    });
    setNote(e.note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home.todayEntry?.submittedAt]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const n = (k: string) => {
      const raw = (values[k] ?? "").trim();
      return raw === "" ? 0 : Number(raw);
    };
    const opt = (k: string) => {
      const raw = (values[k] ?? "").trim();
      return raw === "" ? undefined : Number(raw);
    };
    try {
      await submit({
        sessionToken,
        dials: n("dials"),
        pickUps: n("pickUps"),
        sets: n("sets"),
        newLeadsHit: n("newLeadsHit"),
        followUps: n("followUps"),
        callsOnCalendar: opt("callsOnCalendar"),
        callsShown: opt("callsShown"),
        callsClosed: opt("callsClosed"),
        note: note.trim() || undefined,
      });
      setSaved(true);
    } catch (err) {
      // ConvexError carries the human message in .data; anything else gets a
      // plain fallback rather than request-id plumbing.
      const data = (err as { data?: unknown })?.data;
      setError(
        typeof data === "string" && data
          ? data
          : "That didn't save — check the numbers and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="mb-5">
        <h1 className="text-[17px] font-semibold tracking-tight">End of day</h1>
        <p className="mt-0.5 text-[13px] text-neutral-500">
          {home.filedToday ? (
            <>
              Filed today ✓ — edit anything and resubmit.
            </>
          ) : (
            <>Today, {home.today}. Fill it in before you sign off.</>
          )}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-[12px] font-medium text-neutral-600">
                {f.label}
              </span>
              {f.hint && (
                <span className="-mt-0.5 mb-1 block text-[10px] leading-tight text-neutral-400">
                  {f.hint}
                </span>
              )}
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value.replace(/\D/g, "") }))
                }
                placeholder="0"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-[16px] tabular-nums outline-none transition-shadow focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
              />
            </label>
          ))}
        </div>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-neutral-600">
            Anything worth flagging (optional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[14px] outline-none transition-colors focus:border-neutral-900"
          />
        </label>
        <button
          disabled={busy}
          className="w-full rounded-lg bg-neutral-900 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-neutral-800 active:bg-neutral-950 disabled:opacity-50"
        >
          {busy ? "Saving…" : home.filedToday ? "Update today's numbers" : "Submit EOD"}
        </button>
        {saved && (
          <p className="text-center text-[13px] text-green-700">Saved ✓</p>
        )}
        {error && (
          <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </p>
        )}
      </form>
      </div>
    </div>
  );
}
