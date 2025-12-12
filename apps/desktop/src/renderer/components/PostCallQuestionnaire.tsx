import React, { useState, useEffect } from 'react';

export type CallOutcome = 'closed' | 'follow_up' | 'lost' | 'no_show';

interface PostCallQuestionnaireProps {
  callId: string;
  initialProspectName?: string;
  onSubmit: (data: {
    prospectName: string;
    outcome: CallOutcome;
    dealValue?: number;
    notes?: string;
  }) => void;
  onCancel: () => void;
}

const DEAL_VALUE_PRESETS = [1000, 3000, 5000, 10000, 15000];

export function PostCallQuestionnaire({
  callId,
  initialProspectName = '',
  onSubmit,
  onCancel,
}: PostCallQuestionnaireProps) {
  const [prospectName, setProspectName] = useState(initialProspectName);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [dealValue, setDealValue] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-xl w-full max-w-md mx-4 shadow-2xl border border-zinc-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-700">
          <h2 className="text-lg font-semibold text-white">Call Summary</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Complete this before your next call
          </p>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-5">
          {/* Prospect Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Prospect Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={prospectName}
              onChange={(e) => setProspectName(e.target.value)}
              placeholder="Enter prospect's name"
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition-colors"
              autoFocus
            />
          </div>

          {/* Outcome */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Call Outcome <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <OutcomeButton
                label="Closed"
                value="closed"
                selected={outcome === 'closed'}
                onClick={() => setOutcome('closed')}
                color="green"
              />
              <OutcomeButton
                label="Follow Up"
                value="follow_up"
                selected={outcome === 'follow_up'}
                onClick={() => setOutcome('follow_up')}
                color="blue"
              />
              <OutcomeButton
                label="Lost"
                value="lost"
                selected={outcome === 'lost'}
                onClick={() => setOutcome('lost')}
                color="red"
              />
              <OutcomeButton
                label="No Show"
                value="no_show"
                selected={outcome === 'no_show'}
                onClick={() => setOutcome('no_show')}
                color="gray"
              />
            </div>
          </div>

          {/* Deal Value (only shown if outcome is "closed") */}
          {outcome === 'closed' && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Deal Value <span className="text-red-400">*</span>
              </label>

              {/* Quick select buttons */}
              <div className="flex flex-wrap gap-2 mb-3">
                {DEAL_VALUE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setDealValue(preset)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      dealValue === preset
                        ? 'bg-green-600 text-white'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {formatCurrency(preset)}
                  </button>
                ))}
              </div>

              {/* Custom input */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                <input
                  type="number"
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value ? Number(e.target.value) : '')}
                  placeholder="Custom amount"
                  className="w-full pl-8 pr-4 py-2.5 bg-zinc-800 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition-colors"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Notes <span className="text-zinc-500">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes about the call..."
              rows={3}
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Warning message */}
        {showCloseWarning && !isValid && (
          <div className="mx-6 mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg">
            <p className="text-sm text-red-300">
              Please complete all required fields before closing.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-700 flex justify-end gap-3">
          <button
            onClick={handleAttemptClose}
            className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              isValid
                ? 'bg-white text-black hover:bg-zinc-200'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            }`}
          >
            Save & Finish
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
  color: 'green' | 'blue' | 'red' | 'gray';
}

function OutcomeButton({ label, selected, onClick, color }: OutcomeButtonProps) {
  const colorClasses = {
    green: selected
      ? 'bg-green-600 border-green-500 text-white'
      : 'bg-zinc-800 border-zinc-600 text-zinc-300 hover:border-green-600 hover:text-green-400',
    blue: selected
      ? 'bg-blue-600 border-blue-500 text-white'
      : 'bg-zinc-800 border-zinc-600 text-zinc-300 hover:border-blue-600 hover:text-blue-400',
    red: selected
      ? 'bg-red-600 border-red-500 text-white'
      : 'bg-zinc-800 border-zinc-600 text-zinc-300 hover:border-red-600 hover:text-red-400',
    gray: selected
      ? 'bg-zinc-600 border-zinc-500 text-white'
      : 'bg-zinc-800 border-zinc-600 text-zinc-300 hover:border-zinc-500 hover:text-zinc-200',
  };

  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${colorClasses[color]}`}
    >
      {label}
    </button>
  );
}
