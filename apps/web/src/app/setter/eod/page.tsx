"use client";

// The EOD form — the tab a setter opens every evening. The fields come from
// the server (convex/setterEodFields.ts) and depend on the person's role: a
// booking setter files dials and sets; the confirmation setter files what
// she did with the day's self-booked calls, prefilled from the calendar and
// Close. Resubmitting replaces that day's numbers.
//
// Files for TODAY by default. The day picker exists because definitions
// change and forms grow, and the honest response is to let setters go back
// and fix the last couple of weeks themselves. The server decides which days
// are allowed — the picker only shows what it was given.

import React, { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSetter, type EodEntryView, type EodFieldView } from "../_components/SetterContext";
import { MeasuredPrefill, type Drift } from "./MeasuredPrefill";

const CORE = ["dials", "pickUps", "sets", "newLeadsHit", "followUps"] as const;

/** "Tue 2 Sep" from a YYYY-MM-DD key — no timezone games, the key IS the day. */
function humanDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function valuesFrom(e: EodEntryView | null, fields: EodFieldView[]): Record<string, string> {
  if (!e) return {};
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = (e as unknown as Record<string, number | null>)[f.key];
    out[f.key] = v != null ? String(v) : "";
  }
  return out;
}

export default function SetterEodPage() {
  const { sessionToken, home } = useSetter();
  const submit = useMutation(api.setterApp.submitEod);
  const fields = home.eodFields;
  const isConfirmation = home.role === "confirmation";

  const [dayKey, setDayKey] = useState(home.today);
  const isToday = dayKey === home.today;
  // Past days load on demand; today rides the home query it always has.
  const past = useQuery(api.setterApp.getEodForDay, isToday ? "skip" : { sessionToken, dayKey });
  const entry: EodEntryView | null = isToday ? home.todayEntry : (past?.entry ?? null);
  const dayLoading = !isToday && past === undefined;
  const dayAllowed = isToday || past?.allowed !== false;
  // The confirmation setter's measured day — the prefill and the drift check.
  const measured = useQuery(api.setterConfirmationEod.getMeasuredForDay, isConfirmation && dayAllowed ? { sessionToken, dayKey } : "skip");

  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // The queries re-push whenever ANYTHING in their read set changes (the
  // team doc gets patched by unrelated crons). Prefill exactly once per
  // (day, submission) — never off object identity, or a background refresh
  // wipes half-typed numbers. Switching day is a deliberate reseed.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  useEffect(() => {
    if (dayLoading) return;
    const key = `${dayKey}:${entry?.submittedAt ?? "none"}`;
    if (loadedKey === key) return;
    setLoadedKey(key);
    setValues(valuesFrom(entry, fields));
    setNote(entry?.note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, dayLoading, entry?.submittedAt]);
  // Measured prefill: only into boxes that are still empty on a day with no
  // entry, and once per day — a later re-push must not overwrite typing.
  const [measuredSeededFor, setMeasuredSeededFor] = useState<string | null>(null);
  useEffect(() => {
    // Wait for the day's entry to settle first: the entry seed resets the
    // boxes, and a measured seed that lands before it would be wiped and
    // never retried.
    if (dayLoading || !isConfirmation || entry || !measured?.measuredExists || measuredSeededFor === dayKey) return;
    setMeasuredSeededFor(dayKey);
    setValues((v) => {
      const next = { ...v };
      for (const f of fields) {
        const m = (measured.measured as unknown as Record<string, number>)[f.key];
        if (f.measured && (next[f.key] ?? "") === "" && typeof m === "number") next[f.key] = String(m);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmation, dayKey, dayLoading, entry?.submittedAt, measured?.measuredExists]);
  useEffect(() => {
    setError(null);
    setSaved(null);
  }, [dayKey]);

  const drift: Drift[] = !isConfirmation || !measured?.measuredExists
    ? []
    : fields.flatMap((f) => {
        const raw = (values[f.key] ?? "").trim();
        const m = (measured.measured as unknown as Record<string, number>)[f.key];
        if (!f.measured || raw === "" || typeof m !== "number") return [];
        const typed = Number(raw);
        return typed === m ? [] : [{ field: f, typed, measured: m }];
      });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    const num = (k: string) => {
      const raw = (values[k] ?? "").trim();
      return raw === "" ? undefined : Number(raw);
    };
    try {
      const args: Record<string, unknown> = { sessionToken, dayKey, note: note.trim() || undefined };
      for (const k of CORE) args[k] = isConfirmation ? 0 : (num(k) ?? 0);
      for (const f of fields) if (!(CORE as readonly string[]).includes(f.key)) args[f.key] = num(f.key);
      const res = await submit(args as Parameters<typeof submit>[0]);
      setSaved(res.dayKey);
    } catch (err) {
      const data = (err as { data?: unknown })?.data;
      setError(typeof data === "string" && data ? data : "That didn't save — check the numbers and try again.");
    } finally {
      setBusy(false);
    }
  }

  const label = humanDay(dayKey);
  const dayOption = (d: { dayKey: string; filed: boolean }, i: number) => {
    const when = i === 0 ? "Today" : i === 1 ? "Yesterday" : humanDay(d.dayKey);
    const date = i <= 1 ? ` · ${humanDay(d.dayKey)}` : "";
    return `${when}${date}${d.filed ? "  ✓ filed" : ""}`;
  };
  const disabled = dayLoading || !dayAllowed;

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="mb-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-[17px] font-semibold tracking-tight">End of day</h1>
            <label className="shrink-0">
              <span className="sr-only">Day to file for</span>
              <select
                value={dayKey}
                onChange={(e) => setDayKey(e.target.value)}
                disabled={busy}
                className="max-w-[200px] rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-neutral-700 outline-none focus:border-neutral-900"
              >
                {home.recentDays.map((d, i) => (
                  <option key={d.dayKey} value={d.dayKey}>
                    {dayOption(d, i)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-1 text-[13px] text-neutral-500">
            {dayLoading ? (
              <>Loading {label}…</>
            ) : !dayAllowed ? (
              <>That day can&apos;t be filed from here — pick another.</>
            ) : isToday ? (
              home.filedToday ? <>Filed today ✓ — edit anything and resubmit.</> : <>Today, {label}. Fill it in before you sign off.</>
            ) : entry ? (
              <>Filed for {label} ✓ — edit anything and resubmit. This updates that day on the scorecard.</>
            ) : (
              <>Filing for {label}. Nothing on record yet — leave a box blank if you&apos;re not reporting it.</>
            )}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {isConfirmation && measured !== null && (
            <MeasuredPrefill
              loading={dayAllowed && measured === undefined}
              exists={!!measured?.measuredExists}
              linked={measured?.linked ?? true}
              partial={(measured?.truncated.length ?? 0) > 0}
              drift={drift}
              onUse={(key, value) => setValues((v) => ({ ...v, [key]: String(value) }))}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-[12px] font-medium text-neutral-600">
                  {f.label}
                  {f.measured && <span className="ml-1 text-[10px] font-normal text-neutral-400">· prefilled</span>}
                </span>
                {f.hint && <span className="-mt-0.5 mb-1 block text-[10px] leading-tight text-neutral-400">{f.hint}</span>}
                <input
                  inputMode="numeric"
                required={!f.optional}
                  pattern="[0-9]*"
                  value={values[f.key] ?? ""}
                  disabled={disabled}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value.replace(/\D/g, "") }))}
                  placeholder="0"
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-[16px] tabular-nums outline-none transition-shadow focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:bg-neutral-50 disabled:text-neutral-400"
                />
              </label>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-neutral-600">Anything worth flagging (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              disabled={disabled}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[14px] outline-none transition-colors focus:border-neutral-900 disabled:bg-neutral-50"
            />
          </label>
          <button
            disabled={busy || disabled}
            className="w-full rounded-lg bg-neutral-900 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-neutral-800 active:bg-neutral-950 disabled:opacity-50"
          >
            {busy ? "Saving…" : isToday ? (home.filedToday ? "Update today's numbers" : "Submit EOD") : entry ? `Update ${label}` : `Submit for ${label}`}
          </button>
          {saved && <p className="text-center text-[13px] text-green-700">Saved for {humanDay(saved)} ✓</p>}
          {error && <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
        </form>
      </div>
    </div>
  );
}
