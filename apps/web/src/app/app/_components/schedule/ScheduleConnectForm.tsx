"use client";

import React, { useState } from 'react';

interface ScheduleConnectFormProps {
  icsUrl: string;
  onIcsUrlChange: (url: string) => void;
  onConnect: () => void;
  isConnecting: boolean;
  connectError: string | null;
}

export function ScheduleConnectForm({
  icsUrl,
  onIcsUrlChange,
  onConnect,
  isConnecting,
  connectError,
}: ScheduleConnectFormProps) {
  const [showHelp, setShowHelp] = useState(false);

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
        {/* Label */}
        <label className="text-[12px] font-medium text-gray-400">ICS Feed URL</label>

        {/* Input */}
        <input
          type="text"
          value={icsUrl}
          onChange={(e) => onIcsUrlChange(e.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/..."
          className="w-full px-3.5 py-3 text-[14px] border border-gray-200 rounded-xl bg-white text-black focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400"
        />

        {connectError && (
          <p className="text-[12px] text-red-600">{connectError}</p>
        )}

        {/* Connect Button */}
        <button
          onClick={onConnect}
          disabled={!icsUrl.trim() || isConnecting}
          className={`w-full py-3.5 text-[14px] font-semibold rounded-xl transition-colors ${
            icsUrl.trim() && !isConnecting
              ? 'bg-black text-white hover:bg-gray-800'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isConnecting ? 'Connecting...' : 'Connect Calendar'}
        </button>

        {/* Help Toggle */}
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="w-full flex items-center justify-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
          </svg>
          How do I find my ICS URL?
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${showHelp ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {/* Help Content — Google Calendar only */}
        {showHelp && (
          <div className="p-4 bg-white rounded-xl border border-gray-100 text-[12px] text-gray-500">
            <p className="font-semibold text-black text-[13px] mb-2">Google Calendar</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-500">
              <li>Go to calendar.google.com</li>
              <li>Click the three dots next to your calendar</li>
              <li>Click "Settings and sharing"</li>
              <li>Scroll to "Integrate calendar"</li>
              <li>Copy "Secret address in iCal format"</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
