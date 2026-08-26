import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePoll } from '../../lib/usePoll';
import {
  getChannelPosts,
  getNewPostCount,
  createCommunityPost,
  togglePostLike,
  editCommunityPost,
  deleteCommunityPost,
  addReaction,
  removeReaction,
  pinCommunityPost,
  unpinCommunityPost,
} from '../../convex';
import type { CommunityChannel, CommunityPost } from './types';
import { PostCard } from './PostCard';
import { NewPostForm } from './NewPostForm';

interface ChannelPostListProps {
  channelId: string;
  userId: string;
  channels: CommunityChannel[];
  isAdmin?: boolean;
}

const POLL_INTERVAL = 10_000;

export function ChannelPostList({
  channelId,
  userId,
  channels,
  isAdmin,
}: ChannelPostListProps) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newPostCount, setNewPostCount] = useState(0);
  const lastFetchedRef = useRef(Date.now());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load posts when channel changes
  useEffect(() => {
    loadPosts(channelId);
  }, [channelId]);

  // Poll for new posts — task #348
  usePoll(
    'channelNewPosts',
    async () => {
      if (!mountedRef.current) return;
      const count = await getNewPostCount(lastFetchedRef.current);
      if (mountedRef.current) setNewPostCount(count);
    },
    POLL_INTERVAL,
    { immediate: false },
  );

  const loadPosts = async (chId: string) => {
    setLoading(true);
    const result = await getChannelPosts(chId, userId);
    if (mountedRef.current) {
      setPosts(result.posts);
      setNextCursor(result.nextCursor);
      lastFetchedRef.current = Date.now();
      setNewPostCount(0);
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const result = await getChannelPosts(channelId, userId, undefined, nextCursor);
    if (mountedRef.current) {
      setPosts((prev) => [...prev, ...result.posts]);
      setNextCursor(result.nextCursor);
      setLoadingMore(false);
    }
  };

  const handleLoadNew = async () => {
    await loadPosts(channelId);
  };

  const handleCreatePost = useCallback(async (chId: string, body: string, visibility?: string) => {
    const result = await createCommunityPost(userId, chId, body, visibility);
    if (!result.error) {
      await loadPosts(channelId);
    }
  }, [userId, channelId]);

  const handleLike = useCallback(async (postId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p._id === postId
          ? {
              ...p,
              isLikedByMe: !p.isLikedByMe,
              likeCount: p.isLikedByMe ? p.likeCount - 1 : p.likeCount + 1,
            }
          : p
      )
    );
    const result = await togglePostLike(userId, postId);
    if (result.error && mountedRef.current) {
      await loadPosts(channelId);
    }
  }, [userId, channelId]);

  const handleEdit = useCallback(async (postId: string, body: string) => {
    const result = await editCommunityPost(userId, postId, body);
    if (result.success && mountedRef.current) {
      setPosts((prev) =>
        prev.map((p) => (p._id === postId ? { ...p, body, updatedAt: Date.now() } : p))
      );
    }
  }, [userId]);

  const handleDelete = useCallback(async (postId: string) => {
    const result = await deleteCommunityPost(userId, postId);
    if (result.success && mountedRef.current) {
      setPosts((prev) => prev.filter((p) => p._id !== postId));
    }
  }, [userId]);

  const handleReact = useCallback(async (postId: string, emoji: string) => {
    setPosts((prev) => prev.map((p) => {
      if (p._id !== postId) return p;
      const counts = { ...(p.reactionCounts ?? {}) };
      counts[emoji] = (counts[emoji] ?? 0) + 1;
      return { ...p, reactionCounts: counts, myReactions: [...(p.myReactions ?? []), emoji] };
    }));
    await addReaction(userId, 'post', postId, emoji);
  }, [userId]);

  const handleUnreact = useCallback(async (postId: string, emoji: string) => {
    setPosts((prev) => prev.map((p) => {
      if (p._id !== postId) return p;
      const counts = { ...(p.reactionCounts ?? {}) };
      counts[emoji] = Math.max(0, (counts[emoji] ?? 0) - 1);
      if (counts[emoji] === 0) delete counts[emoji];
      return { ...p, reactionCounts: counts, myReactions: (p.myReactions ?? []).filter((e) => e !== emoji) };
    }));
    await removeReaction(userId, 'post', postId, emoji);
  }, [userId]);

  const handlePin = useCallback(async (postId: string) => {
    await pinCommunityPost(userId, postId);
    if (mountedRef.current) {
      setPosts((prev) => prev.map((p) => p._id === postId ? { ...p, isPinned: true } : p));
    }
  }, [userId]);

  const handleUnpin = useCallback(async (postId: string) => {
    await unpinCommunityPost(userId, postId);
    if (mountedRef.current) {
      setPosts((prev) => prev.map((p) => p._id === postId ? { ...p, isPinned: false } : p));
    }
  }, [userId]);

  const channel = channels.find((c) => c._id === channelId);

  // Separate pinned and regular posts
  const pinnedPosts = posts.filter((p) => p.isPinned);
  const regularPosts = posts.filter((p) => !p.isPinned);

  // Compute message grouping on the regular (non-pinned) list only,
  // so pinned posts in a separate section don't affect grouping.
  function isRegularPostGrouped(index: number): boolean {
    if (index === 0) return false;
    const current = regularPosts[index];
    const prev = regularPosts[index - 1];
    if (current.authorId !== prev.authorId) return false;
    return Math.abs(prev.createdAt - current.createdAt) < 5 * 60 * 1000;
  }

  return (
    <div className="space-y-4">
      {/* New post form */}
      <NewPostForm
        channels={channels}
        selectedChannelId={channelId}
        onSubmit={handleCreatePost}
      />

      {/* New posts banner */}
      {newPostCount > 0 && (
        <button
          onClick={handleLoadNew}
          className="w-full py-2 px-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
        >
          {newPostCount} new {newPostCount === 1 ? 'post' : 'posts'} — Load new posts
        </button>
      )}

      {/* Posts list */}
      {loading ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Loading posts...</div>
      ) : posts.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          Founding cohort territory — nothing in #{channel?.slug || 'this channel'} yet. Claim the first post.
        </div>
      ) : (
        <>
          {/* Pinned posts section */}
          {pinnedPosts.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 font-medium mb-2">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                </svg>
                PINNED
              </div>
              {pinnedPosts.map((post) => (
                <PostCard
                  key={post._id}
                  post={post}
                  userId={userId}
                  isAdmin={isAdmin}
                  onLike={handleLike}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onReact={handleReact}
                  onUnreact={handleUnreact}
                  onPin={handlePin}
                  onUnpin={handleUnpin}
                />
              ))}
              <div className="border-t border-gray-100 dark:border-gray-700 my-3" />
            </div>
          )}

          {/* Regular posts */}
          <div className="space-y-1">
            {regularPosts.map((post, index) => (
              <PostCard
                key={post._id}
                post={post}
                userId={userId}
                isAdmin={isAdmin}
                isGrouped={isRegularPostGrouped(index)}
                onLike={handleLike}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onReact={handleReact}
                onUnreact={handleUnreact}
                onPin={handlePin}
                onUnpin={handleUnpin}
              />
            ))}
          </div>

          {nextCursor && (
            <div className="text-center pt-2 pb-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                {loadingMore ? 'Loading...' : 'Load older posts'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
