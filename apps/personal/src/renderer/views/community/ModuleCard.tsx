import React from 'react';
import type { TrainingModule } from '../../convex';

const MODULE_GRADIENTS = [
  'from-blue-600 to-indigo-700',
  'from-emerald-600 to-teal-700',
  'from-orange-500 to-red-600',
  'from-purple-600 to-pink-700',
];

interface ModuleCardProps {
  module: TrainingModule;
  onClick: () => void;
}

export function ModuleCard({ module, onClick }: ModuleCardProps) {
  const gradient = MODULE_GRADIENTS[(module.order - 1) % MODULE_GRADIENTS.length];

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all hover:shadow-md group"
    >
      {/* Thumbnail / gradient header */}
      {module.thumbnailUrl ? (
        <img
          src={module.thumbnailUrl}
          alt={module.title}
          className="w-full aspect-video object-cover"
        />
      ) : (
        <div className={`w-full aspect-video bg-gradient-to-br ${gradient} flex items-center justify-center`}>
          <svg className="w-10 h-10 text-white/80 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      )}

      {/* Content */}
      <div className="p-3">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-white leading-tight">
          {module.title}
        </h3>
        {module.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
            {module.description}
          </p>
        )}
        <span className="inline-block mt-2 text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
          {module.lessonCount} lesson{module.lessonCount !== 1 ? 's' : ''}
        </span>
      </div>
    </button>
  );
}
