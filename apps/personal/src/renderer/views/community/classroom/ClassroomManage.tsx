import React, { useState } from 'react';
import {
  createClassroomModule,
  updateClassroomModule,
  deleteClassroomModule,
  addClassroomLesson,
  type ClassroomModule,
} from '../../../classroomApi';

interface ClassroomManageProps {
  userId: string;
  coachId: string;
  modules: ClassroomModule[];
  onChanged: () => void;
}

/**
 * Coach-only management strip: create modules, add video lessons, publish/
 * unpublish, delete. Kept deliberately utilitarian — content lives below
 * in the same module grid members see (drafts badged).
 */
export function ClassroomManage({ userId, coachId, modules, onChanged }: ClassroomManageProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [lessonModuleId, setLessonModuleId] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonUrl, setLessonUrl] = useState('');

  const run = async (fn: () => Promise<{ error?: string } | { data?: unknown; error?: string }>) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if ('error' in r && r.error) {
      setError(r.error);
      return false;
    }
    onChanged();
    return true;
  };

  const handleCreateModule = async () => {
    if (!newModuleTitle.trim()) return;
    if (await run(() => createClassroomModule(userId, coachId, newModuleTitle))) {
      setNewModuleTitle('');
    }
  };

  const handleAddLesson = async () => {
    if (!lessonModuleId || !lessonTitle.trim() || !lessonUrl.trim()) return;
    if (await run(() => addClassroomLesson(userId, lessonModuleId, lessonTitle, lessonUrl))) {
      setLessonTitle('');
      setLessonUrl('');
    }
  };

  const handleDelete = async (mod: ClassroomModule) => {
    if (!window.confirm(`Delete "${mod.title}" and its ${mod.lessonCount} lesson(s)? This can't be undone.`)) return;
    await run(() => deleteClassroomModule(userId, mod._id));
  };

  const inputClass =
    'flex-1 min-w-0 text-sm bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10';

  return (
    <div className="bg-gray-50 dark:bg-zinc-900/40 border border-dashed border-gray-300 dark:border-zinc-700 rounded-2xl">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200"
      >
        <span>Manage your classroom</span>
        <svg
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5">
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* New module */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
              New module
            </p>
            <div className="flex gap-2">
              <input
                value={newModuleTitle}
                onChange={(e) => setNewModuleTitle(e.target.value)}
                placeholder="Module title (e.g. Closing Fundamentals)"
                className={inputClass}
                maxLength={200}
              />
              <button
                onClick={handleCreateModule}
                disabled={busy || !newModuleTitle.trim()}
                className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity flex-shrink-0"
              >
                Create
              </button>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
              New modules start as drafts — members see them only after you publish.
            </p>
          </div>

          {/* Add lesson */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
              Add video lesson
            </p>
            <div className="space-y-2">
              <select
                value={lessonModuleId}
                onChange={(e) => setLessonModuleId(e.target.value)}
                className={inputClass + ' w-full'}
              >
                <option value="">Choose module...</option>
                {modules.map((m) => (
                  <option key={m._id} value={m._id}>{m.title}{m.isPublished ? '' : ' (draft)'}</option>
                ))}
              </select>
              <input
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
                placeholder="Lesson title"
                className={inputClass + ' w-full'}
                maxLength={200}
              />
              <div className="flex gap-2">
                <input
                  value={lessonUrl}
                  onChange={(e) => setLessonUrl(e.target.value)}
                  placeholder="Video link (https:// — Loom, YouTube, etc.)"
                  className={inputClass}
                />
                <button
                  onClick={handleAddLesson}
                  disabled={busy || !lessonModuleId || !lessonTitle.trim() || !lessonUrl.trim()}
                  className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity flex-shrink-0"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Module list w/ publish + delete */}
          {modules.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                Your modules
              </p>
              <div className="space-y-1.5">
                {modules.map((m) => (
                  <div
                    key={m._id}
                    className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2"
                  >
                    <span className="flex-1 min-w-0 text-sm text-gray-900 dark:text-white truncate">
                      {m.title}
                      <span className="text-gray-400 dark:text-gray-500 ml-2 text-xs">
                        {m.lessonCount} lesson{m.lessonCount !== 1 ? 's' : ''}
                      </span>
                    </span>
                    <button
                      onClick={() => run(() => updateClassroomModule(userId, m._id, { isPublished: !m.isPublished }))}
                      disabled={busy}
                      className={`text-xs font-semibold rounded-lg px-2.5 py-1 border transition-colors flex-shrink-0 ${
                        m.isPublished
                          ? 'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10'
                          : 'text-gray-600 dark:text-gray-300 border-gray-300 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {m.isPublished ? 'Published' : 'Publish'}
                    </button>
                    <button
                      onClick={() => handleDelete(m)}
                      disabled={busy}
                      className="text-xs font-semibold text-red-600 dark:text-red-400 rounded-lg px-2 py-1 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex-shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
