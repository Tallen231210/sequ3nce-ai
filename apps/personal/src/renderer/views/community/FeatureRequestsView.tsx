import React, { useState, useEffect, useCallback } from 'react';
import type { CloserInfo, FeatureRequest } from '../../convex';
import {
  getFeatureRequests,
  createFeatureRequest,
  upvoteFeatureRequest,
  removeFeatureRequestUpvote,
  updateFeatureRequestStatus,
} from '../../convex';

interface FeatureRequestsViewProps {
  closerInfo: CloserInfo;
}

const STATUS_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  open: { label: 'Open', bg: 'bg-gray-100', text: 'text-gray-600' },
  planned: { label: 'Planned', bg: 'bg-blue-50', text: 'text-blue-600' },
  in_progress: { label: 'In Progress', bg: 'bg-amber-50', text: 'text-amber-600' },
  shipped: { label: 'Shipped', bg: 'bg-green-50', text: 'text-green-600' },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function FeatureRequestsView({ closerInfo }: FeatureRequestsViewProps) {
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'popular' | 'newest'>('popular');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [votingId, setVotingId] = useState<string | null>(null);

  const userId = closerInfo.b2cUserId;
  const isAdmin = closerInfo.badges?.includes('founder') || closerInfo.badges?.includes('admin');

  const loadRequests = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    const data = await getFeatureRequests(userId, sortBy);
    setRequests(data);
    setIsLoading(false);
  }, [userId, sortBy]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setError(null);
    setIsSubmitting(true);
    const result = await createFeatureRequest(userId, title.trim(), description.trim());
    setIsSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setTitle('');
    setDescription('');
    setShowForm(false);
    loadRequests();
  }, [userId, title, description, loadRequests]);

  const handleVote = useCallback(async (requestId: string, hasVoted: boolean) => {
    if (!userId || votingId) return;
    setVotingId(requestId);
    // Optimistic update
    setRequests((prev) =>
      prev.map((r) =>
        r._id === requestId
          ? { ...r, hasVoted: !hasVoted, upvoteCount: r.upvoteCount + (hasVoted ? -1 : 1) }
          : r
      )
    );
    if (hasVoted) {
      await removeFeatureRequestUpvote(userId, requestId);
    } else {
      await upvoteFeatureRequest(userId, requestId);
    }
    setVotingId(null);
  }, [userId, votingId]);

  const handleStatusChange = useCallback(async (requestId: string, status: string) => {
    if (!userId) return;
    await updateFeatureRequestStatus(userId, requestId, status);
    loadRequests();
  }, [userId, loadRequests]);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-zinc-950 border-b border-gray-100 dark:border-zinc-800 px-5 py-3 z-10">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {(['popular', 'newest'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors capitalize ${
                  sortBy === s
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-white bg-black rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Request
          </button>
        </div>

        {/* Submit form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="mt-3 p-4 bg-gray-50 dark:bg-zinc-900 rounded-xl">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Feature title"
              maxLength={100}
              className="w-full px-3 py-2 text-[13px] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-black/10"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you'd like and why it would help..."
              maxLength={2000}
              rows={3}
              className="w-full px-3 py-2 text-[13px] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-black/10 resize-none"
            />
            {error && <p className="text-[11px] text-red-500 mb-2">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setError(null); }}
                className="px-3 py-1.5 text-[12px] font-medium text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !title.trim() || !description.trim()}
                className="px-4 py-1.5 text-[12px] font-semibold text-white bg-black rounded-md hover:bg-gray-800 disabled:opacity-40 transition-colors"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* List */}
      <div className="px-5 py-3">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-black rounded-full animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[14px] font-medium text-gray-600 mb-1">No feature requests yet</p>
            <p className="text-[12px] text-gray-400">Be the first to suggest something</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => {
              const badge = STATUS_BADGES[req.status] || STATUS_BADGES.open;
              return (
                <div
                  key={req._id}
                  className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800"
                >
                  {/* Upvote button */}
                  <button
                    onClick={() => handleVote(req._id, req.hasVoted)}
                    disabled={votingId === req._id}
                    className={`flex flex-col items-center gap-0.5 pt-1 w-10 shrink-0 transition-colors ${
                      req.hasVoted
                        ? 'text-green-600'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <svg className="w-4 h-4" fill={req.hasVoted ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                    <span className="text-[12px] font-bold">{req.upvoteCount}</span>
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-[13px] font-semibold text-black dark:text-white truncate">
                        {req.title}
                      </h3>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-[12px] text-gray-500 line-clamp-2 mb-1">
                      {req.description}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-gray-400">
                      <span>{req.authorName}</span>
                      <span>{timeAgo(req.createdAt)}</span>
                    </div>
                  </div>

                  {/* Admin status dropdown */}
                  {isAdmin && (
                    <select
                      value={req.status}
                      onChange={(e) => handleStatusChange(req._id, e.target.value)}
                      className="text-[10px] bg-transparent border border-gray-200 dark:border-zinc-700 rounded px-1 py-0.5 text-gray-500 shrink-0"
                    >
                      <option value="open">Open</option>
                      <option value="planned">Planned</option>
                      <option value="in_progress">In Progress</option>
                      <option value="shipped">Shipped</option>
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
