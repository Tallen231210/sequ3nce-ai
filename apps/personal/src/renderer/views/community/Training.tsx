import React, { useState, useEffect, useRef } from 'react';
import { getTrainingModules } from '../../convex';
import type { CloserInfo, TrainingModule } from '../../convex';
import { ModuleCard } from './ModuleCard';
import { LessonList } from './LessonList';
import { PastCoachingCallsList } from './coaching/PastCoachingCallsList';
import { ObjectionPlaybookList } from './playbook/ObjectionPlaybookList';

interface TrainingProps {
  closerInfo?: CloserInfo;
}

export function Training({ closerInfo }: TrainingProps = {}) {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<TrainingModule | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadModules();
    return () => { mountedRef.current = false; };
  }, []);

  const loadModules = async () => {
    const result = await getTrainingModules();
    if (mountedRef.current) {
      setModules(result);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
        Loading training modules...
      </div>
    );
  }

  // Even with no training modules, the Past Coaching Calls section should show
  // when recordings exist. PastCoachingCallsList owns its own empty state so
  // we can unconditionally render it at the top of the grid view.

  // Detail view — selected module
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
          Back to modules
        </button>

        <div className="mb-5">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedModule.title}</h2>
          {selectedModule.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedModule.description}</p>
          )}
          <span className="inline-block mt-2 text-xs text-gray-400 dark:text-gray-500">
            {selectedModule.lessonCount} lesson{selectedModule.lessonCount !== 1 ? 's' : ''}
          </span>
        </div>

        <LessonList moduleId={selectedModule._id} />
      </div>
    );
  }

  // Grid view — Objection Playbook on top (fresher, interactive), then past
  // coaching calls, then training modules.
  return (
    <div className="space-y-8">
      <ObjectionPlaybookList closerInfo={closerInfo} />

      <section>
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
          Past coaching calls
        </h2>
        <PastCoachingCallsList closerInfo={closerInfo} />
      </section>

      {modules.length > 0 ? (
        <section>
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Training modules
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((mod) => (
              <ModuleCard
                key={mod._id}
                module={mod}
                onClick={() => setSelectedModule(mod)}
              />
            ))}
          </div>
        </section>
      ) : (
        <section>
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Training modules
          </h2>
          <div className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center bg-gray-50 dark:bg-zinc-900/40 rounded-xl">
            Training content is being prepared. Check back soon.
          </div>
        </section>
      )}
    </div>
  );
}
