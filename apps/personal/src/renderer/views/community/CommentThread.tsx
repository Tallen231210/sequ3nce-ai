import React, { useState, useEffect, useRef } from 'react';
import type { CommunityComment } from './types';
import { formatRelativeTime, getInitials, getAvatarGradient } from './types';
import { getPostComments, createPostComment, toggleCommentLike, editPostComment, deletePostComment } from '../../convex';

interface CommentThreadProps {
  postId: string;
  userId: string;
}

export function CommentThread({ postId, userId }: CommentThreadProps) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadComments();
    return () => { mountedRef.current = false; };
  }, [postId]);

  const loadComments = async () => {
    setLoading(true);
    const result = await getPostComments(postId, userId);
    if (mountedRef.current) {
      setComments(result.comments);
      setLoading(false);
    }
  };

  const handleSubmitReply = async () => {
    const body = replyText.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    const result = await createPostComment(userId, postId, body);
    if (mountedRef.current) {
      if (!result.error) {
        setReplyText('');
        await loadComments();
      }
      setSubmitting(false);
    }
  };

  const handleLike = async (commentId: string) => {
    // Optimistic update
    setComments((prev) =>
      prev.map((c) =>
        c._id === commentId
          ? {
              ...c,
              isLikedByMe: !c.isLikedByMe,
              likeCount: c.isLikedByMe ? c.likeCount - 1 : c.likeCount + 1,
            }
          : c
      )
    );
    const result = await toggleCommentLike(userId, commentId);
    if (result.error && mountedRef.current) {
      await loadComments();
    }
  };

  const handleEdit = async (commentId: string, body: string) => {
    const result = await editPostComment(userId, commentId, body);
    if (result.success && mountedRef.current) {
      await loadComments();
    }
  };

  const handleDelete = async (commentId: string) => {
    const result = await deletePostComment(userId, commentId);
    if (result.success && mountedRef.current) {
      setComments((prev) => prev.filter((c) => c._id !== commentId));
    }
  };

  if (loading) {
    return <div className="text-xs text-gray-400 dark:text-zinc-500 py-2">Loading comments...</div>;
  }

  return (
    <div className="space-y-3">
      {comments.length === 0 && (
        <div className="text-xs text-gray-400 dark:text-zinc-500 py-1">No comments yet. Be the first to reply.</div>
      )}

      {comments.map((comment) => (
        <CommentItem
          key={comment._id}
          comment={comment}
          userId={userId}
          onLike={handleLike}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      ))}

      {/* Reply form */}
      <div className="flex gap-2 pt-1">
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Write a reply..."
          className="flex-1 border border-gray-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-zinc-900 text-gray-900 dark:text-white resize-none placeholder:text-gray-400"
          rows={1}
          maxLength={2000}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmitReply();
            }
          }}
        />
        <button
          onClick={handleSubmitReply}
          disabled={!replyText.trim() || submitting}
          className="px-3 py-1 text-xs font-medium bg-black text-white dark:bg-white dark:text-black rounded-md hover:opacity-80 disabled:opacity-40 self-end"
        >
          Reply
        </button>
      </div>
    </div>
  );
}

// Individual comment item
function CommentItem({
  comment,
  userId,
  onLike,
  onEdit,
  onDelete,
}: {
  comment: CommunityComment;
  userId: string;
  onLike: (id: string) => void;
  onEdit: (id: string, body: string) => void;
  onDelete: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const initials = getInitials(comment.authorName);
  const gradient = getAvatarGradient(comment.authorName);
  const isAuthor = comment.authorId === userId;
  const isEdited = comment.updatedAt > comment.createdAt + 1000;

  return (
    <div className="flex gap-2">
      {comment.authorPhotoUrl ? (
        <img src={comment.authorPhotoUrl} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0 mt-0.5" />
      ) : (
        <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0 mt-0.5`}>
          {initials}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-900 dark:text-white">{comment.authorName}</span>
          <span className="text-[10px] text-gray-400 dark:text-zinc-500">{formatRelativeTime(comment.createdAt)}</span>
          {isEdited && <span className="text-[10px] text-gray-400 dark:text-zinc-500 italic">(edited)</span>}
        </div>

        {isEditing ? (
          <div className="mt-1">
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="w-full border border-gray-200 dark:border-zinc-600 rounded px-2 py-1 text-xs bg-white dark:bg-zinc-900 text-gray-900 dark:text-white resize-none"
              rows={2}
              maxLength={2000}
            />
            <div className="flex gap-1.5 mt-1">
              <button
                onClick={() => { onEdit(comment._id, editBody.trim()); setIsEditing(false); }}
                className="text-[10px] font-medium text-blue-600 dark:text-blue-400"
              >
                Save
              </button>
              <button
                onClick={() => { setIsEditing(false); setEditBody(comment.body); }}
                className="text-[10px] text-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-700 dark:text-zinc-300 mt-0.5 whitespace-pre-wrap break-words">{comment.body}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 mt-1">
          <button
            onClick={() => onLike(comment._id)}
            className={`flex items-center gap-0.5 text-[10px] transition-colors ${
              comment.isLikedByMe ? 'text-red-500' : 'text-gray-400 dark:text-zinc-500 hover:text-red-500'
            }`}
          >
            <svg className="w-3 h-3" fill={comment.isLikedByMe ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={comment.isLikedByMe ? 0 : 2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
            {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
          </button>

          {isAuthor && !isEditing && (
            <>
              <button onClick={() => setIsEditing(true)} className="text-[10px] text-gray-400 dark:text-zinc-500 hover:text-gray-600">Edit</button>
              <button onClick={() => onDelete(comment._id)} className="text-[10px] text-gray-400 dark:text-zinc-500 hover:text-red-500">Delete</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
