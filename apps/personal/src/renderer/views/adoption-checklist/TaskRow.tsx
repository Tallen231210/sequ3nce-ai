import React from 'react';

interface TaskRowProps {
  /** Whether the task is complete — drives the checkmark icon + dimmed style. */
  complete: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** When provided, renders a CTA button on the right. Hidden when complete. */
  cta?: { label: string; onClick: () => void };
  /** Suppresses the left-side circle/checkmark indicator. Used by Earn rows
   *  which are perpetual opportunities (no meaningful "complete" state) —
   *  an always-empty circle next to a Money Bells row reads as misleading
   *  noise. Setup rows leave this false to keep the checklist affordance. */
  hideStatus?: boolean;
}

// Single row used by both Setup and Earn sections. Visually simple: a
// checkbox/checkmark on the left (suppressed for Earn rows), title +
// optional description in the middle, and an optional right-aligned CTA.
// Completed rows dim and lose the CTA.
export function TaskRow({ complete, title, description, cta, hideStatus }: TaskRowProps) {
  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg ${
        complete ? 'opacity-50' : 'hover:bg-gray-50'
      } transition-colors`}
    >
      {!hideStatus && (
        <div className="shrink-0 mt-0.5">
          {complete ? (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </span>
          ) : (
            <span className="inline-block w-4 h-4 rounded-full border-2 border-gray-300" />
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-semibold text-gray-900 ${complete ? 'line-through' : ''}`}>
          {title}
        </div>
        {description && (
          <div className="text-[11px] text-gray-500 leading-snug mt-0.5">
            {description}
          </div>
        )}
      </div>
      {cta && !complete && (
        <button
          onClick={cta.onClick}
          className="shrink-0 px-2 py-1 text-[11px] font-semibold text-black bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
