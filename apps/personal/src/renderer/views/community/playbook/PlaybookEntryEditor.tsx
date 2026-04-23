import React, { useState } from 'react';
import {
  createPlaybookEntry,
  updatePlaybookEntry,
  type PlaybookEntry,
} from '../../../convex';

interface PlaybookEntryEditorProps {
  coachUserId: string;
  coachName: string;
  /** When present, the modal is in edit mode. */
  existing?: PlaybookEntry;
  onClose: () => void;
  onSaved: () => void;
}

// Matches the server-allowed tag set in b2cObjectionPlaybook.ts.
const TAG_CHOICES: Array<{ id: string; label: string }> = [
  { id: 'price', label: 'Price' },
  { id: 'timing', label: 'Timing' },
  { id: 'authority', label: 'Authority' },
  { id: 'competitor', label: 'Competitor' },
  { id: 'closing', label: 'Closing' },
  { id: 'trust', label: 'Trust' },
  { id: 'spouse', label: 'Spouse' },
  { id: 'other', label: 'Other' },
];

const MAX_REBUTTAL = 1000;
const MAX_OBJECTION = 500;
const MAX_ANNOTATION = 500;

export function PlaybookEntryEditor({
  coachUserId,
  coachName,
  existing,
  onClose,
  onSaved,
}: PlaybookEntryEditorProps) {
  const isEdit = !!existing;
  const [objection, setObjection] = useState(existing?.objectionText ?? '');
  const [rebuttal, setRebuttal] = useState(existing?.rebuttalText ?? '');
  const [annotation, setAnnotation] = useState(existing?.coachAnnotation ?? '');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(
    () => new Set(existing?.tags ?? []),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    const obj = objection.trim();
    const reb = rebuttal.trim();
    if (!obj) { setError('Objection is required'); return; }
    if (!reb) { setError('Rebuttal is required'); return; }
    if (obj.length > MAX_OBJECTION) { setError(`Objection must be ${MAX_OBJECTION} chars or fewer`); return; }
    if (reb.length > MAX_REBUTTAL) { setError(`Rebuttal must be ${MAX_REBUTTAL} chars or fewer`); return; }

    setSaving(true);
    const tags = Array.from(selectedTags);
    if (isEdit && existing) {
      const res = await updatePlaybookEntry({
        entryId: existing._id,
        coachUserId,
        objectionText: obj,
        rebuttalText: reb,
        coachAnnotation: annotation.trim(),
        tags,
      });
      setSaving(false);
      if (!res.success) {
        setError(res.error ?? 'Failed to update');
        return;
      }
    } else {
      const res = await createPlaybookEntry({
        coachUserId,
        rebuttalText: reb,
        objectionText: obj,
        authorName: coachName,
        tags,
        coachAnnotation: annotation.trim() || undefined,
      });
      setSaving(false);
      if ('error' in res) {
        setError(res.error);
        return;
      }
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
              Objection Playbook
            </div>
            <div className="text-[18px] font-bold text-gray-900 dark:text-white">
              {isEdit ? 'Edit rebuttal' : 'Add rebuttal'}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Objection */}
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Objection
            </label>
            <input
              type="text"
              value={objection}
              onChange={(e) => setObjection(e.target.value)}
              placeholder={'e.g., "I need to think about it"'}
              maxLength={MAX_OBJECTION}
              className="mt-1 w-full px-3 py-2 text-[13px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-500"
            />
            <div className="mt-1 text-[10px] text-gray-400 text-right">
              {objection.length}/{MAX_OBJECTION}
            </div>
          </div>

          {/* Rebuttal */}
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Rebuttal
            </label>
            <textarea
              value={rebuttal}
              onChange={(e) => setRebuttal(e.target.value)}
              placeholder="The proven response that turns the objection into a close..."
              maxLength={MAX_REBUTTAL}
              rows={5}
              className="mt-1 w-full px-3 py-2 text-[13px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-500 resize-none"
            />
            <div className="mt-1 text-[10px] text-gray-400 text-right">
              {rebuttal.length}/{MAX_REBUTTAL}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Tags
            </label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {TAG_CHOICES.map((t) => {
                const selected = selectedTags.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.id)}
                    type="button"
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
                      selected
                        ? 'bg-black text-white dark:bg-white dark:text-black'
                        : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Coach annotation */}
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Coach's note <span className="text-gray-400 normal-case">(optional)</span>
            </label>
            <textarea
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value)}
              placeholder="Why this works, when to use it, or what to avoid..."
              maxLength={MAX_ANNOTATION}
              rows={3}
              className="mt-1 w-full px-3 py-2 text-[13px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-500 resize-none"
            />
            <div className="mt-1 text-[10px] text-gray-400 text-right">
              {annotation.length}/{MAX_ANNOTATION}
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-[12px] text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 pb-5 pt-2 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-[13px] font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-[13px] font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-wait"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add rebuttal'}
          </button>
        </div>
      </div>
    </div>
  );
}
