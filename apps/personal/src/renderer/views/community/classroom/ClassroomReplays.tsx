import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getClassroomReplays,
  pushReplayToTraining,
  promoteReplayToLesson,
  type ClassroomReplay,
  type ClassroomModule,
} from '../../../classroomApi';

interface ClassroomReplaysProps {
  userId: string;
  coachId: string;
  viewerIsCoach: boolean;
  modules: ClassroomModule[];
}

/**
 * The classroom's Replays shelf — the coach's past call recordings, newest
 * first. Coaches get two curation actions per replay: promote it into one
 * of their modules, or share it with ALL Sequ3nce users via the general
 * Training tab (explicit confirm — that button publishes platform-wide).
 */
export function ClassroomReplays({ userId, coachId, viewerIsCoach, modules }: ClassroomReplaysProps) {
  const [replays, setReplays] = useState<ClassroomReplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null); // callId with picker open
  const [notice, setNotice] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const r = await getClassroomReplays(userId, coachId);
    if (mountedRef.current) {
      setReplays(r);
      setLoading(false);
    }
  }, [userId, coachId]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const handlePush = async (replay: ClassroomReplay) => {
    const ok = window.confirm(
      'Share with all users?\n\nThis pushes the recording to the general Training tab, visible to every Sequ3nce member — not just your classroom.',
    );
    if (!ok) return;
    setBusy(replay.callId);
    const r = await pushReplayToTraining(userId, replay.callId);
    if (mountedRef.current) {
      setNotice(r.error ? r.error : 'Shared to the general Training tab.');
      setBusy(null);
      load();
    }
  };

  const handlePromote = async (replay: ClassroomReplay, moduleId: string) => {
    setBusy(replay.callId);
    setPromoting(null);
    const r = await promoteReplayToLesson(userId, replay.callId, moduleId);
    if (mountedRef.current) {
      setNotice(r.error ? r.error : 'Added to the module as a lesson.');
      setBusy(null);
    }
  };

  if (loading) return null;
  if (replays.length === 0 && !viewerIsCoach) return null;

  return (
    <section>
      <h2 className="text-[13px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
        Call replays
      </h2>
      {notice && (
        <div className="text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-zinc-800 rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-3">✕</button>
        </div>
      )}
      {replays.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center bg-gray-50 dark:bg-zinc-900/40 rounded-xl">
          Replays of your coaching calls land here automatically after each call.
        </div>
      ) : (
        <div className="space-y-2">
          {replays.map((r) => (
            <div
              key={r.callId}
              className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{r.title}</p>
                    {r.featuredInTraining && (
                      <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 px-1.5 py-0.5 rounded flex-shrink-0">
                        Shared to all
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {new Date(r.scheduledStartTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <a
                  href={r.recordingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
                >
                  Watch
                </a>
                {viewerIsCoach && (
                  <>
                    <button
                      onClick={() => setPromoting(promoting === r.callId ? null : r.callId)}
                      disabled={busy === r.callId || modules.length === 0}
                      title={modules.length === 0 ? 'Create a module first' : 'Add this replay to one of your modules'}
                      className="text-xs font-semibold text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40 flex-shrink-0"
                    >
                      Add to module
                    </button>
                    {!r.featuredInTraining && (
                      <button
                        onClick={() => handlePush(r)}
                        disabled={busy === r.callId}
                        title="Pushes this recording to the general Training tab, visible to all Sequ3nce users"
                        className="text-xs font-semibold text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-40 flex-shrink-0"
                      >
                        Share with all users
                      </button>
                    )}
                  </>
                )}
              </div>
              {promoting === r.callId && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Add to:</span>
                  {modules.map((m) => (
                    <button
                      key={m._id}
                      onClick={() => handlePromote(r, m._id)}
                      className="text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-zinc-700 rounded-lg px-2.5 py-1 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      {m.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
