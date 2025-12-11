import React from 'react';

interface RecordButtonProps {
  isRecording: boolean;
  isConnecting: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function RecordButton({ isRecording, isConnecting, onStart, onStop }: RecordButtonProps) {
  const handleClick = () => {
    if (isConnecting) return;
    if (isRecording) {
      onStop();
    } else {
      onStart();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isConnecting}
      className={`
        relative w-16 h-16 rounded-full transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black
        ${isRecording
          ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
          : 'bg-white hover:bg-zinc-200 focus:ring-white'
        }
        ${isConnecting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {/* Inner shape */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isRecording ? (
          // Stop icon (square)
          <div className="w-6 h-6 bg-white rounded-sm" />
        ) : (
          // Record icon (circle)
          <div className="w-6 h-6 bg-red-600 rounded-full" />
        )}
      </div>

      {/* Pulse ring when recording */}
      {isRecording && (
        <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-25" />
      )}
    </button>
  );
}
