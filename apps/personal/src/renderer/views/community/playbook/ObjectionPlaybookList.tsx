import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  listPlaybookEntries,
  votePlaybookEntry,
  deletePlaybookEntry,
  updatePlaybookEntry,
  type CloserInfo,
  type PlaybookEntry,
  type PlaybookSortBy,
} from '../../../convex';
import { PlaybookEntryCard } from './PlaybookEntryCard';
import { PlaybookEntryEditor } from './PlaybookEntryEditor';

interface ObjectionPlaybookListProps {
  closerInfo?: CloserInfo;
}

// Fixed tag set — matches the server allowlist in b2cObjectionPlaybook.ts.
// Keeping this hardcoded in v1 means the filter UI is a stable row of chips.
const TAG_OPTIONS: Array<{ id: string; label: string }> = [
  { id: '', label: 'All' },
  { id: 'price', label: 'Price' },
  { id: 'timing', label: 'Timing' },
  { id: 'authority', label: 'Authority' },
  { id: 'competitor', label: 'Competitor' },
  { id: 'closing', label: 'Closing' },
  { id: 'trust', label: 'Trust' },
  { id: 'spouse', label: 'Spouse' },
  { id: 'other', label: 'Other' },
];

export function ObjectionPlaybookList({ closerInfo }: ObjectionPlaybookListProps = {}) {
  const userId = closerInfo?.b2cUserId;
  const isCoach =
    closerInfo?.badges?.includes('coach') ||
    closerInfo?.badges?.includes('founder') ||
    closerInfo?.badges?.includes('admin') ||
    false;

  const [entries, setEntries] = useState<PlaybookEntry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [tag, setTag] = useState<string>('');
  const [sortBy, setSortBy] = useState<PlaybookSortBy>('top');
  const [showEditor, setShowEditor] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; entry: PlaybookEntry }
    | null
  >(null);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(
    async (nextCursor?: number) => {
      const res = await listPlaybookEntries({
        cursor: nextCursor,
        limit: 20,
        tag: tag || undefined,
        sortBy,
        userId: userId ?? undefined,
      });
      if (!mountedRef.current) return;
      if ('error' in res) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setEntries((prev) => (nextCursor ? [...prev, ...res.items] : res.items));
      setCursor(res.nextCursor);
      setLoading(false);
    },
    [tag, sortBy, userId],
  );

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    void load();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag, sortBy]);

  // Reset scroll + list when filter/sort changes — load() replaces `entries`
  // when called with no cursor (first page).

  // ----- Vote handler (optimistic) -----
  async function handleVote(entry: PlaybookEntry) {
    if (!userId || votingId) return;
    setVotingId(entry._id);
    // Optimistic UI update — flip vote + adjust count, revert on error.
    const previousVote = entry.myVote;
    const previousCount = entry.voteCount;
    setEntries((prev) =>
      prev.map((e) =>
        e._id === entry._id
          ? {
              ...e,
              myVote: !previousVote,
              voteCount: previousCount + (previousVote ? -1 : 1),
            }
          : e,
      ),
    );
    const res = await votePlaybookEntry(entry._id, userId);
    if (res.error) {
      // Revert
      setEntries((prev) =>
        prev.map((e) =>
          e._id === entry._id
            ? { ...e, myVote: previousVote, voteCount: previousCount }
            : e,
        ),
      );
      setError(res.error);
    } else {
      // Sync with server-authoritative count (in case we missed a concurrent vote).
      setEntries((prev) =>
        prev.map((e) =>
          e._id === entry._id
            ? { ...e, myVote: res.voted, voteCount: res.voteCount }
            : e,
        ),
      );
    }
    setVotingId(null);
  }

  // ----- Coach-only actions -----
  async function handleToggleFeatured(entry: PlaybookEntry) {
    if (!userId) return;
    const nextFeatured = !entry.featured;
    // Optimistic
    setEntries((prev) =>
      prev.map((e) => (e._id === entry._id ? { ...e, featured: nextFeatured } : e)),
    );
    const res = await updatePlaybookEntry({
      entryId: entry._id,
      coachUserId: userId,
      featured: nextFeatured,
    });
    if (!res.success) {
      setEntries((prev) =>
        prev.map((e) => (e._id === entry._id ? { ...e, featured: !nextFeatured } : e)),
      );
      setError(res.error ?? 'Failed to update');
      return;
    }
    // Featured state affects ordering; reload the page so the entry jumps
    // to the top (or back into the main list) as expected.
    setLoading(true);
    void load();
  }

  async function handleDelete(entry: PlaybookEntry) {
    if (!userId) return;
    if (!confirm(`Delete this rebuttal? This can't be undone.`)) return;
    const res = await deletePlaybookEntry(entry._id, userId);
    if (!res.success) {
      setError(res.error ?? 'Failed to delete');
      return;
    }
    setEntries((prev) => prev.filter((e) => e._id !== entry._id));
  }

  function openEditor(entry: PlaybookEntry) {
    setShowEditor({ mode: 'edit', entry });
  }

  function handleEditorSaved() {
    setShowEditor(null);
    setLoading(true);
    void load();
  }

  return (
    <section>
      {/* Section header */}
      <div className="flex items-end justify-between mb-3 gap-3">
        <div>
          <h3 className="text-[13px] font-bold text-gray-900 dark:text-white">
            Objection Playbook
          </h3>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
            Community-built rebuttals from live Battle Royale rounds. Vote up
            the ones that work. {isCoach ? 'Coaches can add, annotate, and feature.' : ''}
          </p>
        </div>
        {isCoach && (
          <button
            onClick={() => setShowEditor({ mode: 'create' })}
            className="shrink-0 px-3 py-1.5 text-[12px] font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity"
          >
            + Add rebuttal
          </button>
        )}
      </div>

      {/* Filter + sort controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1 flex-wrap">
          {TAG_OPTIONS.map((opt) => (
            <button
              key={opt.id || 'all'}
              onClick={() => setTag(opt.id)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
                tag === opt.id
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
          <button
            onClick={() => setSortBy('top')}
            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
              sortBy === 'top'
                ? 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Top
          </button>
          <button
            onClick={() => setSortBy('newest')}
            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
              sortBy === 'newest'
                ? 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Newest
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-[12px] text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* List / empty / loading */}
      {loading ? (
        <div className="py-8 flex justify-center">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-black rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-gray-400 dark:text-gray-500">
          No rebuttals yet. {isCoach ? 'Add one manually or run a Battle Royale during your next coaching call.' : 'Stay tuned — your coach will build this out soon.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {entries.map((entry) => (
              <PlaybookEntryCard
                key={entry._id}
                entry={entry}
                isCoach={isCoach}
                canVote={!!userId}
                voting={votingId === entry._id}
                onVote={() => handleVote(entry)}
                onToggleFeatured={() => handleToggleFeatured(entry)}
                onEdit={() => openEditor(entry)}
                onDelete={() => handleDelete(entry)}
              />
            ))}
          </div>

          {cursor !== null && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => void load(cursor)}
                className="px-4 py-2 text-[12px] font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}

      {/* Add/edit modal (coach-only) */}
      {showEditor && isCoach && userId && (
        <PlaybookEntryEditor
          coachUserId={userId}
          coachName={closerInfo?.name || 'Coach'}
          existing={showEditor.mode === 'edit' ? showEditor.entry : undefined}
          onClose={() => setShowEditor(null)}
          onSaved={handleEditorSaved}
        />
      )}
    </section>
  );
}
