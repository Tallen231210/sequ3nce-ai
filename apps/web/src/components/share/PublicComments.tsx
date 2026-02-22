"use client";

import { Clock } from "lucide-react";

interface Comment {
  authorName: string;
  authorType: string;
  content: string;
  timestampSeconds?: number;
  createdAt: number;
}

interface PublicCommentsProps {
  comments: Comment[];
  onSeek: (time: number) => void;
}

export function PublicComments({ comments, onSeek }: PublicCommentsProps) {
  if (comments.length === 0) {
    return (
      <div className="p-4 text-sm text-zinc-400 text-center">
        No comments on this call.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {comments.map((comment, index) => (
        <div
          key={index}
          className={`p-3 rounded-lg bg-zinc-50 hover:bg-zinc-100 transition-colors ${
            comment.timestampSeconds != null ? "cursor-pointer" : ""
          }`}
          onClick={() => {
            if (comment.timestampSeconds != null) {
              onSeek(comment.timestampSeconds);
            }
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-700">
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
              {comment.timestampSeconds != null && (
                <span className="flex items-center gap-0.5 text-[10px] text-blue-600 font-mono">
                  <Clock className="h-3 w-3" />
                  {formatTime(comment.timestampSeconds)}
                </span>
              )}
            </div>
            <span className="text-[10px] text-zinc-300">
              {formatRelativeTime(comment.createdAt)}
            </span>
          </div>
          <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">
            {comment.content}
          </p>
        </div>
      ))}
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
