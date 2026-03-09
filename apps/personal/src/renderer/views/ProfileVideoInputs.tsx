import React from 'react';

function detectVideoPlatform(url: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes('loom.com')) return 'Loom';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
  if (lower.includes('vimeo.com')) return 'Vimeo';
  return null;
}

interface ProfileVideoInputsProps {
  introVideoUrl: string;
  onIntroChange: (url: string) => void;
}

export function ProfileVideoInputs({
  introVideoUrl,
  onIntroChange,
}: ProfileVideoInputsProps) {
  const introPlatform = detectVideoPlatform(introVideoUrl);

  return (
    <div>
      <label className="block text-[12px] text-gray-500 dark:text-zinc-400 mb-1">
        Intro Video URL
      </label>
      <input
        type="url"
        value={introVideoUrl}
        onChange={(e) => onIntroChange(e.target.value.slice(0, 500))}
        placeholder="https://www.loom.com/share/..."
        className="w-full px-3 py-2 text-[13px] bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-500 placeholder-gray-400 dark:placeholder-zinc-500"
      />
      {introPlatform && (
        <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-700 rounded-full">
          {introPlatform} detected
        </span>
      )}
    </div>
  );
}
