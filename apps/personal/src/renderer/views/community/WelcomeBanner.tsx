import React, { useState } from 'react';

const STORAGE_KEY = 'community_welcome_dismissed';

interface WelcomeBannerProps {
  onGoToGeneral: () => void;
}

export function WelcomeBanner({ onGoToGeneral }: WelcomeBannerProps) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true'
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="relative mb-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <h3 className="font-bold text-lg text-gray-900 dark:text-white">Welcome to the Sequ3nce Community!</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Connect with other closers, share wins, and sharpen your skills together.
      </p>
      <button
        onClick={() => { onGoToGeneral(); handleDismiss(); }}
        className="mt-3 px-4 py-1.5 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
      >
        Introduce yourself in #general
      </button>
    </div>
  );
}
