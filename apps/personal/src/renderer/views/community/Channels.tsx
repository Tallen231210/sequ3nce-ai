import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePoll } from '../../lib/usePoll';
import {
  getChannelPosts,
  getNewPostCount,
  createCommunityPost,
  togglePostLike,
  editCommunityPost,
  deleteCommunityPost,
} from '../../convex';
import type { CommunityChannel, CommunityPost } from './types';
import { PostCard } from './PostCard';
import { NewPostForm } from './NewPostForm';

interface ChannelsProps {
  userId: string;
  channels: CommunityChannel[];
  isAdmin?: boolean;
}

const POLL_INTERVAL = 10_000;

export function Channels({ userId, channels, isAdmin }: ChannelsProps) {
  const [selectedChannel, setSelectedChannel] = useState<CommunityChannel | null>(
    channels[0] ?? null
  );
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
    if (selectedChannel) {
      loadPosts(selectedChannel._id);
    }
  }, [selectedChannel?._id]);

  // Poll for new posts — task #348
  usePoll(
    'newPostCount',
    async () => {
      if (!mountedRef.current) return;
      const count = await getNewPostCount(lastFetchedRef.current);
      if (mountedRef.current) setNewPostCount(count);
    },
    POLL_INTERVAL,
    { immediate: false },
  );

  const loadPosts = async (channelId: string) => {
    setLoading(true);
    const result = await getChannelPosts(channelId, userId);
    if (mountedRef.current) {
      setPosts(result.posts);
      setNextCursor(result.nextCursor);
      lastFetchedRef.current = Date.now();
      setNewPostCount(0);
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore || !selectedChannel) return;
    setLoadingMore(true);
    const result = await getChannelPosts(selectedChannel._id, userId, undefined, nextCursor);
    if (mountedRef.current) {
      setPosts((prev) => [...prev, ...result.posts]);
      setNextCursor(result.nextCursor);
      setLoadingMore(false);
    }
  };

  const handleLoadNew = async () => {
    if (selectedChannel) {
      await loadPosts(selectedChannel._id);
    }
  };

  const handleCreatePost = useCallback(async (channelId: string, body: string, visibility?: string) => {
    const result = await createCommunityPost(userId, channelId, body, visibility);
    if (!result.error && selectedChannel) {
      await loadPosts(selectedChannel._id);
    }
  }, [userId, selectedChannel]);

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
    if (result.error && mountedRef.current && selectedChannel) {
      await loadPosts(selectedChannel._id);
    }
  }, [userId, selectedChannel]);

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
    <div className="flex gap-4 min-h-0">
      {/* Channel list — left panel */}
      <div className="w-[180px] flex-shrink-0 space-y-0.5">
        {channels.map((ch) => (
          <button
            key={ch._id}
            onClick={() => setSelectedChannel(ch)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              selectedChannel?._id === ch._id
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <div className="font-medium truncate">#{ch.slug}</div>
            <div className={`text-[10px] truncate mt-0.5 ${
              selectedChannel?._id === ch._id
                ? 'text-white/70 dark:text-black/60'
                : 'text-gray-400 dark:text-gray-500'
            }`}>
              {ch.postCount} {ch.postCount === 1 ? 'post' : 'posts'}
            </div>
          </button>
        ))}
      </div>

      {/* Posts — right panel */}
      <div className="flex-1 min-w-0 space-y-4">
        {selectedChannel && (
          <>
            {/* Channel header */}
            <div className="pb-2 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                #{selectedChannel.slug}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {selectedChannel.description}
              </p>
            </div>

            {/* New post form */}
            <NewPostForm
              channels={channels}
              selectedChannelId={selectedChannel._id}
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
                No posts yet. Be the first to post in #{selectedChannel.slug}!
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {posts.map((post) => (
                    <PostCard
                      key={post._id}
                      post={post}
                      userId={userId}
                      isAdmin={isAdmin}
                      onLike={handleLike}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
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
          </>
        )}
      </div>
    </div>
  );
}
