import React, { useState, useEffect } from 'react';

export type CallOutcome = 'closed' | 'follow_up' | 'lost' | 'no_show';

interface PostCallQuestionnaireProps {
  callId: string;
  initialProspectName?: string;
  initialNotes?: string;
  onSubmit: (data: {
    prospectName: string;
    outcome: CallOutcome;
    cashCollected?: number;
    contractValue?: number;
    dealValue?: number;
    notes?: string;
    primaryObjection?: string;
    primaryObjectionOther?: string;
    objectionsOvercome?: string;
    objectionsOvercomeOther?: string;
    leadQualityScore?: number;
    prospectWasDecisionMaker?: string;
  }) => void;
  isSubmitting?: boolean;
}

const CASH_COLLECTED_PRESETS = [1000, 3000, 5000, 10000, 15000];
const CONTRACT_VALUE_PRESETS = [3000, 5000, 10000, 15000, 25000];
const PITCHED_VALUE_PRESETS = [3000, 5000, 10000, 15000, 25000];

const OBJECTION_OPTIONS = [
  { value: 'spouse_partner', label: 'Spouse/Partner' },
  { value: 'price_money', label: 'Price/Money' },
  { value: 'timing', label: 'Timing' },
  { value: 'need_to_think', label: 'Need to think about it' },
  { value: 'not_qualified', label: 'Not qualified / Bad lead' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'competitor', label: 'Went with competitor' },
  { value: 'no_show_ghosted', label: 'No-show / Ghosted' },
  { value: 'other', label: 'Other' },
];

const OBJECTIONS_OVERCOME_OPTIONS = [
  { value: 'none', label: 'None - No objections' },
  { value: 'spouse_partner', label: 'Spouse/Partner' },
  { value: 'price_money', label: 'Price/Money' },
  { value: 'timing', label: 'Timing' },
  { value: 'need_to_think', label: 'Need to think about it' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'other', label: 'Other' },
];

export function PostCallQuestionnaire({
  callId,
  initialProspectName = '',
  initialNotes = '',
  onSubmit,
  isSubmitting = false,
}: PostCallQuestionnaireProps) {
  const [prospectName, setProspectName] = useState(initialProspectName);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [cashCollected, setCashCollected] = useState<number | ''>('');
  const [contractValue, setContractValue] = useState<number | ''>('');
  const [pitchedValue, setPitchedValue] = useState<number | ''>('');
  const [notes, setNotes] = useState(initialNotes);

  // Enhanced questionnaire fields
  const [primaryObjection, setPrimaryObjection] = useState<string | null>(null);
  const [primaryObjectionOther, setPrimaryObjectionOther] = useState('');
  const [objectionsOvercome, setObjectionsOvercome] = useState<string | null>(null);
  const [objectionsOvercomeOther, setObjectionsOvercomeOther] = useState('');
  const [leadQualityScore, setLeadQualityScore] = useState<number | null>(null);
  const [prospectWasDecisionMaker, setProspectWasDecisionMaker] = useState<string | null>(null);

  // Animation state
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger slide-up animation on mount
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    });
  }, []);

  // Validation — lead quality + decision maker required for Closed, Lost, Follow Up (not No Show)
  const requiresExtendedFields = outcome === 'closed' || outcome === 'lost' || outcome === 'follow_up';

  const isClosedValid = outcome === 'closed' &&
    cashCollected !== '' && cashCollected > 0 &&
    contractValue !== '' && contractValue > 0 &&
    objectionsOvercome !== null;
  const isLostOrFollowUpValid = (outcome === 'lost' || outcome === 'follow_up') &&
    pitchedValue !== '' && pitchedValue > 0 &&
    primaryObjection !== null;
  const isNoShowValid = outcome === 'no_show';

  const extendedFieldsValid = !requiresExtendedFields || (
    leadQualityScore !== null && prospectWasDecisionMaker !== null
  );

  const isValid = prospectName.trim() !== '' && outcome !== null &&
    (isClosedValid || isLostOrFollowUpValid || isNoShowValid) &&
    extendedFieldsValid;

  const cashExceedsContract = outcome === 'closed' &&
    cashCollected !== '' && contractValue !== '' &&
    cashCollected > contractValue;

  const handleSubmit = () => {
    if (!isValid || !outcome) return;

    const finalContractValue = outcome === 'closed'
      ? (contractValue ? Number(contractValue) : undefined)
      : ((outcome === 'lost' || outcome === 'follow_up') && pitchedValue
        ? Number(pitchedValue)
        : undefined);

    onSubmit({
      prospectName: prospectName.trim(),
      outcome,
      cashCollected: outcome === 'closed' && cashCollected ? Number(cashCollected) : undefined,
      contractValue: finalContractValue,
      dealValue: finalContractValue,
      notes: notes.trim() || undefined,
      primaryObjection: primaryObjection || undefined,
      primaryObjectionOther: primaryObjection === 'other' ? primaryObjectionOther.trim() || undefined : undefined,
      objectionsOvercome: objectionsOvercome || undefined,
      objectionsOvercomeOther: objectionsOvercome === 'other' ? objectionsOvercomeOther.trim() || undefined : undefined,
      leadQualityScore: leadQualityScore || undefined,
      prospectWasDecisionMaker: prospectWasDecisionMaker || undefined,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getLeadQualityColor = (score: number, isSelected: boolean) => {
    if (!isSelected) return 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600';
    if (score <= 3) return 'bg-red-500 text-white';
    if (score <= 6) return 'bg-orange-500 text-white';
    return 'bg-green-500 text-white';
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-500 ${
        isVisible ? 'bg-black/40 backdrop-blur-sm' : 'bg-transparent'
      }`}
    >
      <div
        className={`w-full mx-10 max-h-[85vh] flex flex-col bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl border border-gray-200 dark:border-zinc-700 border-b-0 transition-transform duration-500 ${
          isVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-9 h-1.5 rounded-full bg-gray-300 dark:bg-zinc-600" />
        </div>

        {/* Header */}
        <div className="px-8 pb-3 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Call Summary</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
            Complete this before your next call
          </p>
        </div>

        {/* Form - Scrollable */}
        <div className="px-8 pb-6 space-y-5 overflow-y-auto flex-1">
          {/* Row 1: Prospect Name + Outcome */}
          <div className="flex gap-6">
            {/* Prospect Name */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                Prospect Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={prospectName}
                onChange={(e) => setProspectName(e.target.value)}
                placeholder="Enter prospect's name"
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 focus:ring-1 focus:ring-gray-400 dark:focus:ring-zinc-400 transition-all duration-150"
                autoFocus
              />
            </div>

            {/* Outcome */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                Call Outcome <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                <OutcomeButton label="Closed" value="closed" selected={outcome === 'closed'} onClick={() => setOutcome('closed')} variant="success" />
                <OutcomeButton label="Follow Up" value="follow_up" selected={outcome === 'follow_up'} onClick={() => setOutcome('follow_up')} variant="default" />
                <OutcomeButton label="Lost" value="lost" selected={outcome === 'lost'} onClick={() => setOutcome('lost')} variant="danger" />
                <OutcomeButton label="No Show" value="no_show" selected={outcome === 'no_show'} onClick={() => setOutcome('no_show')} variant="muted" />
              </div>
            </div>
          </div>

          {/* Conditional fields based on outcome */}
          {outcome === 'closed' && (
            <div className="flex gap-6">
              {/* Cash Collected */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Cash Collected <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">Amount paid on this call</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {CASH_COLLECTED_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setCashCollected(preset)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 ${
                        cashCollected === preset
                          ? 'bg-black text-white dark:bg-white dark:text-black'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
                      }`}
                    >
                      {formatCurrency(preset)}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500">$</span>
                  <input
                    type="number"
                    value={cashCollected}
                    onChange={(e) => setCashCollected(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Custom amount"
                    className="w-full pl-8 pr-4 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 focus:ring-1 focus:ring-gray-400 dark:focus:ring-zinc-400 text-sm transition-all duration-150"
                  />
                </div>
              </div>

              {/* Contract Value */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Contract Value <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">Total contract commitment</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {CONTRACT_VALUE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setContractValue(preset)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 ${
                        contractValue === preset
                          ? 'bg-black text-white dark:bg-white dark:text-black'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
                      }`}
                    >
                      {formatCurrency(preset)}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500">$</span>
                  <input
                    type="number"
                    value={contractValue}
                    onChange={(e) => setContractValue(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Custom amount"
                    className="w-full pl-8 pr-4 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 focus:ring-1 focus:ring-gray-400 dark:focus:ring-zinc-400 text-sm transition-all duration-150"
                  />
                </div>
                {cashExceedsContract && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Cash collected is higher than contract value - is this correct?
                  </p>
                )}
              </div>

              {/* Objections Overcome */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Objection Overcome <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">What objection did you handle?</p>
                <select
                  value={objectionsOvercome || ''}
                  onChange={(e) => setObjectionsOvercome(e.target.value || null)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 focus:ring-1 focus:ring-gray-400 dark:focus:ring-zinc-400 text-sm transition-all duration-150"
                >
                  <option value="">Select...</option>
                  {OBJECTIONS_OVERCOME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {objectionsOvercome === 'other' && (
                  <input
                    type="text"
                    value={objectionsOvercomeOther}
                    onChange={(e) => setObjectionsOvercomeOther(e.target.value)}
                    placeholder="Describe..."
                    className="w-full mt-2 px-4 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 focus:ring-1 focus:ring-gray-400 dark:focus:ring-zinc-400 text-sm transition-all duration-150"
                  />
                )}
              </div>
            </div>
          )}

          {(outcome === 'lost' || outcome === 'follow_up') && (
            <div className="flex gap-6">
              {/* Deal Value */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  What was the deal worth? <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">The value you pitched</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {PITCHED_VALUE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setPitchedValue(preset)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 ${
                        pitchedValue === preset
                          ? 'bg-black text-white dark:bg-white dark:text-black'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
                      }`}
                    >
                      {formatCurrency(preset)}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500">$</span>
                  <input
                    type="number"
                    value={pitchedValue}
                    onChange={(e) => setPitchedValue(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Custom amount"
                    className="w-full pl-8 pr-4 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 focus:ring-1 focus:ring-gray-400 dark:focus:ring-zinc-400 text-sm transition-all duration-150"
                  />
                </div>
              </div>

              {/* Primary Objection */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Primary Objection <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">Main reason deal didn't close</p>
                <select
                  value={primaryObjection || ''}
                  onChange={(e) => setPrimaryObjection(e.target.value || null)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 focus:ring-1 focus:ring-gray-400 dark:focus:ring-zinc-400 text-sm transition-all duration-150"
                >
                  <option value="">Select objection...</option>
                  {OBJECTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {primaryObjection === 'other' && (
                  <input
                    type="text"
                    value={primaryObjectionOther}
                    onChange={(e) => setPrimaryObjectionOther(e.target.value)}
                    placeholder="Describe the objection..."
                    className="w-full mt-2 px-4 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 focus:ring-1 focus:ring-gray-400 dark:focus:ring-zinc-400 text-sm transition-all duration-150"
                  />
                )}
              </div>
            </div>
          )}

          {/* Row: Lead Quality + Decision Maker + Notes (shown for all outcomes except none) */}
          {outcome && (
            <div className="flex gap-6">
              {/* Lead Quality Score */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Lead Quality (1-10) {requiresExtendedFields && <span className="text-red-500">*</span>}
                </label>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">Was this a real opportunity?</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                    <button
                      key={score}
                      onClick={() => setLeadQualityScore(score)}
                      className={`w-8 h-8 rounded-lg text-xs font-medium transition-all duration-150 ${getLeadQualityColor(score, leadQualityScore === score)}`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>

              {/* Decision Maker */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Decision Maker? {requiresExtendedFields && <span className="text-red-500">*</span>}
                </label>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">Was the prospect the decision maker?</p>
                <div className="flex gap-2">
                  {[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                    { value: 'unclear', label: 'Unclear' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setProspectWasDecisionMaker(option.value)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                        prospectWasDecisionMaker === option.value
                          ? 'bg-black text-white dark:bg-white dark:text-black'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Notes <span className="text-gray-400 dark:text-zinc-500">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional notes..."
                  rows={3}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-400 focus:ring-1 focus:ring-gray-400 dark:focus:ring-zinc-400 text-sm transition-all duration-150 resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer — Submit only, no cancel */}
        <div className="px-8 py-4 border-t border-gray-100 dark:border-zinc-700 flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-gray-400 dark:text-zinc-500">
            {!isValid && outcome && 'Please complete all required fields'}
          </p>
          <button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className={`px-8 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-2 ${
              isValid && !isSubmitting
                ? 'bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-zinc-700 dark:text-zinc-500'
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-300 border-t-white rounded-full animate-spin dark:border-zinc-600 dark:border-t-black" />
                Saving...
              </>
            ) : (
              'Save & Finish'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface OutcomeButtonProps {
  label: string;
  value: CallOutcome;
  selected: boolean;
  onClick: () => void;
  variant: 'success' | 'default' | 'danger' | 'muted';
}

function OutcomeButton({ label, selected, onClick, variant }: OutcomeButtonProps) {
  const getClasses = () => {
    if (selected) {
      return 'bg-black border-black text-white dark:bg-white dark:border-white dark:text-black';
    }

    const hoverClasses: Record<typeof variant, string> = {
      success: 'bg-gray-50 border-gray-200 text-gray-700 hover:border-green-500 hover:text-green-600 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-300 dark:hover:border-green-500 dark:hover:text-green-400',
      default: 'bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-400 hover:text-gray-900 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-300 dark:hover:border-zinc-400 dark:hover:text-white',
      danger: 'bg-gray-50 border-gray-200 text-gray-700 hover:border-red-400 hover:text-red-600 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-300 dark:hover:border-red-400 dark:hover:text-red-400',
      muted: 'bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-400 hover:text-gray-600 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-300 dark:hover:border-zinc-400 dark:hover:text-zinc-200',
    };

    return hoverClasses[variant];
  };

  return (
    <button
      onClick={onClick}
      className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-all duration-150 ${getClasses()}`}
    >
      {label}
    </button>
  );
}
