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
        relative w-16 h-16 rounded-full transition-all duration-150
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white
        ${isRecording
          ? 'bg-black hover:bg-gray-800 focus:ring-black'
          : 'bg-white border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 focus:ring-gray-400'
        }
        ${isConnecting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {/* Inner shape */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isRecording ? (
          // Stop icon (rounded square)
          <div className="w-5 h-5 bg-white rounded-[3px]" />
        ) : (
          // Record icon (filled circle)
          <div className="w-5 h-5 bg-black rounded-full" />
        )}
      </div>

      {/* Subtle pulse ring when recording */}
      {isRecording && (
        <div className="absolute inset-0 rounded-full bg-black animate-ping opacity-10" />
      )}
    </button>
  );
}
