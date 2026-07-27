"use client";

import React, { useState } from 'react';
import type { CloserInfo } from '@/lib/closer/client';
import { completeCallWithOutcome } from '@/lib/closer/client';

type CallOutcome = 'closed' | 'follow_up' | 'lost' | 'no_show';

const OUTCOMES: { value: CallOutcome; label: string; color: string; hoverColor: string }[] = [
  { value: 'closed', label: 'Closed', color: 'bg-green-500', hoverColor: 'hover:bg-green-600' },
  { value: 'follow_up', label: 'Follow Up', color: 'bg-amber-500', hoverColor: 'hover:bg-amber-600' },
  { value: 'lost', label: 'Lost', color: 'bg-red-500', hoverColor: 'hover:bg-red-600' },
  { value: 'no_show', label: 'No Show', color: 'bg-gray-500', hoverColor: 'hover:bg-gray-600' },
];

const OBJECTION_OPTIONS = [
  { value: 'spouse_partner', label: 'Spouse/Partner' },
  { value: 'price_money', label: 'Price/Money' },
  { value: 'timing', label: 'Timing' },
  { value: 'need_to_think', label: 'Need to Think' },
  { value: 'not_qualified', label: 'Not Qualified' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'competitor', label: 'Competitor' },
  { value: 'no_show_ghosted', label: 'No Show/Ghosted' },
  { value: 'other', label: 'Other' },
];

const OVERCOME_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'spouse_partner', label: 'Spouse/Partner' },
  { value: 'price_money', label: 'Price/Money' },
  { value: 'timing', label: 'Timing' },
  { value: 'need_to_think', label: 'Need to Think' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'other', label: 'Other' },
];

interface PostCallQuestionnaireProps {
  closerInfo: CloserInfo;
  callId: string;
  initialProspectName?: string;
  onComplete: () => void;
}

export function PostCallQuestionnaire({
  closerInfo,
  callId,
  initialProspectName,
  onComplete,
}: PostCallQuestionnaireProps) {
  const [prospectName, setProspectName] = useState(initialProspectName || '');
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [primaryObjection, setPrimaryObjection] = useState<string | null>(null);
  const [primaryObjectionOther, setPrimaryObjectionOther] = useState('');
  const [objectionsOvercome, setObjectionsOvercome] = useState<string | null>(null);
  const [objectionsOvercomeOther, setObjectionsOvercomeOther] = useState('');
  const [leadQualityScore, setLeadQualityScore] = useState<number | null>(null);
  const [prospectWasDecisionMaker, setProspectWasDecisionMaker] = useState<string | null>(null);
  const [cashCollected, setCashCollected] = useState('');
  const [contractValue, setContractValue] = useState('');
  const [pitchedValue, setPitchedValue] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * What's still missing, in words.
   *
   * The button used to sit greyed out with nothing explaining why, and the
   * two fields most often forgotten — decision maker and objections — are
   * below the fold on a small screen. Someone fills in the obvious things,
   * finds Save still dead, and has no way to know what it wants. Naming the
   * gaps costs one line and removes the guessing.
   */
  const missing = (() => {
    const gaps: string[] = [];
    if (!prospectName.trim()) gaps.push('a prospect name');
    if (!outcome) return ['an outcome'];

    if (outcome === 'closed') {
      if (!((parseInt(cashCollected) || 0) > 0)) gaps.push('cash collected');
      if (!((parseInt(contractValue) || 0) > 0)) gaps.push('contract value');
      if (leadQualityScore === null) gaps.push('lead quality');
      if (prospectWasDecisionMaker === null) gaps.push('decision maker');
      if (objectionsOvercome === null) gaps.push('objections overcome');
    } else if (outcome === 'lost' || outcome === 'follow_up') {
      if (!((parseInt(pitchedValue) || 0) > 0)) gaps.push('pitched value');
      if (primaryObjection === null) gaps.push('the objection');
      if (leadQualityScore === null) gaps.push('lead quality');
      if (prospectWasDecisionMaker === null) gaps.push('decision maker');
    }
    return gaps;
  })();

  const isValid = missing.length === 0 && !!outcome;

  async function handleSubmit() {
    if (!isValid || !outcome) return;
    setIsSubmitting(true);
    setError(null);

    const data: Parameters<typeof completeCallWithOutcome>[0] = {
      callId,
      prospectName: prospectName.trim(),
      outcome,
      notes: notes.trim() || undefined,
      leadQualityScore: leadQualityScore ?? undefined,
      prospectWasDecisionMaker: prospectWasDecisionMaker ?? undefined,
    };

    if (outcome === 'closed') {
      data.cashCollected = parseInt(cashCollected) || 0;
      data.contractValue = parseInt(contractValue) || 0;
      data.objectionsOvercome = objectionsOvercome ?? undefined;
      data.objectionsOvercomeOther = objectionsOvercome === 'other' ? objectionsOvercomeOther.trim() || undefined : undefined;
    } else if (outcome === 'lost' || outcome === 'follow_up') {
      data.dealValue = parseInt(pitchedValue) || 0;
      data.primaryObjection = primaryObjection === 'other' ? primaryObjectionOther : (primaryObjection ?? undefined);
      data.primaryObjectionOther = primaryObjection === 'other' ? primaryObjectionOther : undefined;
    }

    const result = await completeCallWithOutcome(data);
    setIsSubmitting(false);

    if (result.success) {
      onComplete();
    } else {
      setError(result.error || 'Failed to save. Please try again.');
    }
  }

  const showObjection = outcome === 'lost' || outcome === 'follow_up';
  const showOvercome = outcome === 'closed';
  const showClosedValues = outcome === 'closed';
  const showPitchedValue = outcome === 'lost' || outcome === 'follow_up';
  const showDecisionMaker = outcome === 'closed' || outcome === 'lost' || outcome === 'follow_up';

  return (
    // min-h-0 and flex-1 together, not h-full.
    //
    // h-full only resolves against a parent with a definite height. Both
    // modals that host this are flex columns capped with max-h, so the form
    // simply grew to its natural height, pushed Notes and the Save button
    // past the bottom edge, and the parent's overflow-hidden clipped them —
    // leaving a form that couldn't be submitted or scrolled. flex-1 makes it
    // take the space available and min-h-0 lets it shrink below its content,
    // which is what finally lets the inner overflow-y-auto do its job.
    <div className="flex flex-col min-h-0 flex-1 bg-white">
      {/* On desktop this was its own window, so it carried the logo. Inside the
          web app that's just chrome repeated — the app frame is already there. */}
      <div className="px-5 py-3 border-b border-gray-200/60 shrink-0">
        <h2 className="text-[14px] font-semibold text-black">Post-Call Summary</h2>
        <p className="text-[11px] text-gray-500">Complete the questionnaire to log this call</p>
      </div>

      {/* A vertical form, not a horizontal strip.
          
          This was laid out for the desktop app, where it was its own wide,
          short window — two rows of fixed-width blocks separated by vertical
          rules. Dropped into a modal, the right-hand half simply fell off the
          edge and you had to scroll sideways to reach Cash Collected, which is
          the one field the whole product depends on.
          
          Everything is full width and stacked now, so the only scrolling is
          up and down and nothing can be hidden off-screen at any width. */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Prospect */}
        <Field label="Prospect">
          <input
            value={prospectName}
            onChange={(e) => setProspectName(e.target.value)}
            placeholder="Name..."
            className="w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
          />
        </Field>

        {/* Outcome — two up on narrow screens, four across when there's room */}
        <Field label="Outcome">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {OUTCOMES.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  setOutcome(o.value);
                  setPrimaryObjection(null);
                  setObjectionsOvercome(null);
                }}
                className={`py-2.5 text-[12.5px] font-semibold rounded-lg transition-colors ${
                  outcome === o.value
                    ? `${o.color} text-white`
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>

        {showObjection && (
          <Field label="Objection">
            <select
              value={primaryObjection || ''}
              onChange={(e) => setPrimaryObjection(e.target.value || null)}
              className="w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
            >
              <option value="">Select...</option>
              {OBJECTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {primaryObjection === 'other' && (
              <input
                value={primaryObjectionOther}
                onChange={(e) => setPrimaryObjectionOther(e.target.value)}
                placeholder="Describe the objection..."
                className="mt-2 w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
              />
            )}
          </Field>
        )}

        {showOvercome && (
          <Field label="Objections overcome">
            <select
              value={objectionsOvercome || ''}
              onChange={(e) => setObjectionsOvercome(e.target.value || null)}
              className="w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
            >
              <option value="">Select...</option>
              {OVERCOME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {objectionsOvercome === 'other' && (
              <input
                value={objectionsOvercomeOther}
                onChange={(e) => setObjectionsOvercomeOther(e.target.value)}
                placeholder="Describe the objection overcome..."
                className="mt-2 w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
              />
            )}
          </Field>
        )}

        {outcome && outcome !== 'no_show' && (
          <>
            {showDecisionMaker && (
              <Field label="Was the prospect the decision maker?">
                <div className="flex gap-2">
                  {[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                    { value: 'unclear', label: 'Not sure' },
                  ].map((dm) => (
                    <button
                      key={dm.value}
                      onClick={() => setProspectWasDecisionMaker(dm.value)}
                      className={`flex-1 py-2 text-[12.5px] font-medium rounded-lg transition-colors ${
                        prospectWasDecisionMaker === dm.value
                          ? 'bg-black text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {dm.label}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {/* Ten buttons that wrap rather than run off the edge. */}
            <Field label="Lead quality">
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
                  const isSelected = leadQualityScore === n;
                  let bgColor = 'bg-gray-100 text-gray-600 hover:bg-gray-200';
                  if (isSelected) {
                    if (n <= 3) bgColor = 'bg-red-500 text-white';
                    else if (n <= 6) bgColor = 'bg-amber-500 text-white';
                    else bgColor = 'bg-green-500 text-white';
                  }
                  return (
                    <button
                      key={n}
                      onClick={() => setLeadQualityScore(n)}
                      className={`w-9 h-9 text-[12px] font-medium rounded-lg transition-colors ${bgColor}`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </Field>

            {showClosedValues && (
              <>
                <ValueField
                  label="Cash collected"
                  value={cashCollected}
                  onChange={setCashCollected}
                  presets={[1000, 3000, 5000, 10000, 15000]}
                />
                <ValueField
                  label="Contract value"
                  value={contractValue}
                  onChange={setContractValue}
                  presets={[3000, 5000, 10000, 15000, 25000]}
                />
              </>
            )}

            {showPitchedValue && (
              <ValueField
                label="Pitched value"
                value={pitchedValue}
                onChange={setPitchedValue}
                presets={[3000, 5000, 10000, 15000, 25000]}
              />
            )}

            <Field label="Notes">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Quick notes..."
                className="w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
              />
            </Field>
          </>
        )}

        {error && <p className="text-[12px] text-red-600">{error}</p>}
      </div>

      {/* Submit bar */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-200/60 shrink-0">
        <p className="text-[11.5px] text-gray-500 min-w-0">
          {outcome && missing.length > 0 ? `Still needed: ${missing.join(', ')}` : ''}
        </p>
        <button
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className={`flex items-center gap-2 px-6 py-2.5 text-[13px] font-semibold rounded-lg transition-colors ${
            isValid && !isSubmitting
              ? 'bg-black text-white hover:bg-gray-800:bg-zinc-200'
              : 'bg-gray-300 text-white cursor-not-allowed'
          }`}
        >
          {isSubmitting ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            'Save & Close'
          )}
        </button>
      </div>
    </div>
  );
}

// Reusable dollar value field with preset buttons
function ValueField({
  label,
  value,
  onChange,
  presets,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  presets: number[];
}) {
  return (
    <Field label={label}>
      {/* Wraps. Five presets plus a custom box does not fit on one line in a
          modal, and the custom box was the part that fell off. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((p) => {
          const display = p >= 1000 ? `$${p / 1000}k` : `$${p}`;
          const isSelected = value === String(p);
          return (
            <button
              key={p}
              onClick={() => onChange(String(p))}
              className={`px-3 py-2 text-[12.5px] font-medium rounded-lg transition-colors ${
                isSelected
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200:bg-zinc-600'
              }`}
            >
              {display}
            </button>
          );
        })}
        <div className="flex items-center gap-1">
          <span className="text-[13px] text-gray-400">$</span>
          <input
            value={presets.includes(parseInt(value)) ? '' : value}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Custom"
            className="w-[90px] px-2 py-2 text-[12.5px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 text-gray-900 placeholder-gray-400"
          />
        </div>
      </div>
    </Field>
  );
}

/** One labelled block. Every field in the form is one of these. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
