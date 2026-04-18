import React, { useState } from 'react';
import type { CommunityPost } from './types';
import { formatRelativeTime, getInitials, getAvatarGradient } from './types';
import { CommentThread } from './CommentThread';
import { ReactionPills } from './ReactionPills';
import { BroadcastCard } from './moneyBells/BroadcastCard';

interface PostCardProps {
  post: CommunityPost;
  userId: string;
  showChannelLabel?: boolean;
  isAdmin?: boolean;
  isGrouped?: boolean;
  onLike: (postId: string) => void;
  onEdit?: (postId: string, body: string) => void;
  onDelete?: (postId: string) => void;
  onReact?: (postId: string, emoji: string) => void;
  onUnreact?: (postId: string, emoji: string) => void;
  onPin?: (postId: string) => void;
  onUnpin?: (postId: string) => void;
}

export function PostCard(props: PostCardProps) {
  // Money Bells broadcast variant — dispatch to BroadcastCard before any hooks
  // to keep hook order stable and let BroadcastCard manage its own state.
  if (props.post.broadcastId && props.post.broadcastData) {
    return (
      <BroadcastCard
        post={props.post}
        userId={props.userId}
        isAdmin={props.isAdmin}
        onReact={props.onReact}
        onUnreact={props.onUnreact}
        onDelete={props.onDelete}
      />
    );
  }
  return <StandardPostCard {...props} />;
}

function StandardPostCard({
  post,
  userId,
  showChannelLabel = false,
  isAdmin,
  isGrouped = false,
  onLike,
  onEdit,
  onDelete,
  onReact,
  onUnreact,
  onPin,
  onUnpin,
}: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body);
  const [showMenu, setShowMenu] = useState(false);

  const initials = getInitials(post.authorName);
  const gradient = getAvatarGradient(post.authorName);
  const isAuthor = post.authorId === userId;
  const isEdited = post.updatedAt > post.createdAt + 1000;

  const handleSaveEdit = () => {
    if (editBody.trim() && onEdit) {
      onEdit(post._id, editBody.trim());
      setIsEditing(false);
    }
  };

  // Build reaction counts with legacy like fallback
  const effectiveReactionCounts = { ...(post.reactionCounts ?? {}) };
  if (Object.keys(effectiveReactionCounts).length === 0 && post.likeCount > 0) {
    effectiveReactionCounts.heart = post.likeCount;
  }
  const effectiveMyReactions = [...(post.myReactions ?? [])];
  if (effectiveMyReactions.length === 0 && post.isLikedByMe && post.likeCount > 0 && !post.reactionCounts) {
    effectiveMyReactions.push('heart');
  }

  return (
    <div className={`group relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 transition-colors ${isGrouped ? 'py-1 px-4 border-0 rounded-none bg-transparent dark:bg-transparent' : 'p-4'}`}>
      {/* Pin indicator */}
      {post.isPinned && !isGrouped && (
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-2">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
          Pinned
        </div>
      )}

      {/* Hover toolbar */}
      <div className="absolute -top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center gap-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-sm px-1 py-0.5">
        <button
          onClick={() => setShowComments(!showComments)}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
          title="Comment"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
          </svg>
        </button>
        {(isAuthor || isAdmin) && (
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
                  {isAuthor && (
                    <button
                      onClick={() => { setIsEditing(true); setShowMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                    >
                      Edit
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => { post.isPinned ? onUnpin?.(post._id) : onPin?.(post._id); setShowMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                    >
                      {post.isPinned ? 'Unpin' : 'Pin'}
                    </button>
                  )}
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
        )}
      </div>

      {/* Header: Avatar + Name + Channel + Time (hidden when grouped) */}
      {!isGrouped && (
        <div className="flex items-start gap-3">
          {post.authorPhotoUrl ? (
            <img
              src={post.authorPhotoUrl}
              alt={post.authorName}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div
              className={`w-9 h-9 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-xs flex-shrink-0`}
            >
              {initials}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="font-semibold text-sm text-gray-900 dark:text-white"
              >
                {post.authorName}
              </span>
              {post.authorBadges?.includes('founder') && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                  Founder
                </span>
              )}
              {post.authorBadges?.includes('pioneer1') && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" /></svg>
                  Pioneer #1
                </span>
              )}
              {showChannelLabel && post.channelName && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  in <span className="text-gray-600 dark:text-gray-300 font-medium">#{post.channelSlug || post.channelName}</span>
                </span>
              )}
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {formatRelativeTime(post.createdAt)}
              </span>
              {post.visibility === 'friends' && (
                <span className="inline-flex items-center gap-0.5 text-xs text-gray-500 dark:text-gray-400" title="Friends only">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  Friends
                </span>
              )}
              {isEdited && (
                <span className="text-xs text-gray-400 dark:text-gray-500 italic">(edited)</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      {isEditing ? (
        <div className={isGrouped ? '' : 'mt-3'}>
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"
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
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className={`text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words ${isGrouped ? 'ml-12' : 'mt-2 ml-12'}`}>
          {post.body}
          {isGrouped && (
            <span className="ml-2 text-[10px] text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
              {formatRelativeTime(post.createdAt)}
            </span>
          )}
        </p>
      )}

      {/* Reaction pills */}
      {!isEditing && (
        <div className="mt-2 ml-12">
          <ReactionPills
            reactionCounts={effectiveReactionCounts}
            myReactions={effectiveMyReactions}
            onReact={(emoji) => onReact?.(post._id, emoji)}
            onUnreact={(emoji) => onUnreact?.(post._id, emoji)}
          />
        </div>
      )}

      {/* Comment count indicator */}
      {!showComments && post.commentCount > 0 && !isGrouped && (
        <button
          onClick={() => setShowComments(true)}
          className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors mt-2 ml-12"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
          </svg>
          {post.commentCount} {post.commentCount === 1 ? 'reply' : 'replies'}
        </button>
      )}

      {/* Comment thread (expandable) */}
      {showComments && (
        <div className="mt-3 ml-12">
          <CommentThread postId={post._id} userId={userId} isAdmin={isAdmin} />
        </div>
      )}
    </div>
  );
}
