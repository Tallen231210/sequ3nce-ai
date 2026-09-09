"use client";

import React, { useState, useEffect } from 'react';
import type { DailyEntryRow } from '@/lib/closer/client';
import { dealValueLabels, getCloserInfo } from "@/lib/closer/session";

/** Team-specific name for the contract-value field (see session.ts). */
const dealLabels = () => dealValueLabels(getCloserInfo());

interface DayField {
  key: string;
  label: string;
  hint: string;
  /** Renders a currency prefix and skips the hint line. */
  money?: boolean;
  /** No measured layer exists for this field — never seed it from `measured`. */
  noMeasured?: boolean;
  /** Seed from `measured` only when it's nonzero (see FU_FIELDS). */
  seedNonzeroOnly?: boolean;
}

export const FIELDS: readonly DayField[] = [
  { key: 'slots', label: 'Slots', hint: 'appointments you could take' },
  { key: 'booked', label: 'Booked', hint: 'appointments on your calendar' },
  { key: 'taken', label: 'Taken', hint: 'calls that actually happened' },
  { key: 'offers', label: 'Offers', hint: 'calls where you presented a price' },
  { key: 'closes', label: 'Closes', hint: 'deals won' },
  { key: 'cash', label: 'Cash collected', money: true, hint: 'money in today' },
  { key: 'contractValue', label: 'Contract value', money: true, hint: 'total deals signed' },
];

export type FieldKey = (typeof FIELDS)[number]['key'];

/** Second section: what the AI can't measure yet. FU fields always show;
 *  tier inputs only when the team has tier prices configured.
 *
 *  seedNonzeroOnly: a measured ZERO must not pre-fill — submitting the form
 *  would turn our "we saw none" into their reported 0, which then outranks
 *  any follow-up we measure later that day. Empty means "not reporting",
 *  which falls through to the measurement. */
export const FU_FIELDS: readonly DayField[] = [
  { key: 'fuBooked', label: 'Follow-ups booked', hint: 'follow-up calls you scheduled', seedNonzeroOnly: true },
  { key: 'fuShown', label: 'Follow-ups shown', hint: 'follow-ups where they showed', seedNonzeroOnly: true },
];

export function tierFields(tierPrices: number[] | null | undefined): DayField[] {
  if (!tierPrices || tierPrices.length === 0) return [];
  return tierPrices.slice(0, 3).map((price, i) => ({
    key: `tier${i + 1}Pitched`,
    label: `Pitched @ $${price.toLocaleString()}`,
    hint: 'times you pitched this package',
    noMeasured: true,
  }));
}

function allFields(tierPrices: number[] | null | undefined): DayField[] {
  return [...FIELDS, ...FU_FIELDS, ...tierFields(tierPrices)];
}

/**
 * What we pre-filled a box with from our own reading (never from their entry).
 * Used at submit time to tell "left as we filled it" from "typed".
 */
export function measuredSeed(row: DailyEntryRow, f: DayField): string {
  const measured = row.measured[f.key] ?? 0;
  return !f.noMeasured &&
    row.measuredExists &&
    (!f.seedNonzeroOnly || measured > 0)
    ? String(measured)
    : '';
}

/** What the field should show: their entry if they made one, else our reading. */
export function initialValues(
  row: DailyEntryRow,
  tierPrices?: number[] | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of allFields(tierPrices)) {
    const reported = row.reported?.[f.key];
    if (typeof reported === 'number') {
      out[f.key] = String(reported);
      continue;
    }
    // Only pre-fill from a reading we actually took. Seeding zeros on a day
    // the bot never joined would turn our blank into their reported number
    // the moment they hit submit.
    const measured = row.measured[f.key] ?? 0;
    out[f.key] =
      !f.noMeasured &&
      row.measuredExists &&
      (!f.seedNonzeroOnly || measured > 0)
        ? String(measured)
        : '';
  }
  return out;
}

/**
 * One day's numbers.
 *
 * Pre-filled from what the meeting bot recorded, so a normal day is a glance
 * and a tap. Nothing here reaches a manager's board until it's submitted —
 * an untouched day counts for nothing, which is what makes submitting matter.
 */
export function PerformanceDayForm({
  row,
  saving,
  error,
  onSubmit,
  compact,
  tierPrices,
  unconfirmedCalls,
}: {
  row: DailyEntryRow;
  saving: boolean;
  error: string | null;
  onSubmit: (values: Record<string, number | null>) => void;
  compact?: boolean;
  tierPrices?: number[] | null;
  /** Calls listed above that nobody has confirmed yet — a nudge, not a gate. */
  unconfirmedCalls?: number;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialValues(row, tierPrices),
  );

  // Re-seed when the day changes, a save lands, or the MEASUREMENT moves
  // (a confirm-strip edit or manual call recounts ~5s later — without this
  // the stale prefill gets submitted and outranks the corrected measurement).
  // Trade-off, deliberate: a recount landing mid-typing resets an unsubmitted
  // draft. Accuracy of what gets submitted wins over draft preservation.
  useEffect(() => {
    setValues(initialValues(row, tierPrices));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.dayKey, row.confirmedAt, JSON.stringify(row.measured)]);

  const submit = () => {
    const out: Record<string, number | null> = {};
    for (const f of allFields(tierPrices)) {
      const raw = (values[f.key] ?? '').trim();
      // Empty means "I'm not reporting this" — clears back to our reading
      // rather than asserting a zero.
      if (raw === '') {
        out[f.key] = null;
        continue;
      }
      // Left exactly as we pre-filled it, and they never typed their own
      // number for it: that is not their figure, it is ours. Save nothing for
      // it, so our reading keeps winning — and a call they fix later flows to
      // the board instead of being outranked by a copy of the old reading.
      const untouched =
        typeof row.reported?.[f.key] !== 'number' && raw === measuredSeed(row, f);
      out[f.key] = untouched ? null : Number(raw.replace(/[$,\s]/g, ''));
    }
    onSubmit(out);
  };

  /**
   * They typed a total, then the calls underneath changed (a fix on the
   * Calls tab, a confirmed row above). Their typed total still wins, so say
   * so and offer the one-click way back to the calls.
   */
  const driftedFields = FIELDS.filter((f) => {
    const typed = row.reported?.[f.key];
    if (typeof typed !== 'number' || !row.measuredExists) return false;
    return typed !== (row.measured[f.key] ?? 0);
  });
  const fmt = (f: DayField, n: number) =>
    f.money ? `$${n.toLocaleString()}` : String(n);

  const submitted = !!row.confirmedAt;

  // A plain render function, NOT a nested component — a component defined in
  // the render body gets a new identity every render, which remounts the
  // input and drops focus mid-typing.
  const renderField = (f: DayField) => {
    const corrected = row.managerCorrected?.[f.key];
    return (
      <div key={f.key}>
        <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
          {f.key === 'contractValue' ? dealLabels().long : f.label}
        </label>
        <div className="relative">
          {f.money && (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-gray-400 font-mono">
              $
            </span>
          )}
          <input
            type="number"
            inputMode="decimal"
            value={values[f.key] ?? ''}
            placeholder="—"
            onChange={(e) =>
              setValues((v) => ({ ...v, [f.key]: e.target.value }))
            }
            className={
              'w-full border border-gray-200 rounded-md py-1.5 text-[14px] font-mono text-black ' +
              'focus:outline-none focus:border-black transition-colors ' +
              (f.money ? 'pl-6 pr-2.5' : 'px-2.5')
            }
          />
        </div>
        {typeof corrected === 'number' && (
          <p className="mt-1 text-[10px] text-amber-600">
            Manager set this to {f.money ? `$${corrected.toLocaleString()}` : corrected}
          </p>
        )}
        {!compact && !f.money && (
          <p className="mt-1 text-[10px] text-gray-400">{f.key === 'contractValue' ? dealLabels().hint : f.hint}</p>
        )}
      </div>
    );
  };

  const extraFields = [...FU_FIELDS, ...tierFields(tierPrices)];

  return (
    <div>
      <div className={compact ? 'grid grid-cols-4 gap-3' : 'grid grid-cols-4 gap-4'}>
        {FIELDS.map(renderField)}
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
          Follow-ups &amp; pitches
        </p>
        <div className={compact ? 'grid grid-cols-4 gap-3' : 'grid grid-cols-4 gap-4'}>
          {extraFields.map(renderField)}
        </div>
      </div>
      {driftedFields.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {driftedFields.map((f) => (
            <p key={f.key} className="flex flex-wrap items-center gap-x-2">
              <span>
                Your {f.key === 'contractValue' ? dealLabels().long.toLowerCase() : f.label.toLowerCase()} total is{' '}
                <span className="font-mono">{fmt(f, row.reported?.[f.key] ?? 0)}</span>; your calls add up to{' '}
                <span className="font-mono">{fmt(f, row.measured[f.key] ?? 0)}</span>.
              </span>
              <button
                type="button"
                disabled={saving}
                onClick={() => onSubmit({ [f.key]: null })}
                className="font-medium underline underline-offset-2 hover:text-amber-950 disabled:opacity-50"
              >
                Use my calls
              </button>
            </p>
          ))}
        </div>
      )}
      {(unconfirmedCalls ?? 0) > 0 && (
        <p className="mt-3 text-[12px] text-gray-600">
          {unconfirmedCalls} recorded {unconfirmedCalls === 1 ? 'call' : 'calls'} above still{' '}
          {unconfirmedCalls === 1 ? 'needs' : 'need'} a look — confirm or fix{' '}
          {unconfirmedCalls === 1 ? 'it' : 'them'} so today&apos;s numbers are right.
        </p>
      )}

      {error && (
        <p className="mt-3 text-[12px] text-red-600">{error}</p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          className="px-4 py-2 bg-black text-white text-[13px] font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : submitted ? 'Update' : 'Submit day'}
        </button>
        {submitted && !saving && (
          <span className="text-[12px] text-gray-500">
            Submitted {new Date(row.confirmedAt as number).toLocaleString(undefined, {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            })}
          </span>
        )}
      </div>
    </div>
  );
}
