import React, { useState } from 'react';

interface RefgrowWidgetProps {
  email: string;
}

export function RefgrowWidget({ email }: RefgrowWidgetProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const iframeUrl = `https://www.sequ3nce.ai/affiliate?email=${encodeURIComponent(email)}`;

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <p className="text-sm text-gray-500 mb-1">Failed to load affiliate dashboard</p>
        <p className="text-xs text-gray-400 mb-4">Please check your internet connection</p>
        <button
          onClick={() => { setLoadError(false); setIsLoading(true); }}
          className="px-4 py-2 text-xs font-medium text-white bg-black rounded-lg hover:bg-gray-800 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin mb-3" />
          <p className="text-xs text-gray-400">Loading affiliate dashboard...</p>
        </div>
      )}
      <iframe
        src={iframeUrl}
        className="w-full h-full border-0"
        onLoad={() => setIsLoading(false)}
        onError={() => { setIsLoading(false); setLoadError(true); }}
        style={{ minHeight: '600px' }}
        allow="clipboard-write"
      />
    </div>
  );
}
