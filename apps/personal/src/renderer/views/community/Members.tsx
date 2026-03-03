import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getCommunityMembers } from '../../convex';
import type { CommunityMember } from './types';
import { MemberCard } from './MemberCard';

interface MembersProps {
  currentUserId?: string;
  onStartDM?: (userId: string, name: string, photoUrl: string | null) => void;
}

export function Members({ currentUserId, onStartDM }: MembersProps) {
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined as any);

  useEffect(() => {
    mountedRef.current = true;
    loadMembers();
    return () => { mountedRef.current = false; };
  }, []);

  const loadMembers = async (searchTerm?: string) => {
    setLoading(true);
    const result = await getCommunityMembers(20, searchTerm);
    if (mountedRef.current) {
      setMembers(result.members);
      setNextCursor(result.nextCursor);
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const result = await getCommunityMembers(20, search || undefined, nextCursor);
    if (mountedRef.current) {
      setMembers((prev) => [...prev, ...result.members]);
      setNextCursor(result.nextCursor);
      setLoadingMore(false);
    }
  };

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadMembers(value || undefined);
    }, 300);
  }, []);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search members..."
          className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-white placeholder:text-gray-400"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">Loading members...</div>
      ) : members.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">
          {search ? 'No members found' : 'No members yet'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {members.map((member) => (
              <MemberCard
                key={member.userId}
                member={member}
                isCurrentUser={member.userId === currentUserId}
                onMessage={onStartDM ? (userId, name, photoUrl) => onStartDM(userId, name, photoUrl) : undefined}
              />
            ))}
          </div>

          {nextCursor && (
            <div className="text-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
              >
                {loadingMore ? 'Loading...' : 'Load more members'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
