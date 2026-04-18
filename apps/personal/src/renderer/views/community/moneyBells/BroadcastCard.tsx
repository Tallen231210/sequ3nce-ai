import React, { useState } from 'react';
import type { CommunityPost } from '../types';
import { getAvatarGradient, getInitials } from '../types';
import { CommentThread } from '../CommentThread';
import { ReactionPills } from '../ReactionPills';

// How long after broadcast a card stays in "celebration" (full-hype) mode
const CELEBRATION_WINDOW_MS = 30 * 60 * 1000;

interface BroadcastCardProps {
  post: CommunityPost;
  userId: string;
  isAdmin?: boolean;
  onReact?: (postId: string, emoji: string) => void;
  onUnreact?: (postId: string, emoji: string) => void;
  onDelete?: (postId: string) => void;
}

function formatCash(n: number): string {
  return `$${n.toLocaleString()}`;
}

function timeAgoShort(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return 'JUST NOW';
  if (mins < 60) return `${mins} MIN AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} HR AGO`;
  return `${Math.floor(hrs / 24)}D AGO`;
}

export function BroadcastCard({ post, userId, isAdmin, onReact, onUnreact, onDelete }: BroadcastCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const broadcast = post.broadcastData;
  if (!broadcast) return null;

  const isFresh = Date.now() - broadcast.broadcastedAt < CELEBRATION_WINDOW_MS;
  const isAuthor = post.authorId === userId;
  const canDelete = isAdmin || (isAuthor && Date.now() - broadcast.broadcastedAt < 60 * 60 * 1000);

  const initials = getInitials(post.authorName);
  const gradient = getAvatarGradient(post.authorName);

  return (
    <div
      className={`group relative border rounded-xl p-4 mb-2.5 transition-colors bg-white dark:bg-gray-900 ${
        isFresh
          ? 'border-gray-900 dark:border-white ring-[3px] ring-[#fde047]'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      {isFresh && (
        <span className="absolute top-2.5 right-3 font-mono text-[9px] font-bold tracking-widest uppercase bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-2 py-0.5 rounded">
          New
        </span>
      )}

      {/* Hover toolbar (delete) */}
      {canDelete && (
        <div className="absolute -top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center gap-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-sm px-1 py-0.5">
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              title="More"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-8 z-20 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 min-w-[120px]">
                  <button
                    onClick={() => { onDelete?.(post._id); setShowMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header: avatar + name + metadata */}
      <div className="flex items-center gap-3 mb-3">
        {post.authorPhotoUrl ? (
          <img src={post.authorPhotoUrl} alt={post.authorName} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-bold text-gray-900 dark:text-white tracking-tight">{post.authorName}</span>
            {post.authorBadges?.includes('founder') && (
              <span className="font-mono inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-[0.15em] bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                Founder
              </span>
            )}
          </div>
          <div className="font-mono text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-[0.08em] mt-0.5">
            Just closed · {timeAgoShort(broadcast.broadcastedAt)}
            {broadcast.isEdited && <span className="ml-1 normal-case tracking-normal">(edited)</span>}
          </div>
        </div>
      </div>

      {/* Big cash number */}
      <div className="ml-12 flex items-baseline gap-3 flex-wrap">
        <span className="text-[32px] font-extrabold text-gray-900 dark:text-white tabular-nums tracking-tight leading-none">
          +{formatCash(broadcast.cashCollected)}
        </span>
      </div>

      {/* Optional note */}
      {post.body && post.body.trim().length > 0 && (
        <p className="ml-12 mt-2 text-[13px] text-gray-600 dark:text-gray-400 leading-relaxed">
          {post.body}
        </p>
      )}

      {/* Actions row — reactions + comment */}
      <div className="ml-12 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <ReactionPills
          reactionCounts={post.reactionCounts ?? {}}
          myReactions={post.myReactions ?? []}
          onReact={(emoji) => onReact?.(post._id, emoji)}
          onUnreact={(emoji) => onUnreact?.(post._id, emoji)}
        />
        <button
          onClick={() => setShowComments(!showComments)}
          className="ml-auto font-mono text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors uppercase tracking-wider flex items-center gap-1.5"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
          </svg>
          {post.commentCount > 0 ? `${post.commentCount} ${post.commentCount === 1 ? 'reply' : 'replies'}` : 'Comment'}
        </button>
      </div>

      {/* Comment thread */}
      {showComments && (
        <div className="ml-12 mt-3">
          <CommentThread postId={post._id} userId={userId} isAdmin={isAdmin} />
        </div>
      )}
    </div>
  );
}
