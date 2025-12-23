import React, { useState } from 'react';

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
    dealValue?: number; // Legacy - kept for backward compat
    notes?: string;
    // Enhanced questionnaire fields
    primaryObjection?: string;
    primaryObjectionOther?: string;
    leadQualityScore?: number;
    prospectWasDecisionMaker?: string;
  }) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const CASH_COLLECTED_PRESETS = [1000, 3000, 5000, 10000, 15000];
const CONTRACT_VALUE_PRESETS = [3000, 5000, 10000, 15000, 25000];

// Objection options for lost/follow_up outcomes
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

export function PostCallQuestionnaire({
  callId,
  initialProspectName = '',
  initialNotes = '',
  onSubmit,
  onCancel,
  isSubmitting = false,
}: PostCallQuestionnaireProps) {
  const [prospectName, setProspectName] = useState(initialProspectName);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [cashCollected, setCashCollected] = useState<number | ''>('');
  const [contractValue, setContractValue] = useState<number | ''>('');
  const [notes, setNotes] = useState(initialNotes);
  const [showCloseWarning, setShowCloseWarning] = useState(false);

  // Enhanced questionnaire fields
  const [primaryObjection, setPrimaryObjection] = useState<string | null>(null);
  const [primaryObjectionOther, setPrimaryObjectionOther] = useState('');
  const [leadQualityScore, setLeadQualityScore] = useState<number | null>(null);
  const [prospectWasDecisionMaker, setProspectWasDecisionMaker] = useState<string | null>(null);

  // Check if form is valid for submission
  const isValid = prospectName.trim() !== '' && outcome !== null &&
    (outcome !== 'closed' || (
      cashCollected !== '' && cashCollected > 0 &&
      contractValue !== '' && contractValue > 0
    ));

  // Validation warning for cash > contract
  const cashExceedsContract = outcome === 'closed' &&
    cashCollected !== '' && contractValue !== '' &&
    cashCollected > contractValue;

  const handleSubmit = () => {
    if (!isValid || !outcome) return;

    onSubmit({
      prospectName: prospectName.trim(),
      outcome,
      cashCollected: outcome === 'closed' && cashCollected ? Number(cashCollected) : undefined,
      contractValue: outcome === 'closed' && contractValue ? Number(contractValue) : undefined,
      // Also set dealValue to contractValue for backward compat with old stats
      dealValue: outcome === 'closed' && contractValue ? Number(contractValue) : undefined,
      notes: notes.trim() || undefined,
      // Enhanced questionnaire fields
      primaryObjection: primaryObjection || undefined,
      primaryObjectionOther: primaryObjection === 'other' ? primaryObjectionOther.trim() || undefined : undefined,
      leadQualityScore: leadQualityScore || undefined,
      prospectWasDecisionMaker: prospectWasDecisionMaker || undefined,
    });
  };

  const handleAttemptClose = () => {
    if (!isValid) {
      setShowCloseWarning(true);
      return;
    }
    onCancel();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md mx-4 shadow-xl border border-gray-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Call Summary</h2>
          <p className="text-sm text-gray-500 mt-1">
            Complete this before your next call
          </p>
        </div>

        {/* Form - Scrollable */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* Prospect Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Prospect Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={prospectName}
              onChange={(e) => setProspectName(e.target.value)}
              placeholder="Enter prospect's name"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              autoFocus
            />
          </div>

          {/* Outcome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Call Outcome <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <OutcomeButton
                label="Closed"
                value="closed"
                selected={outcome === 'closed'}
                onClick={() => setOutcome('closed')}
                variant="success"
              />
              <OutcomeButton
                label="Follow Up"
                value="follow_up"
                selected={outcome === 'follow_up'}
                onClick={() => setOutcome('follow_up')}
                variant="default"
              />
              <OutcomeButton
                label="Lost"
                value="lost"
                selected={outcome === 'lost'}
                onClick={() => setOutcome('lost')}
                variant="danger"
              />
              <OutcomeButton
                label="No Show"
                value="no_show"
                selected={outcome === 'no_show'}
                onClick={() => setOutcome('no_show')}
                variant="muted"
              />
            </div>
          </div>

          {/* Cash Collected & Contract Value (only shown if outcome is "closed") */}
          {outcome === 'closed' && (
            <>
              {/* Cash Collected */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cash Collected <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">Amount paid on this call</p>

                {/* Quick select buttons */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {CASH_COLLECTED_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setCashCollected(preset)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                        cashCollected === preset
                          ? 'bg-black text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {formatCurrency(preset)}
                    </button>
                  ))}
                </div>

                {/* Custom input */}
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    value={cashCollected}
                    onChange={(e) => setCashCollected(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Custom amount"
                    className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
                  />
                </div>
              </div>

              {/* Contract Value */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contract Value <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">Total contract commitment</p>

                {/* Quick select buttons */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {CONTRACT_VALUE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setContractValue(preset)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                        contractValue === preset
                          ? 'bg-black text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {formatCurrency(preset)}
                    </button>
                  ))}
                </div>

                {/* Custom input */}
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    value={contractValue}
                    onChange={(e) => setContractValue(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Custom amount"
                    className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
                  />
                </div>

                {/* Warning if cash > contract */}
                {cashExceedsContract && (
                  <p className="text-xs text-amber-600 mt-2">
                    Cash collected is higher than contract value - is this correct?
                  </p>
                )}
              </div>
            </>
          )}

          {/* Primary Objection (only shown for lost or follow_up) */}
          {(outcome === 'lost' || outcome === 'follow_up') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Primary Objection
              </label>
              <select
                value={primaryObjection || ''}
                onChange={(e) => setPrimaryObjection(e.target.value || null)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              >
                <option value="">Select objection...</option>
                {OBJECTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Other objection text input */}
              {primaryObjection === 'other' && (
                <input
                  type="text"
                  value={primaryObjectionOther}
                  onChange={(e) => setPrimaryObjectionOther(e.target.value)}
                  placeholder="Describe the objection..."
                  className="w-full mt-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
                />
              )}
            </div>
          )}

          {/* Lead Quality Score */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lead Quality (1-10)
            </label>
            <p className="text-xs text-gray-500 mb-2">Was this a real opportunity?</p>
            <div className="flex gap-1.5 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                <button
                  key={score}
                  onClick={() => setLeadQualityScore(score)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-all duration-150 ${
                    leadQualityScore === score
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>

          {/* Decision Maker Question */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Was the prospect the decision maker?
            </label>
            <div className="flex gap-2">
              {[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
                { value: 'unclear', label: 'Unclear' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setProspectWasDecisionMaker(option.value)}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    prospectWasDecisionMaker === option.value
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes about the call..."
              rows={3}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150 resize-none"
            />
          </div>

          {/* Warning message */}
          {showCloseWarning && !isValid && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">
                Please complete all required fields before closing.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={handleAttemptClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-2 ${
              isValid && !isSubmitting
                ? 'bg-black text-white hover:bg-gray-800'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-300 border-t-white rounded-full animate-spin" />
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
      return 'bg-black border-black text-white';
    }

    const hoverClasses: Record<typeof variant, string> = {
      success: 'bg-gray-50 border-gray-200 text-gray-700 hover:border-green-500 hover:text-green-600',
      default: 'bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-400 hover:text-gray-900',
      danger: 'bg-gray-50 border-gray-200 text-gray-700 hover:border-red-400 hover:text-red-600',
      muted: 'bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-400 hover:text-gray-600',
    };

    return hoverClasses[variant];
  };

  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all duration-150 ${getClasses()}`}
    >
      {label}
    </button>
  );
}
