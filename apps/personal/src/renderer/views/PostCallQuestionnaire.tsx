import React, { useState } from 'react';
import type { CloserInfo } from '../convex';
import { completeCallWithOutcome } from '../convex';
import logoImage from '../../assets/logo.png';

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

  const isValid = (() => {
    const hasName = prospectName.trim().length > 0;
    if (!hasName || !outcome) return false;

    switch (outcome) {
      case 'closed':
        return (parseInt(cashCollected) || 0) > 0 &&
               (parseInt(contractValue) || 0) > 0 &&
               leadQualityScore !== null &&
               prospectWasDecisionMaker !== null &&
               objectionsOvercome !== null;
      case 'lost':
      case 'follow_up':
        return (parseInt(pitchedValue) || 0) > 0 &&
               primaryObjection !== null &&
               leadQualityScore !== null &&
               prospectWasDecisionMaker !== null;
      case 'no_show':
        return true;
      default:
        return false;
    }
  })();

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
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900">
      {/* Compact header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200/60 dark:border-zinc-700 shrink-0">
        <img src={logoImage} alt="" className="h-7" />
        <div>
          <h2 className="text-[14px] font-semibold text-black dark:text-white">Post-Call Summary</h2>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400">Complete the questionnaire to log this call</p>
        </div>
      </div>

      {/* Form content — two compact rows */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Row 1: Name + Outcome + Objection */}
        <div className="flex items-start gap-3">
          {/* Prospect name */}
          <div className="w-[180px] shrink-0">
            <label className="block text-[10px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Prospect</label>
            <input
              value={prospectName}
              onChange={(e) => setProspectName(e.target.value)}
              placeholder="Name..."
              className="w-full px-2.5 py-2 text-[13px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400"
            />
          </div>

          {/* Divider */}
          <div className="w-px h-[52px] bg-gray-200 dark:bg-zinc-700 self-end mb-0" />

          {/* Outcome buttons */}
          <div className="flex-1">
            <label className="block text-[10px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Outcome</label>
            <div className="flex gap-1.5">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  onClick={() => {
                    setOutcome(o.value);
                    setPrimaryObjection(null);
                    setObjectionsOvercome(null);
                  }}
                  className={`flex-1 py-2 text-[12px] font-semibold rounded-lg transition-colors ${
                    outcome === o.value
                      ? `${o.color} text-white`
                      : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Objection dropdown — conditional */}
          {showObjection && (
            <>
              <div className="w-px h-[52px] bg-gray-200 dark:bg-zinc-700 self-end mb-0" />
              <div className="w-[160px] shrink-0">
                <label className="block text-[10px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Objection</label>
                <select
                  value={primaryObjection || ''}
                  onChange={(e) => setPrimaryObjection(e.target.value || null)}
                  className="w-full px-2 py-2 text-[12px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 appearance-none"
                >
                  <option value="">Select...</option>
                  {OBJECTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {showOvercome && (
            <>
              <div className="w-px h-[52px] bg-gray-200 dark:bg-zinc-700 self-end mb-0" />
              <div className="w-[160px] shrink-0">
                <label className="block text-[10px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Overcome</label>
                <select
                  value={objectionsOvercome || ''}
                  onChange={(e) => setObjectionsOvercome(e.target.value || null)}
                  className="w-full px-2 py-2 text-[12px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 appearance-none"
                >
                  <option value="">Select...</option>
                  {OVERCOME_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {/* Other objection text */}
        {showObjection && primaryObjection === 'other' && (
          <input
            value={primaryObjectionOther}
            onChange={(e) => setPrimaryObjectionOther(e.target.value)}
            placeholder="Describe the objection..."
            className="w-full px-2.5 py-2 text-[12px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400"
          />
        )}
        {showOvercome && objectionsOvercome === 'other' && (
          <input
            value={objectionsOvercomeOther}
            onChange={(e) => setObjectionsOvercomeOther(e.target.value)}
            placeholder="Describe the objection overcome..."
            className="w-full px-2.5 py-2 text-[12px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400"
          />
        )}

        {/* Row 2: Decision maker + Lead quality + Values + Notes */}
        {outcome && outcome !== 'no_show' && (
          <div className="flex items-start gap-3">
            {/* Decision Maker (lost/follow_up only) */}
            {showDecisionMaker && (
              <div className="shrink-0">
                <label className="block text-[10px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Decision Maker?</label>
                <div className="flex gap-1">
                  {[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                    { value: 'unclear', label: '?' },
                  ].map((dm) => (
                    <button
                      key={dm.value}
                      onClick={() => setProspectWasDecisionMaker(dm.value)}
                      className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
                        prospectWasDecisionMaker === dm.value
                          ? 'bg-black dark:bg-white text-white dark:text-black'
                          : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
                      }`}
                    >
                      {dm.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Lead Quality 1-10 */}
            <div className="shrink-0">
              <label className="block text-[10px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Lead Quality</label>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
                  const isSelected = leadQualityScore === n;
                  let bgColor = 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600';
                  if (isSelected) {
                    if (n <= 3) bgColor = 'bg-red-500 text-white';
                    else if (n <= 6) bgColor = 'bg-amber-500 text-white';
                    else bgColor = 'bg-green-500 text-white';
                  }
                  return (
                    <button
                      key={n}
                      onClick={() => setLeadQualityScore(n)}
                      className={`w-[26px] h-[30px] text-[11px] font-medium rounded-md transition-colors ${bgColor}`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="w-px h-[52px] bg-gray-200 dark:bg-zinc-700 self-end mb-0" />

            {/* Cash Collected + Contract Value (closed) */}
            {showClosedValues && (
              <>
                <ValueField
                  label="Cash Collected"
                  value={cashCollected}
                  onChange={setCashCollected}
                  presets={[1000, 3000, 5000, 10000, 15000]}
                />
                <ValueField
                  label="Contract Value"
                  value={contractValue}
                  onChange={setContractValue}
                  presets={[3000, 5000, 10000, 15000, 25000]}
                />
              </>
            )}

            {/* Pitched Value (lost/follow_up) */}
            {showPitchedValue && (
              <ValueField
                label="Pitched Value"
                value={pitchedValue}
                onChange={setPitchedValue}
                presets={[3000, 5000, 10000, 15000, 25000]}
              />
            )}

            <div className="w-px h-[52px] bg-gray-200 dark:bg-zinc-700 self-end mb-0" />

            {/* Notes */}
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[10px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Notes</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Quick notes..."
                className="w-full px-2.5 py-2 text-[12px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400"
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <p className="text-[12px] text-red-600 dark:text-red-400 px-1">{error}</p>
        )}
      </div>

      {/* Submit bar */}
      <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-200/60 dark:border-zinc-700 shrink-0">
        <button
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className={`flex items-center gap-2 px-6 py-2.5 text-[13px] font-semibold rounded-lg transition-colors ${
            isValid && !isSubmitting
              ? 'bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200'
              : 'bg-gray-300 dark:bg-zinc-600 text-white dark:text-zinc-400 cursor-not-allowed'
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
    <div className="shrink-0">
      <label className="block text-[10px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">{label}</label>
      <div className="flex items-center gap-1">
        {presets.map((p) => {
          const display = p >= 1000 ? `$${p / 1000}k` : `$${p}`;
          const isSelected = value === String(p);
          return (
            <button
              key={p}
              onClick={() => onChange(String(p))}
              className={`px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                isSelected
                  ? 'bg-black dark:bg-white text-white dark:text-black'
                  : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
              }`}
            >
              {display}
            </button>
          );
        })}
        <div className="flex items-center gap-0.5 ml-0.5">
          <span className="text-[12px] text-gray-400 dark:text-zinc-500">$</span>
          <input
            value={presets.includes(parseInt(value)) ? '' : value}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Custom"
            className="w-[60px] px-1.5 py-1.5 text-[11px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-md focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500"
          />
        </div>
      </div>
    </div>
  );
}
