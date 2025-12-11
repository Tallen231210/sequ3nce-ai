import React from 'react';

interface AudioLevelMeterProps {
  level: number; // 0-1
  isActive: boolean;
}

export function AudioLevelMeter({ level, isActive }: AudioLevelMeterProps) {
  // Create 20 bars for the meter
  const bars = 20;
  const activeBarCount = Math.floor(level * bars);

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs text-zinc-500">Audio Level</span>
        {isActive && (
          <span className="text-xs text-zinc-500">
            {Math.round(level * 100)}%
          </span>
        )}
      </div>

      <div className="flex gap-0.5 h-4 items-end">
        {Array.from({ length: bars }).map((_, i) => {
          const isActiveBar = isActive && i < activeBarCount;
          const barHeight = 4 + (i / bars) * 12; // Bars get taller from left to right

          // Color gradient: green -> yellow -> red
          let barColor = 'bg-zinc-800';
          if (isActiveBar) {
            if (i < bars * 0.6) {
              barColor = 'bg-green-500';
            } else if (i < bars * 0.8) {
              barColor = 'bg-yellow-500';
            } else {
              barColor = 'bg-red-500';
            }
          }

          return (
            <div
              key={i}
              className={`flex-1 rounded-sm transition-all duration-75 ${barColor}`}
              style={{ height: `${barHeight}px` }}
            />
          );
        })}
      </div>

      {!isActive && (
        <p className="text-xs text-zinc-600 text-center mt-1">
          Start recording to see audio levels
        </p>
      )}
    </div>
  );
}
