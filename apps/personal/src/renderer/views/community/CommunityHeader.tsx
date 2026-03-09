import React from 'react';

interface CommunityHeaderProps {
  title: string;
  description?: string;
  onSearchToggle: () => void;
  onMembersToggle: () => void;
  showPinFilter?: boolean;
  onPinFilterToggle?: () => void;
}

export function CommunityHeader({
  title,
  description,
  onSearchToggle,
  onMembersToggle,
  showPinFilter,
  onPinFilterToggle,
}: CommunityHeaderProps) {
  return (
    <div className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b border-gray-200 dark:border-zinc-700">
      {/* Left: title + description */}
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
            {description}
          </p>
        )}
      </div>

      {/* Right: action icons */}
      <div className="flex items-center gap-1 flex-shrink-0 ml-3">
        {/* Pin filter (channels only) */}
        {showPinFilter && onPinFilterToggle && (
          <button
            onClick={onPinFilterToggle}
            className="p-2 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            title="Filter pinned posts"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
            </svg>
          </button>
        )}

        {/* Search */}
        <button
          onClick={onSearchToggle}
          className="p-2 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          title="Search"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
        </button>

        {/* Members */}
        <button
          onClick={onMembersToggle}
          className="p-2 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          title="Toggle members panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
