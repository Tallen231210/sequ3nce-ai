import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getFriends,
  getIncomingFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
} from '../../convex';
import type { FriendItem, FriendRequest } from '../../convex';
import { getInitials, getAvatarGradient } from './types';

interface FriendsProps {
  userId: string;
  onStartDM?: (userId: string, name: string, photoUrl: string | null) => void;
}

export function Friends({ userId, onStartDM }: FriendsProps) {
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [showRequests, setShowRequests] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadAll();
    return () => { mountedRef.current = false; };
  }, [userId]);

  const loadAll = async () => {
    setLoading(true);
    const [friendsResult, requestsResult] = await Promise.all([
      getFriends(userId, 20),
      getIncomingFriendRequests(userId),
    ]);
    if (mountedRef.current) {
      setFriends(friendsResult.friends);
      setNextCursor(friendsResult.nextCursor);
      setRequests(requestsResult.requests);
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const result = await getFriends(userId, 20, nextCursor);
    if (mountedRef.current) {
      setFriends((prev) => [...prev, ...result.friends]);
      setNextCursor(result.nextCursor);
      setLoadingMore(false);
    }
  };

  const handleAccept = useCallback(async (requesterId: string) => {
    // Optimistic: move from requests to friends
    const req = requests.find((r) => r.requesterId === requesterId);
    if (req) {
      setRequests((prev) => prev.filter((r) => r.requesterId !== requesterId));
      setFriends((prev) => [{
        friendshipId: req.friendshipId,
        userId: req.requesterId,
        name: req.name,
        headline: req.headline,
        location: null,
        photoUrl: req.photoUrl,
        acceptedAt: Date.now(),
      }, ...prev]);
    }
    const result = await acceptFriendRequest(userId, requesterId);
    if (result.error && mountedRef.current) await loadAll();
  }, [userId, requests]);

  const handleDecline = useCallback(async (requesterId: string) => {
    setRequests((prev) => prev.filter((r) => r.requesterId !== requesterId));
    const result = await declineFriendRequest(userId, requesterId);
    if (result.error && mountedRef.current) await loadAll();
  }, [userId]);

  const handleRemove = useCallback(async (friendId: string) => {
    setFriends((prev) => prev.filter((f) => f.userId !== friendId));
    const result = await removeFriend(userId, friendId);
    if (result.error && mountedRef.current) await loadAll();
  }, [userId]);

  // Client-side search filter
  const filteredFriends = search.trim()
    ? friends.filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()))
    : friends;

  if (loading) {
    return (
      <div className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">
        Loading friends...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Incoming Requests */}
      {requests.length > 0 && (
        <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowRequests(!showRequests)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-750 transition-colors"
          >
            <span>Friend Requests ({requests.length})</span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${showRequests ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {showRequests && (
            <div className="px-4 pb-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
              {requests.map((req) => (
                <RequestCard
                  key={req.requesterId}
                  request={req}
                  onAccept={() => handleAccept(req.requesterId)}
                  onDecline={() => handleDecline(req.requesterId)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search friends..."
          className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-white placeholder:text-gray-400"
        />
      </div>

      {/* Friends Grid */}
      {filteredFriends.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">
          {search ? 'No friends match your search' : friends.length === 0 ? 'No friends yet. Visit the Members tab to connect with other closers!' : 'No matches found'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredFriends.map((friend) => (
              <FriendCard
                key={friend.userId}
                friend={friend}
                onMessage={onStartDM ? () => onStartDM(friend.userId, friend.name, friend.photoUrl) : undefined}
                onRemove={() => handleRemove(friend.userId)}
              />
            ))}
          </div>

          {nextCursor && !search && (
            <div className="text-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
              >
                {loadingMore ? 'Loading...' : 'Load more friends'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ==================== Sub-components ====================

function RequestCard({
  request,
  onAccept,
  onDecline,
}: {
  request: FriendRequest;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const initials = getInitials(request.name);
  const gradient = getAvatarGradient(request.name);

  return (
    <div className="bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-700 rounded-xl p-4 flex flex-col items-center text-center">
      {request.photoUrl ? (
        <img src={request.photoUrl} alt={request.name} className="w-12 h-12 rounded-full object-cover mb-2" />
      ) : (
        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-sm mb-2`}>
          {initials}
        </div>
      )}
      <div className="font-semibold text-gray-900 dark:text-white text-sm truncate w-full">{request.name}</div>
      {request.headline && (
        <div className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5 truncate w-full">{request.headline}</div>
      )}
      <div className="flex gap-2 mt-3 w-full">
        <button
          onClick={onAccept}
          className="flex-1 px-2 py-1.5 text-xs font-medium bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity"
        >
          Accept
        </button>
        <button
          onClick={onDecline}
          className="flex-1 px-2 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 dark:bg-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

function FriendCard({
  friend,
  onMessage,
  onRemove,
}: {
  friend: FriendItem;
  onMessage?: () => void;
  onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const initials = getInitials(friend.name);
  const gradient = getAvatarGradient(friend.name);

  return (
    <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl p-4 flex flex-col items-center text-center hover:shadow-md transition-shadow">
      {friend.photoUrl ? (
        <img src={friend.photoUrl} alt={friend.name} className="w-14 h-14 rounded-full object-cover mb-3" />
      ) : (
        <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-lg mb-3`}>
          {initials}
        </div>
      )}
      <div className="font-semibold text-gray-900 dark:text-white text-sm truncate w-full">{friend.name}</div>
      {friend.headline && (
        <div className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5 truncate w-full">{friend.headline}</div>
      )}
      {friend.location && (
        <div className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5 truncate w-full">{friend.location}</div>
      )}

      <div className="flex gap-2 mt-3 w-full">
        {onMessage && (
          <button
            onClick={onMessage}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-zinc-200 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
              <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
            </svg>
            Message
          </button>
        )}
        {confirmRemove ? (
          <button
            onClick={() => { onRemove(); setConfirmRemove(false); }}
            className="flex-1 px-2 py-1.5 text-xs font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
          >
            Confirm
          </button>
        ) : (
          <button
            onClick={() => setConfirmRemove(true)}
            className="px-2 py-1.5 text-xs text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 rounded-lg transition-colors"
            title="Remove friend"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
