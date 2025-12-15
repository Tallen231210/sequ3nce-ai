import React, { useState } from 'react';

export type CallOutcome = 'closed' | 'follow_up' | 'lost' | 'no_show';

interface PostCallQuestionnaireProps {
  callId: string;
  initialProspectName?: string;
  initialNotes?: string;
  onSubmit: (data: {
    prospectName: string;
    outcome: CallOutcome;
    dealValue?: number;
    notes?: string;
  }) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const DEAL_VALUE_PRESETS = [1000, 3000, 5000, 10000, 15000];

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
  const [dealValue, setDealValue] = useState<number | ''>('');
  const [notes, setNotes] = useState(initialNotes);
  const [showCloseWarning, setShowCloseWarning] = useState(false);

  // Check if form is valid for submission
  const isValid = prospectName.trim() !== '' && outcome !== null &&
    (outcome !== 'closed' || (dealValue !== '' && dealValue > 0));

  const handleSubmit = () => {
    if (!isValid || !outcome) return;

    onSubmit({
      prospectName: prospectName.trim(),
      outcome,
      dealValue: outcome === 'closed' && dealValue ? Number(dealValue) : undefined,
      notes: notes.trim() || undefined,
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
      <div className="bg-white rounded-xl w-full max-w-md mx-4 shadow-xl border border-gray-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Call Summary</h2>
          <p className="text-sm text-gray-500 mt-1">
            Complete this before your next call
          </p>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-5">
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

          {/* Deal Value (only shown if outcome is "closed") */}
          {outcome === 'closed' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Deal Value <span className="text-red-500">*</span>
              </label>

              {/* Quick select buttons */}
              <div className="flex flex-wrap gap-2 mb-3">
                {DEAL_VALUE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setDealValue(preset)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                      dealValue === preset
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
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value ? Number(e.target.value) : '')}
                  placeholder="Custom amount"
                  className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
                />
              </div>
            </div>
          )}

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
        </div>

        {/* Warning message */}
        {showCloseWarning && !isValid && (
          <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">
              Please complete all required fields before closing.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
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
