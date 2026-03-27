import React, { useState, useEffect, useRef } from 'react';
import type { CloserInfo, ContentSubmission } from '../convex';
import {
  getAllContentSubmissions,
  reviewContentSubmission,
  markContentSubmissionPaid,
} from '../convex';
import { STATUS_STYLES, CATEGORY_LABELS, formatSubmissionDate } from './contentConstants';

interface ContentReviewViewProps {
  closerInfo: CloserInfo;
}

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected' | 'paid';

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'paid', label: 'Paid' },
];

const PAID_PRESETS = [20, 25, 30];

export function ContentReviewView({ closerInfo }: ContentReviewViewProps) {
  const reviewerUserId = closerInfo.b2cUserId || '';

  const [submissions, setSubmissions] = useState<ContentSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('pending');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (reviewerUserId) loadSubmissions();
  }, [reviewerUserId, filter]);

  const loadSubmissions = async () => {
    setIsLoading(true);
    const statusParam = filter === 'all' ? undefined : filter;
    const result = await getAllContentSubmissions(reviewerUserId, statusParam);
    if (mountedRef.current) {
      setSubmissions(result);
      setIsLoading(false);
    }
  };

  const handleApprove = async (submissionId: string) => {
    setActionLoading(submissionId);
    const result = await reviewContentSubmission(submissionId, reviewerUserId, 'approve');
    if (mountedRef.current) {
      setActionLoading(null);
      if (result.success) loadSubmissions();
    }
  };

  const handleReject = async (submissionId: string) => {
    if (!rejectionReason.trim()) return;
    setActionLoading(submissionId);
    const result = await reviewContentSubmission(submissionId, reviewerUserId, 'reject', rejectionReason.trim());
    if (mountedRef.current) {
      setActionLoading(null);
      setRejectingId(null);
      setRejectionReason('');
      if (result.success) loadSubmissions();
    }
  };

  const handleMarkPaid = async (submissionId: string, amount: number) => {
    setActionLoading(submissionId);
    const result = await markContentSubmissionPaid(submissionId, reviewerUserId, amount);
    if (mountedRef.current) {
      setActionLoading(null);
      if (result.success) loadSubmissions();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Content Review</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Review and manage content submissions
        </p>
      </div>

      {/* Filter tabs */}
      <div className="px-6 pb-4">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === tab.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-sm text-gray-400 dark:text-gray-500">Loading...</div>
          </div>
        ) : submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No {filter === 'all' ? '' : filter} submissions found.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((sub) => (
              <SubmissionCard
                key={sub._id}
                submission={sub}
                isActionLoading={actionLoading === sub._id}
                isRejecting={rejectingId === sub._id}
                rejectionReason={rejectionReason}
                onApprove={() => handleApprove(sub._id)}
                onStartReject={() => { setRejectingId(sub._id); setRejectionReason(''); }}
                onCancelReject={() => setRejectingId(null)}
                onReject={() => handleReject(sub._id)}
                onRejectionReasonChange={setRejectionReason}
                onMarkPaid={(amount) => handleMarkPaid(sub._id, amount)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SubmissionCardProps {
  submission: ContentSubmission;
  isActionLoading: boolean;
  isRejecting: boolean;
  rejectionReason: string;
  onApprove: () => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onReject: () => void;
  onRejectionReasonChange: (reason: string) => void;
  onMarkPaid: (amount: number) => void;
}

function SubmissionCard({
  submission: sub,
  isActionLoading,
  isRejecting,
  rejectionReason,
  onApprove,
  onStartReject,
  onCancelReject,
  onReject,
  onRejectionReasonChange,
  onMarkPaid,
}: SubmissionCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const videoSrc = sub.recordingUrl
    ? sub.startTime != null && sub.endTime != null
      ? `${sub.recordingUrl}#t=${sub.startTime},${sub.endTime}`
      : sub.recordingUrl
    : null;

  const handlePlayToggle = () => {
    if (!videoRef.current || !videoSrc) return;
    if (isPlaying) videoRef.current.pause();
    else videoRef.current.play();
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      {/* Video player for clips */}
      {sub.type === 'clip' && videoSrc && (
        <div className="relative aspect-video bg-black cursor-pointer" onClick={handlePlayToggle}>
          <video
            ref={videoRef}
            src={videoSrc}
            className="w-full h-full object-contain"
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
          {sub.blurRegion && sub.blurRegion !== 'none' && (
            <div
              className="absolute top-0 bottom-0"
              style={{
                [sub.blurRegion === 'left' ? 'left' : 'right']: 0,
                width: '50%',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                backgroundColor: 'rgba(255,255,255,0.15)',
              }}
            />
          )}
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
                <div className="w-0 h-0 ml-1 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent border-l-[16px] border-l-black" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {(() => {
                const style = STATUS_STYLES[sub.status] || STATUS_STYLES.pending;
                return (
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                );
              })()}
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 uppercase">
                {sub.type}
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{CATEGORY_LABELS[sub.category] || sub.category}</span>
            </div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">{sub.label}</div>
            {sub.submitterName && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                By {sub.submitterName} {sub.submitterEmail ? `(${sub.submitterEmail})` : ''}
              </div>
            )}
          </div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
            {formatSubmissionDate(sub.createdAt)}
          </div>
        </div>

        {sub.note && (
          <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
            {sub.note}
          </p>
        )}

        {/* Payment info */}
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Payment: <span className="font-medium">{sub.paymentMethod}</span> &mdash; {sub.paymentHandle}
          {sub.paidAmount != null && (
            <span className="ml-2 font-bold text-green-600 dark:text-green-400">${sub.paidAmount} paid</span>
          )}
        </div>

        {/* Testimonial video link */}
        {sub.type === 'testimonial' && sub.videoUrl && (
          <a
            href={sub.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            View Video
          </a>
        )}

        {sub.rejectionReason && (
          <p className="text-xs text-red-500 dark:text-red-400">
            Rejection reason: {sub.rejectionReason}
          </p>
        )}

        {/* Action buttons */}
        {sub.status === 'pending' && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            {isRejecting ? (
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={(e) => onRejectionReasonChange(e.target.value.slice(0, 300))}
                  placeholder="Reason for rejection..."
                  className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={onReject}
                    disabled={isActionLoading || !rejectionReason.trim()}
                    className="px-3 py-1 text-xs font-medium bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-40 transition-colors"
                  >
                    {isActionLoading ? 'Rejecting...' : 'Confirm Reject'}
                  </button>
                  <button
                    onClick={onCancelReject}
                    className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={onApprove}
                  disabled={isActionLoading}
                  className="px-4 py-1.5 text-xs font-semibold bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-40 transition-colors"
                >
                  {isActionLoading ? 'Approving...' : 'Approve'}
                </button>
                <button
                  onClick={onStartReject}
                  disabled={isActionLoading}
                  className="px-4 py-1.5 text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-40 transition-colors"
                >
                  Reject
                </button>
              </>
            )}
          </div>
        )}

        {sub.status === 'approved' && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Mark Paid:</span>
            {PAID_PRESETS.map((amount) => (
              <button
                key={amount}
                onClick={() => onMarkPaid(amount)}
                disabled={isActionLoading}
                className="px-3 py-1 text-xs font-semibold bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-40 transition-colors"
              >
                {isActionLoading ? '...' : `$${amount}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
