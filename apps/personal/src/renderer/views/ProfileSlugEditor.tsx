import React, { useState } from 'react';
import { claimProfileSlug } from '../convex';

interface ProfileSlugEditorProps {
  userId: string;
  currentSlug: string | null;
  name: string;
  onSlugClaimed: (slug: string) => void;
}

function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

export function ProfileSlugEditor({ userId, currentSlug, name, onSlugClaimed }: ProfileSlugEditorProps) {
  const [slug, setSlug] = useState(currentSlug || suggestSlug(name));
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isChanged = slug !== currentSlug;

  async function handleClaim() {
    if (!slug.trim() || isClaiming || !isChanged) return;

    setIsClaiming(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await claimProfileSlug(userId, slug);
      if (result.success && result.slug) {
        onSlugClaimed(result.slug);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.error || 'Failed to claim URL');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsClaiming(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-medium text-gray-700 dark:text-zinc-300">
        Profile URL
      </label>
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-gray-400 dark:text-zinc-500 whitespace-nowrap shrink-0">
          sequ3nce.ai/p/
        </span>
        <input
          type="text"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
            setError(null);
            setSuccess(false);
          }}
          maxLength={40}
          placeholder="your-name"
          className="flex-1 min-w-0 px-3 py-2 text-[13px] bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-500 placeholder-gray-400 dark:placeholder-zinc-500"
        />
        <button
          type="button"
          onClick={handleClaim}
          disabled={isClaiming || !isChanged || !slug.trim()}
          className="px-4 py-2 text-[13px] font-medium bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {isClaiming ? 'Claiming...' : currentSlug ? 'Update' : 'Claim'}
        </button>
      </div>

      {error && (
        <p className="text-[12px] text-red-500 dark:text-red-400">{error}</p>
      )}
      {success && (
        <p className="text-[12px] text-green-600 dark:text-green-400">URL claimed successfully!</p>
      )}
      {currentSlug && (
        <p className="text-[12px] text-gray-400 dark:text-zinc-500">
          Your public profile: sequ3nce.ai/p/{currentSlug}
        </p>
      )}
    </div>
  );
}
