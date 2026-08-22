import React, { useState, useEffect, useCallback } from 'react';
import type { CloserInfo } from '../convex';
import {
  completeCallWithOutcome,
  getCallDisposition,
  getMoneyBellsOptInStatus,
  hasBroadcastForCall,
} from '../convex';
import { BroadcastCelebrationModal } from './community/moneyBells/BroadcastCelebrationModal';
import logoImage from '../../assets/logo.png';

// In-app post-call form. Replaces the old floating post-call BrowserWindow —
// frameless always-on-top windows were the app's top per-device bug source.
// Renders as a bottom sheet inside the main window and prefills from the AI
// disposition the backend already extracted, so the closer confirms numbers
// instead of typing them from scratch. Confirming writes outcomeSource
// "closer", which is what makes a closed deal eligible for Money Bells.

type CallOutcome = 'closed' | 'follow_up' | 'lost' | 'no_show';

const OUTCOMES: { value: CallOutcome; label: string; color: string }[] = [
  { value: 'closed', label: 'Closed', color: 'bg-green-500' },
  { value: 'follow_up', label: 'Follow Up', color: 'bg-amber-500' },
  { value: 'lost', label: 'Lost', color: 'bg-red-500' },
  { value: 'no_show', label: 'No Show', color: 'bg-gray-500' },
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

const DRAFT_KEY = 'post-call-form';

interface PostCallFormViewProps {
  callId: string;
  prospectName?: string;
  closerInfo: CloserInfo;
  /** submitted=true means the outcome was saved (badge counts should refresh). */
  onClose: (submitted: boolean) => void;
}

// The AI writes free-form-ish values; the form's dropdowns have fixed option
// sets. A value the dropdown doesn't know folds into "other" + text so the
// prefill never silently drops what the AI found.
function mapToOptions(
  value: string | null,
  options: { value: string }[]
): { selected: string | null; otherText: string } {
  if (!value) return { selected: null, otherText: '' };
  if (options.some((o) => o.value === value)) return { selected: value, otherText: '' };
  return { selected: 'other', otherText: value };
}

function mapDecisionMaker(value: string | boolean | null): string | null {
  if (value === true || value === 'yes' || value === 'true') return 'yes';
  if (value === false || value === 'no' || value === 'false') return 'no';
  if (value === 'unclear') return 'unclear';
  return null;
}

export function PostCallFormView({ callId, prospectName: initialProspectName, closerInfo, onClose }: PostCallFormViewProps) {
  const [mounted, setMounted] = useState(false);

  // Restore a draft only if it belongs to this call
  const [savedForm] = useState(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.callId === callId ? parsed : null;
    } catch { return null; }
  });

  // Form state
  const [prospectName, setProspectName] = useState(savedForm?.prospectName ?? initialProspectName ?? '');
  const [outcome, setOutcome] = useState<CallOutcome | null>(savedForm?.outcome ?? null);
  const [primaryObjection, setPrimaryObjection] = useState<string | null>(savedForm?.primaryObjection ?? null);
  const [primaryObjectionOther, setPrimaryObjectionOther] = useState(savedForm?.primaryObjectionOther ?? '');
  const [objectionsOvercome, setObjectionsOvercome] = useState<string | null>(savedForm?.objectionsOvercome ?? null);
  const [objectionsOvercomeOther, setObjectionsOvercomeOther] = useState(savedForm?.objectionsOvercomeOther ?? '');
  const [leadQualityScore, setLeadQualityScore] = useState<number | null>(savedForm?.leadQualityScore ?? null);
  const [prospectWasDecisionMaker, setProspectWasDecisionMaker] = useState<string | null>(savedForm?.prospectWasDecisionMaker ?? null);
  const [cashCollected, setCashCollected] = useState(savedForm?.cashCollected ?? '');
  const [contractValue, setContractValue] = useState(savedForm?.contractValue ?? '');
  const [pitchedValue, setPitchedValue] = useState(savedForm?.pitchedValue ?? '');
  const [notes, setNotes] = useState(savedForm?.notes ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broadcastModalCash, setBroadcastModalCash] = useState<number | null>(null);
  const [aiPrefilled, setAiPrefilled] = useState(false);

  // AI prefill — a draft in progress always beats the AI values.
  useEffect(() => {
    if (savedForm) return;
    let cancelled = false;
    getCallDisposition(callId, closerInfo.closerId).then((d) => {
      if (cancelled || !d) return;
      let applied = false;
      if (d.outcome && ['closed', 'follow_up', 'lost', 'no_show'].includes(d.outcome)) {
        setOutcome(d.outcome as CallOutcome);
        applied = true;
      }
      if (d.prospectName) setProspectName((prev: string) => prev || d.prospectName!);
      if (d.cashCollected != null && d.cashCollected > 0) { setCashCollected(String(d.cashCollected)); applied = true; }
      if (d.contractValue != null && d.contractValue > 0) { setContractValue(String(d.contractValue)); applied = true; }
      if (d.pitchedValue != null && d.pitchedValue > 0) { setPitchedValue(String(d.pitchedValue)); applied = true; }
      const obj = mapToOptions(d.primaryObjection, OBJECTION_OPTIONS);
      if (obj.selected) { setPrimaryObjection(obj.selected); setPrimaryObjectionOther(obj.otherText); applied = true; }
      const overcome = mapToOptions(d.objectionsOvercome, OVERCOME_OPTIONS);
      if (overcome.selected) { setObjectionsOvercome(overcome.selected); setObjectionsOvercomeOther(overcome.otherText); applied = true; }
      if (d.leadQualityScore != null && d.leadQualityScore >= 1 && d.leadQualityScore <= 10) {
        setLeadQualityScore(Math.round(d.leadQualityScore));
        applied = true;
      }
      const dm = mapDecisionMaker(d.prospectWasDecisionMaker);
      if (dm) { setProspectWasDecisionMaker(dm); applied = true; }
      if (applied && d.outcomeSource === 'ai') setAiPrefilled(true);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, closerInfo.closerId]);

  // Persist draft (survives tab switches and reloads)
  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      callId,
      prospectName, outcome, primaryObjection, primaryObjectionOther,
      objectionsOvercome, objectionsOvercomeOther, leadQualityScore,
      prospectWasDecisionMaker, cashCollected, contractValue, pitchedValue, notes,
    }));
  }, [callId, prospectName, outcome, primaryObjection, primaryObjectionOther,
      objectionsOvercome, objectionsOvercomeOther, leadQualityScore,
      prospectWasDecisionMaker, cashCollected, contractValue, pitchedValue, notes]);

  // Slide-up animation
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const isValid = useCallback(() => {
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
  }, [prospectName, outcome, cashCollected, contractValue, leadQualityScore, prospectWasDecisionMaker, objectionsOvercome, pitchedValue, primaryObjection]);

  function closeForm(submitted: boolean) {
    if (submitted) sessionStorage.removeItem(DRAFT_KEY);
    onClose(submitted);
  }

  async function handleSubmit() {
    if (!isValid() || !outcome) return;
    setIsSubmitting(true);
    setError(null);

    try {
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
        data.contractValue = parseInt(pitchedValue) || 0;
        data.primaryObjection = primaryObjection === 'other' ? primaryObjectionOther : (primaryObjection ?? undefined);
        data.primaryObjectionOther = primaryObjection === 'other' ? primaryObjectionOther : undefined;
      }

      const result = await completeCallWithOutcome(data);

      if (!result.success) {
        setError(result.error || 'Failed to save. Please try again.');
        return;
      }

      // Money Bells trigger — isolated from the save flow. If any step throws or
      // returns an error, we fall through to the normal close path without surfacing
      // an error (the call itself was saved successfully).
      let shouldShowModal = false;
      if (outcome === 'closed') {
        const cash = parseInt(cashCollected) || 0;
        if (cash > 0 && !closerInfo.b2cUserId) {
          console.warn('[PostCallForm] Closed deal but b2cUserId missing on session — Money Bells skipped.');
        } else if (cash > 0 && closerInfo.b2cUserId) {
          try {
            const [optIn, broadcastCheck] = await Promise.all([
              getMoneyBellsOptInStatus(closerInfo.b2cUserId),
              hasBroadcastForCall(callId),
            ]);
            const alreadyBroadcast = 'hasBroadcast' in broadcastCheck && broadcastCheck.hasBroadcast;
            const isOptedIn = 'optedIn' in optIn && optIn.optedIn;
            if (isOptedIn && !alreadyBroadcast) {
              shouldShowModal = true;
              setBroadcastModalCash(cash);
            }
          } catch (mbErr) {
            console.warn('[PostCallForm] Money Bells check failed, skipping modal:', mbErr);
          }
        }
      }

      if (shouldShowModal) {
        // The modal's onClose finishes the flow.
        return;
      }

      closeForm(true);
    } catch {
      // Only reached when completeCallWithOutcome itself threw — the MB block has its own try/catch.
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const showObjection = outcome === 'lost' || outcome === 'follow_up';
  const showOvercome = outcome === 'closed';
  const showClosedValues = outcome === 'closed';
  const showPitchedValue = outcome === 'lost' || outcome === 'follow_up';
  const showDecisionMaker = outcome === 'closed' || outcome === 'lost' || outcome === 'follow_up';

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop — click dismisses; the unfinished call stays in the pending queue */}
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => closeForm(false)}
      />

      {/* Bottom sheet */}
      <div
        className={`relative mx-auto w-full max-w-[1100px] bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl flex flex-col max-h-[80%] transition-transform duration-500 ${
          mounted ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-zinc-600" />
        </div>

        {/* Compact header */}
        <div className="flex items-center gap-3 px-5 py-1.5 border-b border-gray-200/60 dark:border-zinc-700 shrink-0">
          <img src={logoImage} alt="Sequ3nce" className="h-[24px] dark-invert" />
          <div className="w-px h-5 bg-gray-200 dark:bg-zinc-700" />
          <div className="flex-1 min-w-0">
            <h2 className="text-[13px] font-semibold text-black dark:text-white leading-tight">Post-Call Summary</h2>
            <p className="text-[10px] text-gray-500 dark:text-zinc-400">Complete the questionnaire to log this call</p>
          </div>
          <button
            onClick={() => closeForm(false)}
            className="flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            title="Close — you can fill this out later from the Calls tab"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* AI prefill notice */}
        {aiPrefilled && (
          <div className="flex items-center gap-2 mx-4 mt-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg shrink-0">
            <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M11.3 1.046a1 1 0 01.7.954v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
            </svg>
            <span className="text-[12px] text-blue-800 dark:text-blue-300">
              Pre-filled from the call recording — check the numbers and confirm.
            </span>
          </div>
        )}

        {/* Form content */}
        <div className="flex-1 overflow-y-auto px-4 py-2.5 space-y-2.5">
          {/* Row 1: Name + Outcome + Objection */}
          <div className="flex items-start gap-3">
            {/* Prospect name */}
            <div className="w-[180px] shrink-0">
              <label className="block text-[10px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Prospect</label>
              <input
                value={prospectName}
                onChange={(e) => setProspectName(e.target.value)}
                placeholder="Name..."
                className="w-full px-2.5 py-2 text-[13px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 text-black dark:text-white"
              />
            </div>

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
                    className="w-full px-2 py-2 text-[12px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 appearance-none text-black dark:text-white"
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
                    className="w-full px-2 py-2 text-[12px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 appearance-none text-black dark:text-white"
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
              className="w-full px-2.5 py-2 text-[12px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 text-black dark:text-white"
            />
          )}
          {showOvercome && objectionsOvercome === 'other' && (
            <input
              value={objectionsOvercomeOther}
              onChange={(e) => setObjectionsOvercomeOther(e.target.value)}
              placeholder="Describe the objection overcome..."
              className="w-full px-2.5 py-2 text-[12px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 text-black dark:text-white"
            />
          )}

          {/* Row 2: Decision maker + Lead quality + Values + Notes */}
          {outcome && outcome !== 'no_show' && (
            <div className="flex items-start gap-2.5 flex-wrap">
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

              {showClosedValues && (
                <>
                  <ValueField label="Cash Collected" value={cashCollected} onChange={setCashCollected} presets={[1000, 3000, 5000, 10000, 15000]} />
                  <ValueField label="Contract Value" value={contractValue} onChange={setContractValue} presets={[3000, 5000, 10000, 15000, 25000]} />
                </>
              )}

              {showPitchedValue && (
                <ValueField label="Pitched Value" value={pitchedValue} onChange={setPitchedValue} presets={[3000, 5000, 10000, 15000, 25000]} />
              )}

              <div className="w-px h-[52px] bg-gray-200 dark:bg-zinc-700 self-end mb-0" />

              {/* Notes */}
              <div className="flex-1 min-w-[120px]">
                <label className="block text-[10px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Notes</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Quick notes..."
                  className="w-full px-2.5 py-2 text-[12px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 text-black dark:text-white"
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
        <div className="flex items-center justify-end gap-3 px-5 py-2 border-t border-gray-200/60 dark:border-zinc-700 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={!isValid() || isSubmitting}
            className={`flex items-center gap-2 px-6 py-2 text-[13px] font-semibold rounded-lg transition-colors ${
              isValid() && !isSubmitting
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

        {broadcastModalCash !== null && closerInfo.b2cUserId && (
          <BroadcastCelebrationModal
            userId={closerInfo.b2cUserId}
            callId={callId}
            cashCollected={broadcastModalCash}
            prospectName={prospectName.trim() || undefined}
            onClose={() => {
              setBroadcastModalCash(null);
              closeForm(true);
            }}
          />
        )}
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
