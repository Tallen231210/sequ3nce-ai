import React, { useState, useEffect, useRef } from 'react';
import type { CommunityComment } from './types';
import { formatRelativeTime, getInitials, getAvatarGradient } from './types';
import { getPostComments, createPostComment, toggleCommentLike, editPostComment, deletePostComment } from '../../convex';

interface CommentThreadProps {
  postId: string;
  userId: string;
  isAdmin?: boolean;
}

export function CommentThread({ postId, userId, isAdmin }: CommentThreadProps) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyingToName, setReplyingToName] = useState('');
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
    const result = await createPostComment(userId, postId, body, replyingToId || undefined);
    if (mountedRef.current) {
      if (!result.error) {
        setReplyText('');
        setReplyingToId(null);
        setReplyingToName('');
        await loadComments();
      }
      setSubmitting(false);
    }
  };

  const handleLike = async (commentId: string) => {
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
      setComments((prev) => prev.filter((c) => c._id !== commentId && c.parentCommentId !== commentId));
    }
  };

  const handleReply = (commentId: string, authorName: string) => {
    setReplyingToId(commentId);
    setReplyingToName(authorName);
  };

  const cancelReply = () => {
    setReplyingToId(null);
    setReplyingToName('');
  };

  if (loading) {
    return <div className="text-xs text-gray-400 dark:text-gray-500 py-2">Loading comments...</div>;
  }

  // Group comments: top-level and replies
  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesByParent = new Map<string, CommunityComment[]>();
  for (const c of comments) {
    if (c.parentCommentId) {
      const existing = repliesByParent.get(c.parentCommentId) || [];
      existing.push(c);
      repliesByParent.set(c.parentCommentId, existing);
    }
  }

  return (
    <div className="space-y-3">
      {topLevel.length === 0 && (
        <div className="text-xs text-gray-400 dark:text-gray-500 py-1">No comments yet. Be the first to reply.</div>
      )}

      {topLevel.map((comment) => (
        <div key={comment._id}>
          <CommentItem
            comment={comment}
            userId={userId}
            isAdmin={isAdmin}
            onLike={handleLike}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onReply={handleReply}
            isReply={false}
          />
          {/* Threaded replies */}
          {repliesByParent.has(comment._id) && (
            <div className="ml-6 mt-2 space-y-2 border-l-2 border-gray-200 dark:border-gray-600 pl-3">
              {repliesByParent.get(comment._id)!.map((reply) => (
                <CommentItem
                  key={reply._id}
                  comment={reply}
                  userId={userId}
                  isAdmin={isAdmin}
                  onLike={handleLike}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  isReply={true}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Reply indicator */}
      {replyingToId && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded px-2 py-1">
          <span>Replying to <span className="font-semibold">@{replyingToName}</span></span>
          <button
            onClick={cancelReply}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Reply form */}
      <div className="flex gap-2 pt-1">
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder={replyingToId ? `Reply to @${replyingToName}...` : 'Write a reply...'}
          className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none placeholder:text-gray-400"
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
  isAdmin,
  onLike,
  onEdit,
  onDelete,
  onReply,
  isReply,
}: {
  comment: CommunityComment;
  userId: string;
  isAdmin?: boolean;
  onLike: (id: string) => void;
  onEdit: (id: string, body: string) => void;
  onDelete: (id: string) => void;
  onReply?: (id: string, name: string) => void;
  isReply: boolean;
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
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatRelativeTime(comment.createdAt)}</span>
          {isEdited && <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">(edited)</span>}
        </div>

        {isEditing ? (
          <div className="mt-1">
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"
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
          <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 whitespace-pre-wrap break-words">{comment.body}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 mt-1">
          <button
            onClick={() => onLike(comment._id)}
            className={`flex items-center gap-0.5 text-[10px] transition-colors ${
              comment.isLikedByMe ? 'text-red-500' : 'text-gray-400 dark:text-gray-500 hover:text-red-500'
            }`}
          >
            <svg className="w-3 h-3" fill={comment.isLikedByMe ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={comment.isLikedByMe ? 0 : 2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
            {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
          </button>

          {/* Reply button — only on top-level comments */}
          {!isReply && onReply && (
            <button
              onClick={() => onReply(comment._id, comment.authorName)}
              className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Reply
            </button>
          )}

          {isAuthor && !isEditing && (
            <button onClick={() => setIsEditing(true)} className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600">Edit</button>
          )}
          {(isAuthor || isAdmin) && !isEditing && (
            <button onClick={() => onDelete(comment._id)} className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-red-500">Delete</button>
          )}
        </div>
      </div>
    </div>
  );
}
