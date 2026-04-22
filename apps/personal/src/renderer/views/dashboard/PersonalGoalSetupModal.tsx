import React, { useState } from 'react';
import {
  setCommissionSettings,
  createPersonalGoal,
  cancelActivePersonalGoal,
  type CommissionMode,
  type CommissionSettings,
} from '../../convex';

const EMOJI_PRESETS = [
  '🎯', '🏎️', '🏡', '🏖️', '💍', '👶', '✈️', '🎓',
  '💼', '🚀', '🏆', '💰', '🛥️', '🏝️', '🎸', '📸',
  '👨‍👩‍👧', '🐕', '🏋️', '🧘',
];

const DURATION_PRESETS: Array<{ label: string; months: number }> = [
  { label: '1 mo', months: 1 },
  { label: '3 mo', months: 3 },
  { label: '6 mo', months: 6 },
  { label: '1 yr', months: 12 },
];

interface PersonalGoalSetupModalProps {
  userId: string;
  existingCommissionSettings: CommissionSettings | null;
  /** When true, user has an active goal that will be replaced on save. */
  hasActiveGoal: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function PersonalGoalSetupModal({
  userId,
  existingCommissionSettings,
  hasActiveGoal,
  onClose,
  onSaved,
}: PersonalGoalSetupModalProps) {
  // Commission inputs — default to existing settings if user has them
  const [commissionMode, setCommissionMode] = useState<CommissionMode>(
    existingCommissionSettings?.commissionMode ?? 'cash'
  );
  // Store as whole-number percent for UX; convert to decimal on save
  const [ratePercentStr, setRatePercentStr] = useState<string>(
    existingCommissionSettings ? String(existingCommissionSettings.commissionRate * 100) : '10'
  );
  const [showCommissionEditor, setShowCommissionEditor] = useState(!existingCommissionSettings);

  // Goal inputs
  const [emoji, setEmoji] = useState<string>('🎯');
  const [title, setTitle] = useState('');
  const [targetAmountStr, setTargetAmountStr] = useState('');
  const [durationMonths, setDurationMonths] = useState<number>(3);
  const [customDurationStr, setCustomDurationStr] = useState('');
  const [usingCustomDuration, setUsingCustomDuration] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ratePercent = parseFloat(ratePercentStr);
  const targetAmount = parseFloat(targetAmountStr.replace(/[^0-9.]/g, ''));
  const effectiveDuration = usingCustomDuration
    ? parseInt(customDurationStr || '0', 10)
    : durationMonths;

  const commissionValid =
    Number.isFinite(ratePercent) && ratePercent > 0 && ratePercent <= 100;
  const goalValid =
    title.trim().length > 0 &&
    title.trim().length <= 80 &&
    Number.isFinite(targetAmount) &&
    targetAmount > 0 &&
    Number.isInteger(effectiveDuration) &&
    effectiveDuration >= 1 &&
    effectiveDuration <= 36;
  const canSubmit = !submitting && commissionValid && goalValid;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    // 1) Upsert commission settings first — the goal's progress calc reads
    //    from these, so getting them right before creating the goal matters.
    //    Only send if the user changed them OR this is their first time.
    const rateDecimal = ratePercent / 100;
    const commissionChanged =
      !existingCommissionSettings ||
      existingCommissionSettings.commissionMode !== commissionMode ||
      Math.abs(existingCommissionSettings.commissionRate - rateDecimal) > 1e-6;

    if (commissionChanged) {
      const cRes = await setCommissionSettings(userId, commissionMode, rateDecimal);
      if (cRes.error) {
        setSubmitting(false);
        setError(cRes.error);
        return;
      }
    }

    // 2) If replacing an active goal, cancel it first (createGoal refuses
    //    when there's an active one to force intentional replacement).
    if (hasActiveGoal) {
      const cancelRes = await cancelActivePersonalGoal(userId);
      if (cancelRes.error) {
        setSubmitting(false);
        setError(cancelRes.error);
        return;
      }
    }

    // 3) Create the new goal
    const gRes = await createPersonalGoal(userId, {
      title: title.trim(),
      emoji,
      targetAmount,
      durationMonths: effectiveDuration,
    });
    setSubmitting(false);
    if (gRes.error || !gRes.id) {
      setError(gRes.error || 'Failed to create goal');
      return;
    }
    onSaved();
  }

  async function handleCancelActiveGoal() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await cancelActivePersonalGoal(userId);
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-[460px] max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-zinc-800">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {hasActiveGoal ? 'Replace your goal' : 'New goal'}
          </p>
          <h2 className="text-base font-bold text-gray-900 dark:text-white mt-1">
            {hasActiveGoal ? 'Set a new target.' : 'Set a goal. Stay focused.'}
          </h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">
            {hasActiveGoal
              ? 'Saving will replace your current goal. The old one will be archived — your progress resets from today.'
              : "Name what you're chasing, tie a dollar amount to it, and pick a deadline. Your dashboard will track your progress as you close deals."}
          </p>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Commission settings */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {existingCommissionSettings ? 'Commission (from your setup)' : 'Your commission'}
              </p>
              {existingCommissionSettings && (
                <button
                  type="button"
                  onClick={() => setShowCommissionEditor(!showCommissionEditor)}
                  className="text-[11px] font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {showCommissionEditor ? 'Done' : 'Edit'}
                </button>
              )}
            </div>

            {showCommissionEditor ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  {([
                    { val: 'cash' as const, label: '% of Cash Collected' },
                    { val: 'contract' as const, label: '% of Contract Value' },
                  ]).map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setCommissionMode(opt.val)}
                      className={`flex-1 px-3 py-2 text-[12px] font-medium rounded-lg border transition-colors ${
                        commissionMode === opt.val
                          ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                          : 'bg-gray-50 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Commission rate
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={ratePercentStr}
                      onChange={(e) => setRatePercentStr(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="10"
                      className="w-24 px-3 py-2 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 text-gray-900 dark:text-white"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-400">%</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-gray-700 dark:text-gray-300">
                {(existingCommissionSettings!.commissionRate * 100).toFixed(existingCommissionSettings!.commissionRate * 100 % 1 === 0 ? 0 : 2)}% of {existingCommissionSettings!.commissionMode === 'cash' ? 'cash collected' : 'contract value'}
              </p>
            )}
          </div>

          {/* Goal emoji */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Pick an emoji
            </p>
            <div className="grid grid-cols-10 gap-1.5">
              {EMOJI_PRESETS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`aspect-square text-[20px] rounded-lg border-2 flex items-center justify-center transition-all ${
                    emoji === e
                      ? 'border-gray-900 dark:border-white bg-gray-100 dark:bg-zinc-800 scale-105'
                      : 'border-transparent hover:bg-gray-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              What's the goal?
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              placeholder="Buy a Tesla — proof I can leave the corporate world"
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 text-gray-900 dark:text-white placeholder-gray-400"
            />
            <div className="flex justify-end text-[10px] text-gray-400 mt-0.5">
              {title.length}/80
            </div>
          </div>

          {/* Target amount */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              How much will it cost you?
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-gray-500 dark:text-gray-400">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={targetAmountStr}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9]/g, '');
                  // Format with commas for readability
                  const withCommas = cleaned ? parseInt(cleaned, 10).toLocaleString() : '';
                  setTargetAmountStr(withCommas);
                }}
                placeholder="50,000"
                className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 text-gray-900 dark:text-white placeholder-gray-400"
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              This is what you need to <span className="font-medium">earn</span> — we do the commission math.
            </p>
          </div>

          {/* Duration */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Timeframe
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {DURATION_PRESETS.map((d) => (
                <button
                  key={d.months}
                  type="button"
                  onClick={() => {
                    setDurationMonths(d.months);
                    setUsingCustomDuration(false);
                  }}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
                    !usingCustomDuration && durationMonths === d.months
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                      : 'bg-gray-50 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                  }`}
                >
                  {d.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setUsingCustomDuration(true)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
                  usingCustomDuration
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                    : 'bg-gray-50 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                }`}
              >
                Custom
              </button>
              {usingCustomDuration && (
                <div className="flex items-center gap-1.5 ml-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={customDurationStr}
                    onChange={(e) =>
                      setCustomDurationStr(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))
                    }
                    placeholder="N"
                    className="w-14 px-2 py-1.5 text-[12px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 text-gray-900 dark:text-white"
                  />
                  <span className="text-[11px] text-gray-500">months (1–36)</span>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-[11px] text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-2">
          <div>
            {hasActiveGoal && (
              <button
                onClick={handleCancelActiveGoal}
                disabled={submitting}
                className="px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
              >
                Cancel current goal
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-4 py-2 text-xs font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting
                ? 'Saving…'
                : hasActiveGoal
                  ? 'Replace with this'
                  : 'Start chasing it'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
