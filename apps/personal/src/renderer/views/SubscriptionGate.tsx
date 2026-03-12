import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CloserInfo } from '../convex';
import { createB2CCheckout, createB2CPortal, getSubscriptionStatus } from '../convex';
import logoImage from '../../assets/logo.png';

interface SubscriptionGateProps {
  closerInfo: CloserInfo;
  onSubscribed: (updatedInfo: CloserInfo) => void;
  onLogout: () => void;
}

const FEATURES = [
  'AI-powered call analysis',
  'Performance stats & tracking',
  'Public profile with verified stats',
  'Job board access',
  'Community & networking',
];

export function SubscriptionGate({ closerInfo, onSubscribed, onLogout }: SubscriptionGateProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const checkStatus = useCallback(async () => {
    if (!closerInfo.b2cUserId) return;
    const result = await getSubscriptionStatus(closerInfo.b2cUserId);
    if (!mountedRef.current) return;

    if (result.subscriptionStatus === 'active') {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      setIsPolling(false);
      onSubscribed({ ...closerInfo, subscriptionStatus: 'active' });
    }
  }, [closerInfo, onSubscribed]);

  const startPolling = useCallback(() => {
    setIsPolling(true);
    pollCountRef.current = 0;

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      pollCountRef.current++;
      // Stop after 2 minutes (40 polls at 3s intervals)
      if (pollCountRef.current > 40) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        if (mountedRef.current) setIsPolling(false);
        return;
      }
      await checkStatus();
    }, 3000);
  }, [checkStatus]);

  async function handleSubscribe() {
    if (!closerInfo.b2cUserId) {
      setError('Account error. Please log out and log back in.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await createB2CCheckout(closerInfo.email, closerInfo.b2cUserId);

    if (!mountedRef.current) return;
    setIsLoading(false);

    if (result.error || !result.url) {
      setError(result.error || 'Failed to start checkout');
      return;
    }

    // Open Stripe Checkout in system browser (setWindowOpenHandler routes to shell.openExternal)
    window.open(result.url, '_blank');

    // Start polling for subscription activation
    startPolling();
  }

  async function handleManageSubscription() {
    if (!closerInfo.b2cUserId) return;
    setIsLoading(true);
    setError(null);

    const result = await createB2CPortal(closerInfo.b2cUserId);

    if (!mountedRef.current) return;
    setIsLoading(false);

    if (result.error || !result.url) {
      setError(result.error || 'Failed to open billing portal');
      return;
    }

    window.open(result.url, '_blank');
  }

  async function handleRefresh() {
    setError(null);
    await checkStatus();
  }

  const isPastDue = closerInfo.subscriptionStatus === 'past_due';
  const isCancelled = closerInfo.subscriptionStatus === 'cancelled';

  return (
    <div className="h-screen flex flex-col bg-white text-black">
      {/* Title bar */}
      <div className="titlebar h-8 border-b border-gray-200 shrink-0" />

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Logo */}
        <img src={logoImage} alt="Sequ3nce Personal" className="h-12 mb-6 dark-invert" />

        {/* Heading */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
          {isPastDue
            ? 'Payment Issue'
            : isCancelled
              ? 'Subscription Inactive'
              : 'Unlock Sequ3nce Personal'}
        </h1>
        <p className="text-gray-500 text-sm mb-8 text-center max-w-sm">
          {isPastDue
            ? 'Your subscription payment failed. Please update your payment method to continue.'
            : isCancelled
              ? 'Your subscription has been cancelled. Resubscribe to regain access.'
              : 'Get access to all the tools you need to crush your sales goals.'}
        </p>

        {/* Features */}
        <div className="mb-8 space-y-3">
          {FEATURES.map((feature) => (
            <div key={feature} className="flex items-center gap-3">
              <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-gray-700">{feature}</span>
            </div>
          ))}
        </div>

        {/* Price card */}
        <div className="w-full max-w-xs bg-gray-50 border border-gray-200 rounded-xl p-6 mb-6 text-center">
          <div className="mb-4">
            <span className="text-3xl font-bold text-gray-900">$129.99</span>
            <span className="text-gray-500 text-sm">/month</span>
          </div>

          {isPastDue ? (
            <button
              onClick={handleManageSubscription}
              disabled={isLoading}
              className="w-full py-3 px-4 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Opening...' : 'Update Payment Method'}
            </button>
          ) : (
            <button
              onClick={handleSubscribe}
              disabled={isLoading || isPolling}
              className="w-full py-3 px-4 text-sm font-semibold text-white bg-black rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading
                ? 'Opening checkout...'
                : isPolling
                  ? 'Waiting for payment...'
                  : isCancelled
                    ? 'Resubscribe'
                    : 'Subscribe Now'}
            </button>
          )}
        </div>

        {/* Polling indicator */}
        {isPolling && (
          <div className="flex items-center gap-2 mb-4">
            <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-500">Checking payment status...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 mb-4 text-center max-w-xs">{error}</p>
        )}

        {/* Secondary actions */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleRefresh}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Already subscribed? Refresh status
          </button>
          <button
            onClick={onLogout}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
