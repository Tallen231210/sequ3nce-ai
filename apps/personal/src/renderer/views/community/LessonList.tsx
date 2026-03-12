import React, { useState, useEffect, useRef } from 'react';
import { getTrainingLessons } from '../../convex';
import type { TrainingLesson } from '../../convex';

interface LessonListProps {
  moduleId: string;
}

/** Convert YouTube/Vimeo/Loom watch URLs to embeddable URLs */
function getEmbedUrl(url: string): string {
  // YouTube: youtube.com/watch?v=ID or youtu.be/ID
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;

  // Vimeo: vimeo.com/ID
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;

  // Loom: loom.com/share/ID
  const loomMatch = url.match(/loom\.com\/share\/([\w-]+)/);
  if (loomMatch) return `https://www.loom.com/embed/${loomMatch[1]}`;

  return url;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function LessonList({ moduleId }: LessonListProps) {
  const [lessons, setLessons] = useState<TrainingLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState<TrainingLesson | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadLessons();
    return () => { mountedRef.current = false; };
  }, [moduleId]);

  const loadLessons = async () => {
    setLoading(true);
    const result = await getTrainingLessons(moduleId);
    if (mountedRef.current) {
      setLessons(result);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
        Loading lessons...
      </div>
    );
  }

  if (lessons.length === 0) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
        No lessons available yet.
      </div>
    );
  }

  return (
    <div>
      {/* Video player */}
      {activeLesson && (
        <div className="mb-5">
          <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
            <iframe
              src={getEmbedUrl(activeLesson.videoUrl)}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={activeLesson.title}
            />
          </div>
          <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-white">
            {activeLesson.title}
          </h3>
          {activeLesson.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {activeLesson.description}
            </p>
          )}
        </div>
      )}

      {/* Lesson list */}
      <div className="space-y-1">
        {lessons.map((lesson) => {
          const isActive = activeLesson?._id === lesson._id;
          return (
            <button
              key={lesson._id}
              onClick={() => setActiveLesson(isActive ? null : lesson)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                isActive
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {/* Order number */}
              <span className={`text-xs font-mono w-5 text-center flex-shrink-0 ${
                isActive ? 'text-white/70 dark:text-black/70' : 'text-gray-400 dark:text-gray-500'
              }`}>
                {lesson.order}
              </span>

              {/* Title */}
              <span className={`flex-1 text-sm font-medium truncate ${
                isActive ? '' : 'text-gray-900 dark:text-white'
              }`}>
                {lesson.title}
              </span>

              {/* Duration badge */}
              {lesson.durationSeconds && (
                <span className={`text-xs flex-shrink-0 ${
                  isActive ? 'text-white/60 dark:text-black/60' : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {formatDuration(lesson.durationSeconds)}
                </span>
              )}

              {/* Play icon */}
              <svg
                className={`w-4 h-4 flex-shrink-0 ${
                  isActive ? 'text-white/70 dark:text-black/70' : 'text-gray-300 dark:text-gray-600'
                }`}
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}
