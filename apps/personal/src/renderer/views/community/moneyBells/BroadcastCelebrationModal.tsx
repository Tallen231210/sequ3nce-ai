import React, { useEffect, useRef, useState } from 'react';
import { createMoneyBellBroadcast, deleteMoneyBellBroadcast } from '../../../convex';

const UNDO_WINDOW_MS = 30_000;
const COUNTER_ANIMATION_MS = 1200;
const MAX_NOTE_LENGTH = 140;

export interface BroadcastCelebrationModalProps {
  userId: string;
  callId: string;
  cashCollected: number;
  prospectName?: string;
  onClose: () => void;
}

function formatCash(n: number): string {
  return `$${n.toLocaleString()}`;
}

export function BroadcastCelebrationModal({
  userId,
  callId,
  cashCollected,
  prospectName,
  onClose,
}: BroadcastCelebrationModalProps) {
  const [step, setStep] = useState<'prompt' | 'broadcasted'>('prompt');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broadcastId, setBroadcastId] = useState<string | null>(null);
  const [displayCash, setDisplayCash] = useState(0);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);
  const [undoUsed, setUndoUsed] = useState(false);
  const animationFrameRef = useRef<number | null>(null);

  // Animate counter 0 → cashCollected on mount
  useEffect(() => {
    const startedAt = performance.now();
    const startValue = 0;
    const endValue = cashCollected;

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const t = Math.min(1, elapsed / COUNTER_ANIMATION_MS);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayCash(Math.round(startValue + (endValue - startValue) * eased));
      if (t < 1) {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };
    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [cashCollected]);

  // Undo countdown after broadcasting
  useEffect(() => {
    if (step !== 'broadcasted' || undoUsed) return;
    setUndoSecondsLeft(Math.floor(UNDO_WINDOW_MS / 1000));
    const interval = setInterval(() => {
      setUndoSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, undoUsed]);

  async function handleBroadcast() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    const result = await createMoneyBellBroadcast(userId, callId, cashCollected, note.trim() || undefined);
    setIsSubmitting(false);
    if (!result.success || !result.broadcastId) {
      setError(result.error || 'Failed to broadcast');
      return;
    }
    setBroadcastId(result.broadcastId);
    setStep('broadcasted');
  }

  async function handleUndo() {
    if (!broadcastId || isSubmitting) return;
    setIsSubmitting(true);
    const result = await deleteMoneyBellBroadcast(userId, broadcastId);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error || 'Failed to undo');
      return;
    }
    setUndoUsed(true);
    onClose();
  }

  function handleSkip() {
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-6">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-[340px] border border-gray-200 dark:border-gray-700 overflow-hidden">
        {step === 'prompt' ? (
          <>
            <div className="px-5 pt-5 pb-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Deal closed
              </p>
              <h2 className="text-[15px] font-bold text-gray-900 dark:text-white mt-0.5 truncate">
                {prospectName ? prospectName : 'New close'}
              </h2>
              <div className="text-[28px] font-extrabold text-gray-900 dark:text-white tabular-nums tracking-tight mt-2 leading-none">
                +{formatCash(displayCash)}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-snug">
                Share this close to Money Bells so teammates can react and cheer you on.
              </p>
            </div>

            <div className="px-5 pb-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                placeholder="Optional note…"
                rows={2}
                className="w-full px-3 py-2 text-[12px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 text-gray-900 dark:text-white placeholder-gray-400"
              />
              <div className="flex justify-end text-[9px] text-gray-400 mt-0.5">
                {note.length}/{MAX_NOTE_LENGTH}
              </div>
            </div>

            {error && (
              <p className="px-5 text-[11px] text-red-600 dark:text-red-400 text-center mb-2">{error}</p>
            )}

            <div className="px-5 pb-5 flex flex-col gap-1.5">
              <button
                onClick={handleBroadcast}
                disabled={isSubmitting}
                className="w-full py-2.5 text-[12px] font-semibold bg-black text-white dark:bg-white dark:text-black rounded-xl hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                {isSubmitting ? 'Broadcasting…' : 'Broadcast to Money Bells'}
              </button>
              <button
                onClick={handleSkip}
                disabled={isSubmitting}
                className="w-full py-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Skip this one
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-5 pt-5 pb-2 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Broadcasted
              </p>
              <h2 className="text-[15px] font-bold text-gray-900 dark:text-white mt-0.5">You&apos;re on the board</h2>
              <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1.5 leading-snug">
                Your close is live on the Money Bells leaderboard.
              </p>
            </div>

            <div className="px-5 pb-5 flex flex-col gap-1.5">
              <button
                onClick={onClose}
                className="w-full py-2.5 text-[12px] font-semibold bg-black text-white dark:bg-white dark:text-black rounded-xl hover:opacity-80 transition-opacity"
              >
                Close
              </button>
              {undoSecondsLeft > 0 && !undoUsed && (
                <button
                  onClick={handleUndo}
                  disabled={isSubmitting}
                  className="w-full py-1.5 text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  Undo ({undoSecondsLeft}s)
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
