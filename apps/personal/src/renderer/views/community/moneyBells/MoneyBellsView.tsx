import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CloserInfo } from '../../../convex';
import type { MoneyBellsBroadcastPost } from '../../../convex';
import {
  addReaction,
  deleteMoneyBellBroadcast,
  getMoneyBellsFeed,
  getMoneyBellsOptInStatus,
  removeReaction,
} from '../../../convex';
import { PostCard } from '../PostCard';
import type { CommunityPost } from '../types';
import { MoneyBellsJoinPrompt } from './MoneyBellsJoinPrompt';
import { MoneyBellsLeaderboard } from './MoneyBellsLeaderboard';
import { MoneyBellsTicker } from './MoneyBellsTicker';

const FEED_POLL_MS = 10_000;

interface MoneyBellsViewProps {
  closerInfo: CloserInfo;
}

export function MoneyBellsView({ closerInfo }: MoneyBellsViewProps) {
  const [optedIn, setOptedIn] = useState<boolean | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [tickerPosts, setTickerPosts] = useState<MoneyBellsBroadcastPost[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);
  const mountedRef = useRef(true);

  const userId = closerInfo.b2cUserId ?? '';
  const userName = closerInfo.name ?? 'You';
  const userPhotoUrl: string | null = null; // photoUrl not on CloserInfo; fetched via profile elsewhere — keep minimal here
  const isAdmin = closerInfo.role === 'admin' || (closerInfo.badges ?? []).includes('founder') || (closerInfo.badges ?? []).includes('admin');

  // Check opt-in status on mount
  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      if (!userId) {
        setOptedIn(false);
        return;
      }
      const result = await getMoneyBellsOptInStatus(userId);
      if (!mountedRef.current) return;
      if ('optedIn' in result) setOptedIn(result.optedIn);
      else setOptedIn(false);
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [userId]);

  // Poll feed when opted in
  const loadFeed = useCallback(async () => {
    if (!userId) return;
    const result = await getMoneyBellsFeed(userId);
    if (!mountedRef.current) return;
    if ('posts' in result) {
      setPosts(result.posts.map(broadcastPostToCommunityPost));
      setTickerPosts(result.posts);
    }
    setLoadingFeed(false);
  }, [userId]);

  useEffect(() => {
    if (!optedIn) return;
    void loadFeed();
    const interval = setInterval(() => {
      if (mountedRef.current) void loadFeed();
    }, FEED_POLL_MS);
    return () => clearInterval(interval);
  }, [optedIn, loadFeed]);

  const handleReact = useCallback(
    async (postId: string, emoji: string) => {
      // Optimistic update
      setPosts((prev) =>
        prev.map((p) =>
          p._id === postId
            ? {
                ...p,
                reactionCounts: { ...p.reactionCounts, [emoji]: (p.reactionCounts[emoji] ?? 0) + 1 },
                myReactions: [...(p.myReactions ?? []), emoji],
              }
            : p
        )
      );
      await addReaction(userId, 'post', postId, emoji);
      void loadFeed();
    },
    [userId, loadFeed]
  );

  const handleUnreact = useCallback(
    async (postId: string, emoji: string) => {
      setPosts((prev) =>
        prev.map((p) =>
          p._id === postId
            ? {
                ...p,
                reactionCounts: {
                  ...p.reactionCounts,
                  [emoji]: Math.max(0, (p.reactionCounts[emoji] ?? 0) - 1),
                },
                myReactions: (p.myReactions ?? []).filter((e) => e !== emoji),
              }
            : p
        )
      );
      await removeReaction(userId, 'post', postId, emoji);
      void loadFeed();
    },
    [userId, loadFeed]
  );

  const handleDelete = useCallback(
    async (postId: string) => {
      const post = posts.find((p) => p._id === postId);
      if (!post || !post.broadcastId) return;
      if (!window.confirm('Delete this broadcast? (within 1 hour of posting only, unless you are a founder)')) return;
      const result = await deleteMoneyBellBroadcast(userId, post.broadcastId);
      if (result.error) {
        window.alert(result.error);
        return;
      }
      setPosts((prev) => prev.filter((p) => p._id !== postId));
      // Force an immediate leaderboard re-fetch so the deleted broadcast vanishes from rank
      setLeaderboardRefreshKey((k) => k + 1);
    },
    [userId, posts]
  );

  // Still loading opt-in status
  if (optedIn === null) {
    return (
      <div className="py-8 text-center text-[12px] text-gray-400 dark:text-gray-500">Loading Money Bells…</div>
    );
  }

  if (!optedIn) {
    return <MoneyBellsJoinPrompt userId={userId} onJoined={() => setOptedIn(true)} />;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <MoneyBellsTicker broadcasts={tickerPosts} />
      <MoneyBellsLeaderboard userId={userId} userName={userName} userPhotoUrl={userPhotoUrl} refreshKey={leaderboardRefreshKey} isAdmin={isAdmin} />

      <div className="space-y-2">
        {loadingFeed ? (
          <div className="py-8 text-center text-[12px] text-gray-400 dark:text-gray-500">Loading broadcasts…</div>
        ) : posts.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-gray-500 dark:text-gray-400">
            No broadcasts yet this month. Close a deal and share it to kick things off!
          </div>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post._id}
              post={post}
              userId={userId}
              isAdmin={isAdmin}
              onLike={() => {
                // broadcasts use reactions, not likes — no-op
              }}
              onReact={handleReact}
              onUnreact={handleUnreact}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Adapter: server-returned broadcast post → local CommunityPost shape
function broadcastPostToCommunityPost(p: MoneyBellsBroadcastPost): CommunityPost {
  return {
    _id: p._id,
    channelId: p.channelId,
    authorId: p.authorId,
    authorName: p.authorName,
    authorPhotoUrl: p.authorPhotoUrl,
    authorBadges: p.authorBadges,
    body: p.body,
    visibility: p.visibility,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    isPinned: p.isPinned,
    isLikedByMe: p.isLikedByMe,
    reactionCounts: p.reactionCounts,
    myReactions: p.myReactions,
    broadcastId: p.broadcastId,
    broadcastData: p.broadcastData,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
