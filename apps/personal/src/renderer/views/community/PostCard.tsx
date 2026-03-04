import React, { useState } from 'react';
import type { CommunityPost } from './types';
import { formatRelativeTime, getInitials, getAvatarGradient } from './types';
import { CommentThread } from './CommentThread';

interface PostCardProps {
  post: CommunityPost;
  userId: string;
  showChannelLabel?: boolean;
  isAdmin?: boolean;
  onLike: (postId: string) => void;
  onEdit?: (postId: string, body: string) => void;
  onDelete?: (postId: string) => void;
  onMessageAuthor?: (userId: string, name: string, photoUrl: string | null) => void;
}

export function PostCard({
  post,
  userId,
  showChannelLabel = false,
  isAdmin,
  onLike,
  onEdit,
  onDelete,
  onMessageAuthor,
}: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body);
  const [showMenu, setShowMenu] = useState(false);

  const initials = getInitials(post.authorName);
  const gradient = getAvatarGradient(post.authorName);
  const isAuthor = post.authorId === userId;
  const isEdited = post.updatedAt > post.createdAt + 1000;
  const canMessage = !isAuthor && !!onMessageAuthor;

  const handleSaveEdit = () => {
    if (editBody.trim() && onEdit) {
      onEdit(post._id, editBody.trim());
      setIsEditing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl p-4">
      {/* Header: Avatar + Name + Channel + Time */}
      <div className="flex items-start gap-3">
        {post.authorPhotoUrl ? (
          <img
            src={post.authorPhotoUrl}
            alt={post.authorName}
            className={`w-9 h-9 rounded-full object-cover flex-shrink-0 ${canMessage ? 'cursor-pointer hover:ring-2 hover:ring-black/20 dark:hover:ring-white/20 transition-shadow' : ''}`}
            onClick={canMessage ? () => onMessageAuthor!(post.authorId, post.authorName, post.authorPhotoUrl) : undefined}
          />
        ) : (
          <div
            className={`w-9 h-9 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 ${canMessage ? 'cursor-pointer hover:ring-2 hover:ring-black/20 dark:hover:ring-white/20 transition-shadow' : ''}`}
            onClick={canMessage ? () => onMessageAuthor!(post.authorId, post.authorName, post.authorPhotoUrl) : undefined}
          >
            {initials}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`font-semibold text-sm text-gray-900 dark:text-white ${canMessage ? 'cursor-pointer hover:underline' : ''}`}
              onClick={canMessage ? () => onMessageAuthor!(post.authorId, post.authorName, post.authorPhotoUrl) : undefined}
            >
              {post.authorName}
            </span>
            {showChannelLabel && post.channelName && (
              <span className="text-xs text-gray-400 dark:text-zinc-500">
                in <span className="text-gray-600 dark:text-zinc-300 font-medium">#{post.channelSlug || post.channelName}</span>
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-zinc-500">
              {formatRelativeTime(post.createdAt)}
            </span>
            {post.visibility === 'friends' && (
              <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400" title="Friends only">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                Friends
              </span>
            )}
            {isEdited && (
              <span className="text-xs text-gray-400 dark:text-zinc-500 italic">(edited)</span>
            )}
          </div>
        </div>

        {/* Menu for author/admin actions */}
        {(isAuthor || isAdmin) && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 rounded"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-6 z-20 bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg py-1 min-w-[120px]">
                  {isAuthor && (
                    <button
                      onClick={() => { setIsEditing(true); setShowMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-600"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => { onDelete?.(post._id); setShowMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-zinc-600"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {isEditing ? (
        <div className="mt-3">
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="w-full border border-gray-300 dark:border-zinc-600 rounded-lg p-2 text-sm bg-white dark:bg-zinc-900 text-gray-900 dark:text-white resize-none"
            rows={3}
            maxLength={5000}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleSaveEdit}
              className="px-3 py-1 text-xs font-medium bg-black text-white dark:bg-white dark:text-black rounded-md hover:opacity-80"
            >
              Save
            </button>
            <button
              onClick={() => { setIsEditing(false); setEditBody(post.body); }}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-800 dark:text-zinc-200 whitespace-pre-wrap break-words ml-12">
          {post.body}
        </p>
      )}

      {/* Actions: Like + Comment */}
      <div className="flex items-center gap-4 mt-3 ml-12">
        <button
          onClick={() => onLike(post._id)}
          className={`flex items-center gap-1 text-xs transition-colors ${
            post.isLikedByMe
              ? 'text-red-500'
              : 'text-gray-400 dark:text-zinc-500 hover:text-red-500'
          }`}
        >
          <svg className="w-4 h-4" fill={post.isLikedByMe ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={post.isLikedByMe ? 0 : 2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
          {post.likeCount > 0 && <span>{post.likeCount}</span>}
        </button>

        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1 text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
          </svg>
          {post.commentCount > 0 && <span>{post.commentCount}</span>}
        </button>
      </div>

      {/* Comment thread (expandable) */}
      {showComments && (
        <div className="mt-3 ml-12">
          <CommentThread postId={post._id} userId={userId} isAdmin={isAdmin} />
        </div>
      )}
    </div>
  );
}
