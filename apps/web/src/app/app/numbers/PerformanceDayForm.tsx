"use client";

import React, { useState, useEffect } from 'react';
import type { DailyEntryRow } from '@/lib/closer/client';

interface DayField {
  key: string;
  label: string;
  hint: string;
  /** Renders a currency prefix and skips the hint line. */
  money?: boolean;
  /** No measured layer exists for this field — never seed it from `measured`. */
  noMeasured?: boolean;
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
 *  tier inputs only when the team has tier prices configured. */
export const FU_FIELDS: readonly DayField[] = [
  { key: 'fuBooked', label: 'Follow-ups booked', hint: 'follow-up calls you scheduled' },
  { key: 'fuShown', label: 'Follow-ups shown', hint: 'follow-ups where they showed' },
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
    out[f.key] =
      !f.noMeasured && row.measuredExists ? String(row.measured[f.key] ?? 0) : '';
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
}: {
  row: DailyEntryRow;
  saving: boolean;
  error: string | null;
  onSubmit: (values: Record<string, number | null>) => void;
  compact?: boolean;
  tierPrices?: number[] | null;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialValues(row, tierPrices),
  );

  // Re-seed when the day changes or a save lands, so the form reflects what
  // the server now holds rather than a stale draft.
  useEffect(() => {
    setValues(initialValues(row, tierPrices));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.dayKey, row.confirmedAt]);

  const submit = () => {
    const out: Record<string, number | null> = {};
    for (const f of allFields(tierPrices)) {
      const raw = (values[f.key] ?? '').trim();
      // Empty means "I'm not reporting this" — clears back to our reading
      // rather than asserting a zero.
      out[f.key] = raw === '' ? null : Number(raw.replace(/[$,\s]/g, ''));
    }
    onSubmit(out);
  };

  const submitted = !!row.confirmedAt;

  // A plain render function, NOT a nested component — a component defined in
  // the render body gets a new identity every render, which remounts the
  // input and drops focus mid-typing.
  const renderField = (f: DayField) => {
    const corrected = row.managerCorrected?.[f.key];
    return (
      <div key={f.key}>
        <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
          {f.label}
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
          <p className="mt-1 text-[10px] text-gray-400">{f.hint}</p>
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
