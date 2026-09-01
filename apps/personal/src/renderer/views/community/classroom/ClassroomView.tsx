import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { CloserInfo, TrainingModule } from '../../../convex';
import {
  getClassroomHome,
  getClassroomModules,
  joinClassroom,
  type ClassroomHome,
  type ClassroomModule,
} from '../../../classroomApi';
import { ModuleCard } from '../ModuleCard';
import { LessonList } from '../LessonList';
import { ClassroomReplays } from './ClassroomReplays';
import { ClassroomManage } from './ClassroomManage';

interface ClassroomViewProps {
  closerInfo?: CloserInfo;
}

/**
 * The Classroom — a coach's home inside the community: profile header,
 * their training modules, and the replays shelf. Single-coach era: shows
 * the one active classroom (the picker arrives with coach #2). The coach
 * themselves additionally sees management controls.
 */
export function ClassroomView({ closerInfo }: ClassroomViewProps) {
  const userId = closerInfo?.b2cUserId ?? '';
  const [home, setHome] = useState<ClassroomHome | null>(null);
  const [modules, setModules] = useState<ClassroomModule[]>([]);
  const [selectedModule, setSelectedModule] = useState<ClassroomModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const h = await getClassroomHome(userId);
    if (!mountedRef.current) return;
    setHome(h);
    if (h) {
      const mods = await getClassroomModules(userId, h.coach.coachId);
      if (mountedRef.current) setModules(mods);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const handleJoin = async () => {
    if (!home || joining) return;
    setJoining(true);
    await joinClassroom(userId, home.coach.coachId);
    await load();
    if (mountedRef.current) setJoining(false);
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
        Loading classroom...
      </div>
    );
  }

  if (!home) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 py-10 text-center bg-gray-50 dark:bg-zinc-900/40 rounded-xl">
        The first coach classroom is opening soon. Check back shortly.
      </div>
    );
  }

  const { coach, membership, memberCount, viewerIsCoach } = home;
  const isMember = membership !== null || viewerIsCoach;

  // Module detail view
  if (selectedModule) {
    return (
      <div>
        <button
          onClick={() => setSelectedModule(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to classroom
        </button>
        <div className="mb-5">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedModule.title}</h2>
          {selectedModule.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedModule.description}</p>
          )}
        </div>
        <LessonList moduleId={selectedModule._id} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Coach header card */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          {coach.avatarUrl ? (
            <img src={coach.avatarUrl} alt={coach.displayName} className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-900 dark:bg-zinc-700 text-white flex items-center justify-center text-xl font-bold flex-shrink-0">
              {coach.displayName.slice(0, 1)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{coach.displayName}</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400 px-2 py-0.5 rounded-md">
                Coach
              </span>
            </div>
            {coach.headline && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{coach.headline}</p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              {memberCount} member{memberCount !== 1 ? 's' : ''} in this classroom
            </p>
          </div>
          {!isMember && (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex-shrink-0"
            >
              {joining ? 'Joining...' : 'Join classroom'}
            </button>
          )}
        </div>
        {coach.bio && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 leading-relaxed">{coach.bio}</p>
        )}
      </div>

      {/* Coach management (coach only) */}
      {viewerIsCoach && (
        <ClassroomManage
          userId={userId}
          coachId={coach.coachId}
          modules={modules}
          onChanged={load}
        />
      )}

      {/* Modules */}
      {isMember && (
        <section>
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Training
          </h2>
          {modules.filter((m) => m.isPublished || viewerIsCoach).length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {modules
                .filter((m) => m.isPublished || viewerIsCoach)
                .map((mod) => (
                  <div key={mod._id} className="relative">
                    {!mod.isPublished && (
                      <span className="absolute top-2 right-2 z-10 text-[10px] font-bold uppercase bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                        Draft
                      </span>
                    )}
                    <ModuleCard
                      module={mod as unknown as TrainingModule}
                      onClick={() => setSelectedModule(mod)}
                    />
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center bg-gray-50 dark:bg-zinc-900/40 rounded-xl">
              {viewerIsCoach
                ? 'No modules yet — create your first one above.'
                : `${coach.displayName} is preparing training content. Check back soon.`}
            </div>
          )}
        </section>
      )}

      {/* Replays shelf */}
      {isMember && (
        <ClassroomReplays
          userId={userId}
          coachId={coach.coachId}
          viewerIsCoach={viewerIsCoach}
          modules={modules}
        />
      )}

      {!isMember && (
        <div className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center bg-gray-50 dark:bg-zinc-900/40 rounded-xl">
          Join the classroom to see the training library and call replays.
        </div>
      )}
    </div>
  );
}
