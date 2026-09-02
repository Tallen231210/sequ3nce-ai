"use client";

import React from 'react';

interface ScheduleConnectFormProps {
  closerId: string;
  onConnected: () => void;
}

export function ScheduleConnectForm({ closerId, onConnected }: ScheduleConnectFormProps) {
  const [isWaiting, setIsWaiting] = React.useState(false);

  // The OAuth finishes server-side in the browser tab; this view only needs
  // to notice. Poll while waiting so the schedule appears without a manual
  // refresh once the user approves.
  React.useEffect(() => {
    if (!isWaiting) return;
    const id = setInterval(onConnected, 3000);
    return () => clearInterval(id);
  }, [isWaiting, onConnected]);

  function handleGoogleConnect() {
    setIsWaiting(true);
    const authUrl = `https://sequ3nce.ai/api/auth/google/authorize?closerId=${closerId}`;
    window.open(authUrl, '_blank');
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      {/* Icon */}
      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-5">
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      </div>

      <h2 className="text-lg font-semibold text-black mb-1">Connect Your Calendar</h2>
      <p className="text-[14px] text-gray-500 text-center mb-6 max-w-sm">
        See your schedule and join meetings with one click.
      </p>

      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={handleGoogleConnect}
          className="w-full py-3.5 text-[14px] font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Connect with Google Calendar
        </button>

        {isWaiting && (
          <p className="text-[12px] text-gray-500 text-center">
            Complete the sign-in in your browser — your schedule will appear
            here automatically.
          </p>
        )}
      </div>
    </div>
  );
}
