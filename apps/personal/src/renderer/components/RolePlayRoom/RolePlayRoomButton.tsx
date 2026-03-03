// Role Play Room button with participant count badge
// Matches the styling of the Training button

import React from 'react';

interface RolePlayRoomButtonProps {
  participantCount: number;
  onClick: () => void;
  disabled?: boolean;
}

export function RolePlayRoomButton({
  participantCount,
  onClick,
  disabled = false,
}: RolePlayRoomButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`mt-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
        disabled
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
      }`}
    >
      <span className="flex items-center gap-1.5">
        <span>Role Play Room</span>
        {participantCount > 0 && (
          <span className="font-semibold">({participantCount})</span>
        )}
      </span>
    </button>
  );
}
