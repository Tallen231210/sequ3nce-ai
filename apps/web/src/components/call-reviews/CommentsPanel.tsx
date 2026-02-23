"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { MessageCircle, Clock, Pin, Send, Trash2 } from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { formatTime, formatRelativeTime } from "./utils";

const MAX_COMMENT_LENGTH = 2000;

interface CommentsPanelProps {
  callId: Id<"calls">;
  teamId: Id<"teams">;
  currentTime: number;
  onSeek: (time: number) => void;
  userId: string;
  userName: string;
}

function CommentBubble({
  comment,
  userId,
  isDeletingId,
  onSeek,
  onDelete,
  isReply,
}: {
  comment: { _id: Id<"callComments">; authorName: string; authorId: string; authorType: string; content: string; timestampSeconds?: number; createdAt: number };
  userId: string;
  isDeletingId: string | null;
  onSeek: (time: number) => void;
  onDelete: (id: Id<"callComments">) => void;
  isReply?: boolean;
}) {
  return (
    <div
      className={`group p-3 rounded-lg transition-colors cursor-pointer ${
        isReply
          ? "bg-zinc-50/60 hover:bg-zinc-100/80 border-l-2 border-zinc-200"
          : "bg-zinc-50 hover:bg-zinc-100"
      }`}
      onClick={() => {
        if (comment.timestampSeconds !== undefined) {
          onSeek(comment.timestampSeconds);
        }
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            {comment.authorName}
          </span>
          <span
            className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${
              comment.authorType === "manager"
                ? "bg-blue-50 text-blue-600"
                : "bg-emerald-50 text-emerald-600"
            }`}
          >
            {comment.authorType}
          </span>
          {comment.timestampSeconds !== undefined && (
            <span className="flex items-center gap-0.5 text-[10px] text-blue-600 font-mono">
              <Clock className="h-3 w-3" />
              {formatTime(comment.timestampSeconds)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {formatRelativeTime(comment.createdAt)}
          </span>
          {comment.authorId === userId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(comment._id);
              }}
              disabled={isDeletingId === comment._id}
              className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all disabled:opacity-50"
            >
              <Trash2 className={`h-3 w-3 ${isDeletingId === comment._id ? "animate-pulse" : ""}`} />
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-foreground leading-relaxed">
        {comment.content}
      </p>
    </div>
  );
}

export function CommentsPanel({
  callId,
  teamId,
  currentTime,
  onSeek,
  userId,
  userName,
}: CommentsPanelProps) {
  const comments = useQuery(api.callReviews.getCommentsForCall, { callId });
  const addComment = useMutation(api.callReviews.addComment);
  const deleteComment = useMutation(api.callReviews.deleteComment);

  const [newComment, setNewComment] = useState("");
  const [pinToTime, setPinToTime] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new comments
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments?.length]);

  const [commentError, setCommentError] = useState<string | null>(null);
  const handleSubmit = async () => {
    const trimmed = newComment.trim();
    if (!trimmed || isSubmitting) return;
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setCommentError(`Comment too long (${trimmed.length}/${MAX_COMMENT_LENGTH} chars)`);
      return;
    }

    setIsSubmitting(true);
    setCommentError(null);
    try {
      await addComment({
        callId,
        teamId,
        authorType: "manager",
        authorId: userId,
        authorName: userName,
        content: trimmed,
        timestampSeconds: pinToTime ? Math.floor(currentTime) : undefined,
      });
      setNewComment("");
    } catch (error) {
      console.error("Failed to add comment:", error);
      setCommentError("Failed to send. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const handleDelete = async (commentId: Id<"callComments">) => {
    if (isDeletingId) return;
    setIsDeletingId(commentId);
    try {
      await deleteComment({ commentId, authorId: userId });
    } catch (error) {
      console.error("Failed to delete comment:", error);
    } finally {
      setIsDeletingId(null);
    }
  };

  const charsRemaining = MAX_COMMENT_LENGTH - newComment.trim().length;
  const isNearLimit = charsRemaining < 200 && charsRemaining >= 0;

  // Group comments: top-level parents + replies nested underneath
  const { topLevel, replyMap } = useMemo(() => {
    if (!comments) return { topLevel: [], replyMap: new Map<string, typeof comments>() };
    const commentIds = new Set(comments.map((c) => c._id));
    const top = comments.filter((c) => !c.parentCommentId || !commentIds.has(c.parentCommentId));
    const replies = new Map<string, typeof comments>();
    for (const c of comments) {
      if (c.parentCommentId && commentIds.has(c.parentCommentId)) {
        const existing = replies.get(c.parentCommentId) ?? [];
        existing.push(c);
        replies.set(c.parentCommentId, existing);
      }
    }
    return { topLevel: top, replyMap: replies };
  }, [comments]);

  return (
    <div className="flex flex-col h-full">
      {/* Comments list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!comments ? (
          <p className="text-sm text-muted-foreground">Loading comments...</p>
        ) : comments.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No comments yet</p>
            <p className="text-xs text-zinc-400 mt-1">
              Add feedback to help the closer improve
            </p>
          </div>
        ) : (
          topLevel.map((comment) => (
            <div key={comment._id}>
              {/* Parent comment */}
              <CommentBubble
                comment={comment}
                userId={userId}
                isDeletingId={isDeletingId}
                onSeek={onSeek}
                onDelete={handleDelete}
              />
              {/* Replies nested underneath */}
              {replyMap.get(comment._id)?.map((reply) => (
                <div key={reply._id} className="ml-4 mt-1.5">
                  <CommentBubble
                    comment={reply}
                    userId={userId}
                    isDeletingId={isDeletingId}
                    onSeek={onSeek}
                    onDelete={handleDelete}
                    isReply
                  />
                </div>
              ))}
            </div>
          ))
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Add comment form — pb-20 clears the floating chat button */}
      <div className="border-t border-border p-3 pb-20">
        {commentError && (
          <p className="text-xs text-red-500 mb-2">{commentError}</p>
        )}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setPinToTime(!pinToTime)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
              pinToTime
                ? "bg-blue-50 text-blue-600 border border-blue-200"
                : "text-muted-foreground hover:bg-zinc-100"
            }`}
          >
            <Pin className="h-3 w-3" />
            {pinToTime ? formatTime(currentTime) : "No timestamp"}
          </button>
          {isNearLimit && (
            <span className={`text-[10px] ml-auto ${charsRemaining < 0 ? "text-red-500" : "text-zinc-400"}`}>
              {charsRemaining} chars left
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => {
              setNewComment(e.target.value);
              if (commentError) setCommentError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            disabled={isSubmitting}
            maxLength={MAX_COMMENT_LENGTH + 100} // Allow slight overshoot, validate on submit
            placeholder="Add feedback..."
            className="flex-1 text-sm px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!newComment.trim() || isSubmitting || charsRemaining < 0}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
