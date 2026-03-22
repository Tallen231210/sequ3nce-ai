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
import { ChatBubbleIcon } from './icons';

interface FriendsProps {
  userId: string;
  onMessageFriend?: (userId: string, name: string, photoUrl: string | null) => void;
}

export function Friends({ userId, onMessageFriend }: FriendsProps) {
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
      <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
        Loading friends...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Incoming Requests */}
      {requests.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowRequests(!showRequests)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
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
            <div className="px-2 pb-2 space-y-1">
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
          className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400"
        />
      </div>

      {/* Friends List */}
      {filteredFriends.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          {search ? 'No friends match your search' : friends.length === 0 ? 'No friends yet. Visit the Members tab to connect with other closers!' : 'No matches found'}
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {filteredFriends.map((friend) => (
              <FriendCard
                key={friend.userId}
                friend={friend}
                onRemove={() => handleRemove(friend.userId)}
                onMessage={onMessageFriend ? () => onMessageFriend(friend.userId, friend.name, friend.photoUrl) : undefined}
              />
            ))}
          </div>

          {nextCursor && !search && (
            <div className="text-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
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
    <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
      {request.photoUrl ? (
        <img src={request.photoUrl} alt={request.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
      ) : (
        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-xs shrink-0`}>
          {initials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{request.name}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onAccept}
          className="px-2 py-1 text-[10px] font-medium bg-black text-white dark:bg-white dark:text-black rounded-md hover:opacity-80 transition-opacity"
        >
          Accept
        </button>
        <button
          onClick={onDecline}
          className="px-2 py-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

function FriendCard({
  friend,
  onRemove,
  onMessage,
}: {
  friend: FriendItem;
  onRemove: () => void;
  onMessage?: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const initials = getInitials(friend.name);
  const gradient = getAvatarGradient(friend.name);

  return (
    <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
      {friend.photoUrl ? (
        <img src={friend.photoUrl} alt={friend.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
      ) : (
        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-xs shrink-0`}>
          {initials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{friend.name}</div>
        {friend.headline && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{friend.headline}</div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onMessage && (
          <button
            onClick={onMessage}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            title="Send message"
          >
            <ChatBubbleIcon />
          </button>
        )}
        {confirmRemove ? (
          <button
            onClick={() => { onRemove(); setConfirmRemove(false); }}
            className="px-2 py-1 text-[10px] font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors"
          >
            Confirm
          </button>
        ) : (
          <button
            onClick={() => setConfirmRemove(true)}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 rounded-md transition-colors"
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
