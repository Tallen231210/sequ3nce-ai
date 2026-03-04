import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getFeedPosts,
  getNewPostCount,
  createCommunityPost,
  togglePostLike,
  editCommunityPost,
  deleteCommunityPost,
} from '../../convex';
import type { CommunityChannel, CommunityPost } from './types';
import { PostCard } from './PostCard';
import { NewPostForm } from './NewPostForm';

interface FeedProps {
  userId: string;
  channels: CommunityChannel[];
  isAdmin?: boolean;
  onMessageAuthor?: (userId: string, name: string, photoUrl: string | null) => void;
}

const POLL_INTERVAL = 10_000;

export function Feed({ userId, channels, isAdmin, onMessageAuthor }: FeedProps) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newPostCount, setNewPostCount] = useState(0);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const lastFetchedRef = useRef(Date.now());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadPosts();
    return () => { mountedRef.current = false; };
  }, []);

  // Poll for new posts
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!mountedRef.current) return;
      const count = await getNewPostCount(lastFetchedRef.current);
      if (mountedRef.current) setNewPostCount(count);
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const loadPosts = async (filterFriendsOnly?: boolean) => {
    const useFriendsOnly = filterFriendsOnly ?? friendsOnly;
    setLoading(true);
    const result = await getFeedPosts(userId, undefined, undefined, useFriendsOnly);
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
    const result = await getFeedPosts(userId, undefined, nextCursor, friendsOnly);
    if (mountedRef.current) {
      setPosts((prev) => [...prev, ...result.posts]);
      setNextCursor(result.nextCursor);
      setLoadingMore(false);
    }
  };

  const handleLoadNew = async () => {
    await loadPosts();
    const el = document.querySelector('[data-feed-scroll]');
    el?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleFriendsOnly = (value: boolean) => {
    setFriendsOnly(value);
    loadPosts(value);
  };

  const handleCreatePost = useCallback(async (channelId: string, body: string, visibility?: string) => {
    const result = await createCommunityPost(userId, channelId, body, visibility);
    if (!result.error) {
      await loadPosts();
    }
  }, [userId, friendsOnly]);

  const handleLike = useCallback(async (postId: string) => {
    // Optimistic update
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
      await loadPosts();
    }
  }, [userId]);

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

  return (
    <div className="space-y-4" data-feed-scroll>
      {/* New post form */}
      <NewPostForm channels={channels} onSubmit={handleCreatePost} />

      {/* Feed filter */}
      <div className="flex gap-1">
        <button
          onClick={() => handleToggleFriendsOnly(false)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            !friendsOnly
              ? 'bg-black text-white dark:bg-white dark:text-black'
              : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
          }`}
        >
          All Posts
        </button>
        <button
          onClick={() => handleToggleFriendsOnly(true)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            friendsOnly
              ? 'bg-black text-white dark:bg-white dark:text-black'
              : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
          }`}
        >
          Friends Only
        </button>
      </div>

      {/* "New posts available" banner */}
      {newPostCount > 0 && (
        <button
          onClick={handleLoadNew}
          className="w-full py-2 px-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
        >
          {newPostCount} new {newPostCount === 1 ? 'post' : 'posts'} available — Load new posts
        </button>
      )}

      {/* Posts */}
      {loading ? (
        <div className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">Loading feed...</div>
      ) : posts.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">
          No posts yet. Be the first to share something!
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {posts.map((post) => (
              <PostCard
                key={post._id}
                post={post}
                userId={userId}
                showChannelLabel
                isAdmin={isAdmin}
                onLike={handleLike}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onMessageAuthor={onMessageAuthor}
              />
            ))}
          </div>

          {nextCursor && (
            <div className="text-center pt-2 pb-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
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
