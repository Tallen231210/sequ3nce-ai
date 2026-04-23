import React from 'react';
import type { PlaybookEntry } from '../../../convex';

interface PlaybookEntryCardProps {
  entry: PlaybookEntry;
  isCoach: boolean;
  canVote: boolean;
  voting: boolean;
  onVote: () => void;
  onToggleFeatured: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function PlaybookEntryCard({
  entry,
  isCoach,
  canVote,
  voting,
  onVote,
  onToggleFeatured,
  onEdit,
  onDelete,
}: PlaybookEntryCardProps) {
  return (
    <div
      className={`group relative p-4 rounded-xl border transition-colors ${
        entry.featured
          ? 'border-amber-300 dark:border-amber-500/60 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/20 dark:to-zinc-900'
          : 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-gray-300 dark:hover:border-zinc-700'
      }`}
    >
      {entry.featured && (
        <div className="absolute -top-2 left-3 px-2 py-0.5 rounded-full bg-amber-400 text-black text-[9px] font-bold uppercase tracking-wider shadow-sm">
          Featured
        </div>
      )}

      {/* Coach-only hover controls */}
      {isCoach && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onToggleFeatured}
            title={entry.featured ? 'Unfeature' : 'Feature'}
            aria-label={entry.featured ? 'Unfeature' : 'Feature'}
            className={`p-1.5 rounded-md ${
              entry.featured
                ? 'bg-amber-400 text-black hover:bg-amber-300'
                : 'bg-white/90 dark:bg-zinc-800/90 text-gray-500 hover:text-amber-500'
            }`}
          >
            <StarIcon filled={entry.featured} className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onEdit}
            title="Edit"
            aria-label="Edit"
            className="p-1.5 rounded-md bg-white/90 dark:bg-zinc-800/90 text-gray-500 hover:text-gray-900 dark:hover:text-white"
          >
            <EditIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            aria-label="Delete"
            className="p-1.5 rounded-md bg-white/90 dark:bg-zinc-800/90 text-gray-500 hover:text-red-500"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Objection — subdued, small, quoted */}
      <div className="mb-2 pr-20">
        <div className="text-[9px] font-mono uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-0.5">
          Objection
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 italic line-clamp-2">
          &ldquo;{entry.objectionText}&rdquo;
        </div>
      </div>

      {/* Rebuttal — prominent */}
      <div className="mb-3">
        <div className="text-[9px] font-mono uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
          Rebuttal
        </div>
        <div className="text-[13.5px] leading-snug text-gray-900 dark:text-white whitespace-pre-wrap">
          {entry.rebuttalText}
        </div>
      </div>

      {/* Coach annotation (if present) */}
      {entry.coachAnnotation && (
        <div className="mb-3 pl-3 border-l-2 border-gray-300 dark:border-zinc-700">
          <div className="text-[9px] font-mono uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-0.5">
            Coach's note
          </div>
          <div className="text-[12px] text-gray-600 dark:text-gray-300 leading-snug">
            {entry.coachAnnotation}
          </div>
        </div>
      )}

      {/* Tags */}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer — vote + author/date */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-zinc-800">
        <div className="text-[10px] text-gray-400 dark:text-gray-500">
          {entry.authorName} · {formatDate(entry.createdAt)}
        </div>
        <button
          onClick={onVote}
          disabled={!canVote || voting}
          className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
            entry.myVote
              ? 'bg-green-600 text-white hover:bg-green-500'
              : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title={entry.myVote ? 'Remove your vote' : 'Upvote'}
          aria-label={entry.myVote ? 'Remove your vote' : 'Upvote'}
        >
          <UpvoteIcon className="w-3 h-3" />
          <span className="text-[11px] font-bold tabular-nums">{entry.voteCount}</span>
        </button>
      </div>
    </div>
  );
}

// ---- icons ----
const strokeProps = {
  fill: 'none' as const,
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 1.75,
};

function UpvoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...strokeProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
    </svg>
  );
}
function StarIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
    </svg>
  );
}
function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...strokeProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...strokeProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}
