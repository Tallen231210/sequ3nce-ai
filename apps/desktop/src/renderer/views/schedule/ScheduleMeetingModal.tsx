import React from 'react';
import type { CalendarEvent, CloserInfo } from '../../convex';
import { detectPlatform, formatTime } from './scheduleUtils';
import { PreCallBriefingPanel } from './PreCallBriefingPanel';

interface ScheduleMeetingModalProps {
  event: CalendarEvent;
  closerInfo: CloserInfo;
  onConfirm: (event: CalendarEvent) => void;
  onClose: () => void;
}

export function ScheduleMeetingModal({
  event,
  closerInfo,
  onConfirm,
  onClose,
}: ScheduleMeetingModalProps) {
  const platform = detectPlatform(event.meetingUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-[420px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with close button */}
        <div className="flex justify-end px-4 pt-4">
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-[11px] font-semibold transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col items-center px-6 pb-6">
          {/* Video icon */}
          <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
          </div>

          {/* Title */}
          <h3 className="text-[18px] font-semibold text-black dark:text-white text-center mb-2 leading-tight line-clamp-3">
            {event.title}
          </h3>

          {/* Time */}
          <p className="text-[14px] text-gray-500 dark:text-gray-400 font-mono mb-3">
            {event.isAllDay
              ? 'All day'
              : `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`}
          </p>

          {/* Platform badge */}
          {platform && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-md mb-5">
              <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
              <span className="text-[13px] font-medium text-blue-600 dark:text-blue-400">
                {platform.label}
              </span>
            </div>
          )}

          {/* Pre-call briefing — silent skip when no qualifying setter call */}
          <PreCallBriefingPanel
            closerInfo={closerInfo}
            calendarEventId={event._id}
          />

          {/* Actions */}
          {event.meetingUrl ? (
            <div className="w-full space-y-2">
              <button
                onClick={() => onConfirm(event)}
                className="w-full flex items-center justify-center gap-2 py-3.5 text-[14px] font-semibold text-white bg-black dark:bg-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                </svg>
                Join & Start Meeting
              </button>
              <button
                onClick={onClose}
                className="w-full py-2 text-[14px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <p className="text-[13px] text-gray-400 dark:text-gray-500 italic">
              No video meeting link found
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
