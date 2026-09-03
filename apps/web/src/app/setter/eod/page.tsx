"use client";

// The EOD form — the tab a setter opens every evening. Same fields as the
// old tokenized form plus Zion's additions; resubmitting replaces that
// day's numbers.
//
// Files for TODAY by default. The day picker exists because definitions
// change and forms grow ("calls closed" was redefined, "cash collected"
// was added) and the honest response is to let setters go back and fix the
// last couple of weeks themselves rather than leaving history on the old
// meaning. The server decides which days are allowed — the picker only
// shows what it was given.

import React, { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSetter } from "../_components/SetterContext";

const FIELDS: Array<{ key: string; label: string; hint?: string }> = [
  { key: "dials", label: "Dials", hint: "phone call attempts that day — every attempt counts, incl. no-answers" },
  { key: "pickUps", label: "Pick ups", hint: "dials where a human answered and you spoke" },
  { key: "sets", label: "Sets", hint: "new sales calls you booked that day — prospect committed, time locked in" },
  { key: "newLeadsHit", label: "New leads hit", hint: "brand-new leads you contacted for the first time that day" },
  { key: "followUps", label: "Follow ups", hint: "existing leads you re-contacted that day" },
  { key: "callsOnCalendar", label: "Calls on the calendar", hint: "first consults from YOUR sets that were scheduled for that day" },
  { key: "callsShown", label: "Calls shown", hint: "of those, how many showed — follow-ups / second calls don't count" },
  { key: "callsClosed", label: "Calls closed", hint: "deals from YOUR sets that closed that day — follow-up closes count" },
  { key: "cashCollected", label: "Cash collected ($)", hint: "cash collected that day from your sets' deals — later payments count" },
];

type Entry = NonNullable<ReturnType<typeof useSetter>["home"]["todayEntry"]>;

/** "Tue 2 Sep" from a YYYY-MM-DD key — no timezone games, the key IS the day. */
function humanDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function valuesFrom(e: Entry | null): Record<string, string> {
  if (!e) return {};
  return {
    dials: String(e.dials),
    pickUps: String(e.pickUps),
    sets: String(e.sets),
    newLeadsHit: String(e.newLeadsHit),
    followUps: String(e.followUps),
    callsOnCalendar: e.callsOnCalendar != null ? String(e.callsOnCalendar) : "",
    callsShown: e.callsShown != null ? String(e.callsShown) : "",
    callsClosed: e.callsClosed != null ? String(e.callsClosed) : "",
    cashCollected: e.cashCollected != null ? String(e.cashCollected) : "",
  };
}

export default function SetterEodPage() {
  const { sessionToken, home } = useSetter();
  const submit = useMutation(api.setterApp.submitEod);

  const [dayKey, setDayKey] = useState(home.today);
  const isToday = dayKey === home.today;
  // Past days load on demand; today rides the home query it always has.
  const past = useQuery(
    api.setterApp.getEodForDay,
    isToday ? "skip" : { sessionToken, dayKey },
  );
  const entry: Entry | null = isToday ? home.todayEntry : (past?.entry ?? null);
  const dayLoading = !isToday && past === undefined;
  const dayAllowed = isToday || past?.allowed !== false;

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
    setValues(valuesFrom(entry));
    setNote(entry?.note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, dayLoading, entry?.submittedAt]);
  // Feedback belongs to the day it was about. Changing day clears it; the
  // reseed that follows our OWN save (new submittedAt) must not — that was
  // wiping "Saved ✓" the instant it appeared.
  useEffect(() => {
    setError(null);
    setSaved(null);
  }, [dayKey]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    const n = (k: string) => {
      const raw = (values[k] ?? "").trim();
      return raw === "" ? 0 : Number(raw);
    };
    const opt = (k: string) => {
      const raw = (values[k] ?? "").trim();
      return raw === "" ? undefined : Number(raw);
    };
    try {
      const res = await submit({
        sessionToken,
        dayKey,
        dials: n("dials"),
        pickUps: n("pickUps"),
        sets: n("sets"),
        newLeadsHit: n("newLeadsHit"),
        followUps: n("followUps"),
        callsOnCalendar: opt("callsOnCalendar"),
        callsShown: opt("callsShown"),
        callsClosed: opt("callsClosed"),
        cashCollected: opt("cashCollected"),
        note: note.trim() || undefined,
      });
      setSaved(res.dayKey);
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

  const label = humanDay(dayKey);
  const dayOption = (d: { dayKey: string; filed: boolean }, i: number) => {
    const when = i === 0 ? "Today" : i === 1 ? "Yesterday" : humanDay(d.dayKey);
    const date = i <= 1 ? ` · ${humanDay(d.dayKey)}` : "";
    return `${when}${date}${d.filed ? "  ✓ filed" : ""}`;
  };

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
            home.filedToday ? (
              <>Filed today ✓ — edit anything and resubmit.</>
            ) : (
              <>Today, {label}. Fill it in before you sign off.</>
            )
          ) : entry ? (
            <>Filed for {label} ✓ — edit anything and resubmit. This updates that day on the scorecard.</>
          ) : (
            <>Filing for {label}. Nothing on record yet — leave a box blank if you&apos;re not reporting it.</>
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
                disabled={dayLoading || !dayAllowed}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value.replace(/\D/g, "") }))
                }
                placeholder="0"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-[16px] tabular-nums outline-none transition-shadow focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:bg-neutral-50 disabled:text-neutral-400"
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
            disabled={dayLoading || !dayAllowed}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[14px] outline-none transition-colors focus:border-neutral-900 disabled:bg-neutral-50"
          />
        </label>
        <button
          disabled={busy || dayLoading || !dayAllowed}
          className="w-full rounded-lg bg-neutral-900 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-neutral-800 active:bg-neutral-950 disabled:opacity-50"
        >
          {busy
            ? "Saving…"
            : isToday
              ? home.filedToday
                ? "Update today's numbers"
                : "Submit EOD"
              : entry
                ? `Update ${label}`
                : `Submit for ${label}`}
        </button>
        {saved && (
          <p className="text-center text-[13px] text-green-700">
            Saved for {humanDay(saved)} ✓
          </p>
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
