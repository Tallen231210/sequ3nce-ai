import React, { useState, useEffect, useCallback } from 'react';
import type { CloserInfo, BugReport } from '../../convex';
import { submitBugReport, getMyBugReports } from '../../convex';

interface BugReportViewProps {
  closerInfo: CloserInfo;
}

const SCREENS = [
  'Dashboard', 'Stats', 'Calls', 'Highlights', 'Content Review',
  'Schedule', 'Resources', 'Job Board', 'Profile', 'Community',
  'Settings', 'Stream', 'Other',
];

const STATUS_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: 'New', bg: 'bg-gray-100', text: 'text-gray-600' },
  reviewed: { label: 'Reviewed', bg: 'bg-blue-50', text: 'text-blue-600' },
  fixed: { label: 'Fixed', bg: 'bg-green-50', text: 'text-green-600' },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function BugReportView({ closerInfo }: BugReportViewProps) {
  const [whatHappened, setWhatHappened] = useState('');
  const [whatWereDoing, setWhatWereDoing] = useState('');
  const [whichScreen, setWhichScreen] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myReports, setMyReports] = useState<BugReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);

  const userId = closerInfo.b2cUserId;

  const loadReports = useCallback(async () => {
    if (!userId) return;
    setLoadingReports(true);
    const data = await getMyBugReports(userId);
    setMyReports(data);
    setLoadingReports(false);
  }, [userId]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setError(null);

    if (!whatHappened.trim()) { setError("Please describe what happened"); return; }
    if (!whatWereDoing.trim()) { setError("Please describe what you were trying to do"); return; }
    if (!whichScreen) { setError("Please select which screen"); return; }

    setIsSubmitting(true);

    // Auto-collect app info
    let appVersion = '';
    let platform = '';
    try {
      appVersion = await window.electron?.app?.getVersion() || '';
      const platformInfo = await window.electron?.app?.getPlatform();
      platform = platformInfo ? `${platformInfo.platform} ${platformInfo.osRelease}` : '';
    } catch {
      // Non-critical
    }

    const result = await submitBugReport({
      authorId: userId,
      authorEmail: closerInfo.email,
      whatHappened: whatHappened.trim(),
      whatWereDoing: whatWereDoing.trim(),
      whichScreen,
      appVersion,
      platform,
    });

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSubmitted(true);
    setWhatHappened('');
    setWhatWereDoing('');
    setWhichScreen('');
    loadReports();

    // Reset success message after 3s
    setTimeout(() => setSubmitted(false), 3000);
  }, [userId, closerInfo.email, whatHappened, whatWereDoing, whichScreen, loadReports]);

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {/* Form */}
      <div className="max-w-xl">
        <h3 className="text-[14px] font-semibold text-black dark:text-white mb-1">Report a Bug</h3>
        <p className="text-[12px] text-gray-500 mb-4">
          Help us improve by reporting issues you encounter. Your reports are private.
        </p>

        {submitted ? (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-center">
            <p className="text-[13px] font-semibold text-green-700 dark:text-green-300">Bug report submitted</p>
            <p className="text-[12px] text-green-600 dark:text-green-400 mt-0.5">We'll look into it. Thanks for helping us improve.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                What happened? <span className="text-red-500">*</span>
              </label>
              <textarea
                value={whatHappened}
                onChange={(e) => setWhatHappened(e.target.value)}
                placeholder="Describe the bug — what did you see that was wrong?"
                maxLength={2000}
                rows={3}
                className="w-full px-3 py-2 text-[13px] bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 resize-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                What were you trying to do? <span className="text-red-500">*</span>
              </label>
              <textarea
                value={whatWereDoing}
                onChange={(e) => setWhatWereDoing(e.target.value)}
                placeholder="What action were you taking when the bug occurred?"
                maxLength={2000}
                rows={2}
                className="w-full px-3 py-2 text-[13px] bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 resize-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                Which screen? <span className="text-red-500">*</span>
              </label>
              <select
                value={whichScreen}
                onChange={(e) => setWhichScreen(e.target.value)}
                className="w-full px-3 py-2 text-[13px] bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10"
              >
                <option value="">Select a screen...</option>
                {SCREENS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {error && <p className="text-[11px] text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-[13px] font-semibold text-white bg-black rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Bug Report'}
            </button>
          </form>
        )}
      </div>

      {/* Past reports */}
      <div className="mt-8 max-w-xl">
        <h3 className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 mb-3">Your Reports</h3>
        {loadingReports ? (
          <div className="py-4 text-center">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-black rounded-full animate-spin mx-auto" />
          </div>
        ) : myReports.length === 0 ? (
          <p className="text-[12px] text-gray-400 py-4">No reports yet</p>
        ) : (
          <div className="space-y-2">
            {myReports.map((report) => {
              const badge = STATUS_BADGES[report.status] || STATUS_BADGES.new;
              return (
                <div
                  key={report._id}
                  className="p-3 bg-gray-50 dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-gray-400">{report.whichScreen} &middot; {timeAgo(report.createdAt)}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-[12px] text-gray-700 dark:text-gray-300 line-clamp-2">{report.whatHappened}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
