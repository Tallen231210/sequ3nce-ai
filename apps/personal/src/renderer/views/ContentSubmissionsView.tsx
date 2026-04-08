import React, { useState, useEffect, useRef } from 'react';
import type { CloserInfo, ContentSubmission } from '../convex';
import { getMyContentSubmissions } from '../convex';
import { ContentSubmitModal } from './ContentSubmitModal';
import { STATUS_STYLES, CATEGORY_LABELS, formatSubmissionDate } from './contentConstants';
import { RefgrowWidget } from './RefgrowWidget';

type RewardsTab = 'creator-cash' | 'affiliate';

interface ContentSubmissionsViewProps {
  closerInfo: CloserInfo;
}

export function ContentSubmissionsView({ closerInfo }: ContentSubmissionsViewProps) {
  const userId = closerInfo.b2cUserId || '';

  const [activeTab, setActiveTab] = useState<RewardsTab>('creator-cash');
  const [submissions, setSubmissions] = useState<ContentSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTestimonialModal, setShowTestimonialModal] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (userId) loadSubmissions();
  }, [userId]);

  const loadSubmissions = async () => {
    setIsLoading(true);
    const result = await getMyContentSubmissions(userId);
    if (mountedRef.current) {
      setSubmissions(result);
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Rewards</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Earn money through content submissions and referrals
        </p>
      </div>

      {/* Tab bar */}
      <div className="px-6 flex border-b border-gray-200 dark:border-gray-700">
        {([
          { id: 'creator-cash' as const, label: 'Creator Cash' },
          { id: 'affiliate' as const, label: 'Affiliate Program' },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black dark:bg-white" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'creator-cash' && (
        <>
          {/* Submit button */}
          <div className="px-6 pt-4 pb-2 flex justify-end">
            <button
              onClick={() => setShowTestimonialModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Submit Testimonial
            </button>
          </div>

          {/* Info banner */}
          <div className="mx-6 mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Earn $20-30 per approved clip</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                  Submit your best call clips or record a testimonial. Approved content earns you cash via your preferred payment method.
                  Go to the <strong>Highlights</strong> tab to submit clips from your saved moments.
                </p>
              </div>
            </div>
          </div>

          {/* Submissions list */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-sm text-gray-400 dark:text-gray-500">Loading submissions...</div>
              </div>
            ) : submissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">No submissions yet</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                  Go to <strong>Highlights</strong> to submit a clip, or click <strong>"Submit Testimonial"</strong> above to record a video testimonial.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {submissions.map((sub) => {
                  const status = STATUS_STYLES[sub.status] || STATUS_STYLES.pending;
                  return (
                    <div
                      key={sub._id}
                      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${status.bg} ${status.text}`}>
                              {status.label}
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 uppercase">
                              {sub.type}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">
                              {CATEGORY_LABELS[sub.category] || sub.category}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {sub.label}
                          </div>
                          {sub.note && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                              {sub.note}
                            </p>
                          )}
                          {sub.rejectionReason && (
                            <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                              Reason: {sub.rejectionReason}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-[10px] text-gray-400 dark:text-gray-500">
                            {formatSubmissionDate(sub.createdAt)}
                          </div>
                          {sub.paidAmount != null && (
                            <div className="text-sm font-bold text-green-600 dark:text-green-400 mt-0.5">
                              ${sub.paidAmount}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Testimonial submit modal */}
          {showTestimonialModal && (
            <ContentSubmitModal
              type="testimonial"
              userId={userId}
              onClose={() => setShowTestimonialModal(false)}
              onSubmitted={() => {
                setShowTestimonialModal(false);
                loadSubmissions();
              }}
            />
          )}
        </>
      )}

      {activeTab === 'affiliate' && (
        <div className="flex-1 overflow-y-auto">
          <RefgrowWidget email={closerInfo.email} />
        </div>
      )}
    </div>
  );
}
