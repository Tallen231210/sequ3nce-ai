import React, { useState, useRef } from 'react';
import { searchCommunityPosts } from '../../convex';
import type { CommunityPost } from './types';
import { PostCard } from './PostCard';

interface PostSearchProps {
  channelId?: string;
  userId: string;
  isAdmin?: boolean;
  onClose: () => void;
}

export function PostSearch({ channelId, userId, isAdmin, onClose }: PostSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommunityPost[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const data = await searchCommunityPosts(value.trim(), channelId, undefined, undefined, userId);
      setResults(data.posts);
      setSearched(true);
      setLoading(false);
    }, 300);
  };

  const noop = () => {};

  return (
    <div className="h-full flex flex-col">
      {/* Search header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search posts..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10"
            autoFocus
          />
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          title="Close search"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {loading && (
          <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Searching...</div>
        )}

        {!loading && !searched && (
          <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
            Type to search posts...
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
            No results found for "{query}"
          </div>
        )}

        {!loading && results.map((post) => (
          <PostCard
            key={post._id}
            post={post}
            userId={userId}
            showChannelLabel={!channelId}
            isAdmin={isAdmin}
            isGrouped={false}
            onLike={noop}
            onEdit={noop}
            onDelete={noop}
            onReact={noop}
            onUnreact={noop}
            onPin={noop}
            onUnpin={noop}
          />
        ))}
      </div>
    </div>
  );
}
