import React, { useState } from 'react';
import { joinMoneyBells } from '../../../convex';

export interface MoneyBellsJoinPromptProps {
  userId: string;
  onJoined: () => void;
}

export function MoneyBellsJoinPrompt({ userId, onJoined }: MoneyBellsJoinPromptProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    const result = await joinMoneyBells(userId, true);
    setIsSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onJoined();
  }

  return (
    <div className="max-w-md mx-auto py-8">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <div className="text-center mb-5">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Welcome to Money Bells</h2>
          <p className="text-[13px] text-gray-500 dark:text-gray-400">
            Your closes will appear on the monthly leaderboard. Compete hard — but play fair.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex gap-2.5 items-start">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 mt-1.5 flex-shrink-0" />
            <p className="text-[12px] text-gray-700 dark:text-gray-300">
              We verify monthly prize winners with pay stubs before paying out
            </p>
          </div>
          <div className="flex gap-2.5 items-start">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 mt-1.5 flex-shrink-0" />
            <p className="text-[12px] text-gray-700 dark:text-gray-300">
              Inflated numbers → warning
            </p>
          </div>
          <div className="flex gap-2.5 items-start">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 mt-1.5 flex-shrink-0" />
            <p className="text-[12px] text-gray-700 dark:text-gray-300">
              Repeat offenders → removed from Money Bells
            </p>
          </div>
        </div>

        <p className="text-[12px] text-gray-600 dark:text-gray-400 text-center mb-5 font-medium">
          Keep it honest.
        </p>

        {error && (
          <p className="text-[11px] text-red-600 dark:text-red-400 text-center mb-3">{error}</p>
        )}

        <button
          onClick={handleJoin}
          disabled={isSubmitting}
          className="w-full py-2.5 text-[13px] font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Joining…' : 'Join Money Bells →'}
        </button>

        <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center mt-4">
          By joining, you acknowledge the above rules.
        </p>
      </div>
    </div>
  );
}
