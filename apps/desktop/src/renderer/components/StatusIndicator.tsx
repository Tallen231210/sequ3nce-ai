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
          color: 'bg-zinc-700',
          ringColor: 'ring-zinc-600',
          text: 'Ready',
          icon: (
            <svg className="w-8 h-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          ),
        };
      case 'connecting':
        return {
          color: 'bg-yellow-600',
          ringColor: 'ring-yellow-500',
          text: 'Connecting...',
          icon: (
            <svg className="w-8 h-8 text-yellow-300 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ),
        };
      case 'capturing':
        return {
          color: 'bg-green-600',
          ringColor: 'ring-green-500',
          text: 'Recording',
          icon: (
            <div className="recording-indicator">
              <svg className="w-8 h-8 text-green-300" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" />
              </svg>
            </div>
          ),
        };
      case 'error':
        return {
          color: 'bg-red-600',
          ringColor: 'ring-red-500',
          text: 'Error',
          icon: (
            <svg className="w-8 h-8 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="flex flex-col items-center">
      <div className={`w-20 h-20 rounded-full ${config.color} ring-4 ${config.ringColor} flex items-center justify-center transition-all duration-300`}>
        {config.icon}
      </div>
      <p className="mt-3 text-sm font-medium text-zinc-300">{config.text}</p>
    </div>
  );
}
