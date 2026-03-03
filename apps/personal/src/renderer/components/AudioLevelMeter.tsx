import React from 'react';

interface AudioLevelMeterProps {
  level: number; // 0-1
  isActive: boolean;
}

export function AudioLevelMeter({ level, isActive }: AudioLevelMeterProps) {
  // Clamp level between 0 and 1
  const clampedLevel = Math.min(1, Math.max(0, level));

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-500">Audio Level</span>
        {isActive && (
          <span className="text-xs text-gray-500 tabular-nums">
            {Math.round(clampedLevel * 100)}%
          </span>
        )}
      </div>

      {/* Minimal horizontal bar meter */}
      <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-75 ${
            isActive ? 'bg-black' : 'bg-gray-200'
          }`}
          style={{ width: `${isActive ? clampedLevel * 100 : 0}%` }}
        />
      </div>

      {!isActive && (
        <p className="text-xs text-gray-400 text-center mt-1">
          Start recording to see audio levels
        </p>
      )}
    </div>
  );
}
