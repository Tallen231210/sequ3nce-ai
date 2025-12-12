import React from 'react';
import { AudioStatus } from '../types/electron';

interface StatusIndicatorProps {
  status: AudioStatus;
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'idle':
        return {
          dotColor: 'bg-gray-400',
          text: 'Ready to Record',
          textColor: 'text-gray-500',
          icon: (
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          ),
        };
      case 'connecting':
        return {
          dotColor: 'bg-yellow-500',
          text: 'Connecting...',
          textColor: 'text-gray-600',
          icon: (
            <svg className="w-6 h-6 text-gray-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ),
        };
      case 'capturing':
        return {
          dotColor: 'bg-green-500',
          text: 'Recording',
          textColor: 'text-gray-900',
          icon: (
            <div className="relative">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <div className="absolute inset-0 w-3 h-3 bg-green-500 rounded-full animate-ping opacity-50" />
            </div>
          ),
        };
      case 'error':
        return {
          dotColor: 'bg-red-500',
          text: 'Error',
          textColor: 'text-red-600',
          icon: (
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="flex flex-col items-center">
      {/* Clean minimal status display */}
      <div className="w-16 h-16 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center transition-all duration-150">
        {config.icon}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${config.dotColor} transition-colors duration-150`} />
        <p className={`text-sm font-medium ${config.textColor} transition-colors duration-150`}>{config.text}</p>
      </div>
    </div>
  );
}
