import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CloserInfo, StatsVerificationRequest } from '../../convex';
import { listVerificationRequests } from '../../convex';
import { VerificationRequestCard } from './VerificationRequestCard';

const POLL_MS = 15_000;

type TabFilter = 'pending' | 'approved' | 'rejected';

interface StatsVerificationReviewViewProps {
  closerInfo: CloserInfo;
}

export function StatsVerificationReviewView({ closerInfo }: StatsVerificationReviewViewProps) {
  const founderId = closerInfo.b2cUserId || '';
  const [tab, setTab] = useState<TabFilter>('pending');
  const [requests, setRequests] = useState<StatsVerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!founderId) return;
    const res = await listVerificationRequests(founderId, tab, 50);
    if (!mountedRef.current) return;
    if ('requests' in res) setRequests(res.requests);
    setLoading(false);
  }, [founderId, tab]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    void load();
    const interval = setInterval(() => {
      if (mountedRef.current) void load();
    }, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [load]);

  if (!founderId) {
    return (
      <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
        Unable to load — please log out and back in.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Verification Review</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Closers submit pay stubs + CRM screenshots to claim &ldquo;Verified by Sequ3nce&rdquo;. Approve or reject below.
        </p>
      </div>

      {/* Tab filter */}
      <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
        {(['pending', 'approved', 'rejected'] as TabFilter[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
              tab === t
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center text-xs text-gray-400 dark:text-gray-500">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No {tab} requests.
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <VerificationRequestCard
              key={r.requestId}
              founderId={founderId}
              request={r}
              onActionComplete={() => { void load(); }}
              onOpenImage={setLightboxUrl}
            />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Evidence"
            className="max-w-full max-h-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-black/40 rounded-full"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
