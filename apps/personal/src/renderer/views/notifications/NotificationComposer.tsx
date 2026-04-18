import React, { useCallback, useEffect, useState } from 'react';
import {
  getEligibleRecipientCount,
  sendTeamNotification,
  sendTeamNotificationToAll,
} from '../../convex';
import type { CommunityMember } from '../community/types';
import { RecipientMultiSelect } from './RecipientMultiSelect';

const MAX_BODY = 2000;

interface NotificationComposerProps {
  founderId: string;
  onSent: () => void;
}

type Mode = 'specific' | 'all';

export function NotificationComposer({ founderId, onSent }: NotificationComposerProps) {
  const [mode, setMode] = useState<Mode>('specific');
  const [recipients, setRecipients] = useState<CommunityMember[]>([]);
  const [body, setBody] = useState('');
  const [repliesAllowed, setRepliesAllowed] = useState(false);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showAllConfirm, setShowAllConfirm] = useState(false);

  const refreshEligibleCount = useCallback(async () => {
    const res = await getEligibleRecipientCount(founderId);
    if ('count' in res) setEligibleCount(res.count);
  }, [founderId]);

  useEffect(() => {
    void refreshEligibleCount();
  }, [refreshEligibleCount]);

  const canSend = (() => {
    if (submitting) return false;
    if (body.trim().length === 0) return false;
    if (body.length > MAX_BODY) return false;
    if (mode === 'specific' && recipients.length === 0) return false;
    return true;
  })();

  const performSend = async () => {
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      if (mode === 'specific') {
        const res = await sendTeamNotification(
          founderId,
          recipients.map((r) => r.userId),
          body,
          repliesAllowed
        );
        if ('error' in res) {
          setError(res.error);
          return;
        }
        setSuccessMessage(`Sent to ${res.recipientCount} recipient${res.recipientCount === 1 ? '' : 's'}.`);
      } else {
        const res = await sendTeamNotificationToAll(founderId, body, repliesAllowed);
        if ('error' in res) {
          setError(res.error);
          return;
        }
        setSuccessMessage(`Sent to ${res.recipientCount} users.`);
      }
      setBody('');
      setRecipients([]);
      setShowAllConfirm(false);
      onSent();
      void refreshEligibleCount();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendClick = () => {
    if (!canSend) return;
    if (mode === 'all') {
      setShowAllConfirm(true);
      return;
    }
    void performSend();
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-900">
      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Send Notification</h3>

      {/* Recipient mode toggle */}
      <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg mb-3 w-fit">
        <button
          onClick={() => setMode('specific')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'specific'
              ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Specific users
        </button>
        <button
          onClick={() => setMode('all')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'all'
              ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          All users
        </button>
      </div>

      {/* Recipient area */}
      {mode === 'specific' ? (
        <div className="mb-3">
          <RecipientMultiSelect
            currentUserId={founderId}
            selected={recipients}
            onChange={setRecipients}
          />
        </div>
      ) : (
        <div className="mb-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="text-sm text-gray-900 dark:text-white font-medium">
            Will send to {eligibleCount === null ? '…' : eligibleCount.toLocaleString()} active user{eligibleCount === 1 ? '' : 's'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Excludes founder/admin accounts and users without an active subscription.
          </div>
        </div>
      )}

      {/* Body */}
      <div className="mb-3">
        <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
          Message
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
          rows={5}
          placeholder="Type your announcement…"
          className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 text-gray-900 dark:text-white placeholder-gray-400"
        />
        <div className="flex justify-end text-[10px] text-gray-400 mt-0.5">
          {body.length}/{MAX_BODY}
        </div>
      </div>

      {/* Allow replies toggle */}
      <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={repliesAllowed}
          onChange={(e) => setRepliesAllowed(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-black dark:text-white focus:ring-black dark:focus:ring-white"
        />
        <span className="text-sm text-gray-900 dark:text-white">Allow recipients to reply</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {repliesAllowed ? '— conversation is two-way' : '— one-way announcement'}
        </span>
      </label>

      {error && (
        <div className="mb-3 px-3 py-2 text-xs rounded-md bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-3 px-3 py-2 text-xs rounded-md bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
          {successMessage}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSendClick}
          disabled={!canSend}
          className="px-4 py-2 text-sm font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Sending…' : mode === 'all' ? 'Send to all users' : `Send to ${recipients.length || 0} recipient${recipients.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {/* Confirm modal for all-users */}
      {showAllConfirm && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-6"
          onClick={() => !submitting && setShowAllConfirm(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-[400px] border border-gray-200 dark:border-gray-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Confirm broadcast
              </p>
              <h2 className="text-base font-bold text-gray-900 dark:text-white mt-1">
                Send to {eligibleCount === null ? '…' : eligibleCount.toLocaleString()} users?
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                This can&apos;t be undone. Everyone with an active subscription will receive this.
              </p>
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-700 dark:text-gray-300 max-h-[140px] overflow-y-auto whitespace-pre-wrap">
                {body}
              </div>
              <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                {repliesAllowed ? 'Replies allowed.' : 'Replies disabled.'}
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2 justify-end">
              <button
                onClick={() => setShowAllConfirm(false)}
                disabled={submitting}
                className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void performSend()}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity disabled:opacity-40"
              >
                {submitting ? 'Sending…' : 'Confirm send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
