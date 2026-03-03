import React, { useState, useEffect, useRef } from 'react';
import { getTrainingModules } from '../../convex';
import type { TrainingModule } from '../../convex';
import { ModuleCard } from './ModuleCard';
import { LessonList } from './LessonList';

export function Training() {
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
      <div className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">
        Loading training modules...
      </div>
    );
  }

  if (modules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 bg-gray-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-gray-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">No Training Modules</h3>
        <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-xs">
          Training content is being prepared. Check back soon.
        </p>
      </div>
    );
  }

  // Detail view — selected module
  if (selectedModule) {
    return (
      <div>
        <button
          onClick={() => setSelectedModule(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to modules
        </button>

        <div className="mb-5">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedModule.title}</h2>
          {selectedModule.description && (
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">{selectedModule.description}</p>
          )}
          <span className="inline-block mt-2 text-xs text-gray-400 dark:text-zinc-500">
            {selectedModule.lessonCount} lesson{selectedModule.lessonCount !== 1 ? 's' : ''}
          </span>
        </div>

        <LessonList moduleId={selectedModule._id} />
      </div>
    );
  }

  // Grid view — all modules
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {modules.map((mod) => (
        <ModuleCard
          key={mod._id}
          module={mod}
          onClick={() => setSelectedModule(mod)}
        />
      ))}
    </div>
  );
}
