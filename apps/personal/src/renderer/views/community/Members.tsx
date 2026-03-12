import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getCommunityMembers, getFriendshipStatus, sendFriendRequest, acceptFriendRequest } from '../../convex';
import type { FriendshipStatus } from '../../convex';
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
  const [friendStatusMap, setFriendStatusMap] = useState<Map<string, FriendshipStatus>>(new Map());
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
      if (currentUserId) {
        fetchFriendStatuses(result.members);
      }
    }
  };

  const fetchFriendStatuses = async (memberList: CommunityMember[]) => {
    if (!currentUserId) return;
    const otherMembers = memberList.filter((m) => m.userId !== currentUserId);
    const statuses = await Promise.all(
      otherMembers.map(async (m) => {
        const status = await getFriendshipStatus(currentUserId, m.userId);
        return [m.userId, status] as [string, FriendshipStatus];
      })
    );
    if (mountedRef.current) {
      setFriendStatusMap((prev) => {
        const next = new Map(prev);
        for (const [id, status] of statuses) next.set(id, status);
        return next;
      });
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
      if (currentUserId) {
        fetchFriendStatuses(result.members);
      }
    }
  };

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadMembers(value || undefined);
    }, 300);
  }, []);

  const handleAddFriend = useCallback(async (recipientId: string) => {
    if (!currentUserId) return;
    // Optimistic update
    setFriendStatusMap((prev) => {
      const next = new Map(prev);
      next.set(recipientId, 'pending_sent');
      return next;
    });
    const result = await sendFriendRequest(currentUserId, recipientId);
    if (result.error && mountedRef.current) {
      // Revert on error
      setFriendStatusMap((prev) => {
        const next = new Map(prev);
        next.set(recipientId, 'none');
        return next;
      });
    }
  }, [currentUserId]);

  const handleAcceptFriend = useCallback(async (requesterId: string) => {
    if (!currentUserId) return;
    setFriendStatusMap((prev) => {
      const next = new Map(prev);
      next.set(requesterId, 'accepted');
      return next;
    });
    const result = await acceptFriendRequest(currentUserId, requesterId);
    if (result.error && mountedRef.current) {
      setFriendStatusMap((prev) => {
        const next = new Map(prev);
        next.set(requesterId, 'pending_received');
        return next;
      });
    }
  }, [currentUserId]);

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
          className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Loading members...</div>
      ) : members.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          {search ? 'No members found' : 'No members yet'}
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {members.map((member) => (
              <MemberCard
                key={member.userId}
                member={member}
                isCurrentUser={member.userId === currentUserId}
                friendshipStatus={friendStatusMap.get(member.userId)}
                onMessage={onStartDM ? (userId, name, photoUrl) => onStartDM(userId, name, photoUrl) : undefined}
                onAddFriend={handleAddFriend}
                onAcceptFriend={handleAcceptFriend}
              />
            ))}
          </div>

          {nextCursor && (
            <div className="text-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
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
