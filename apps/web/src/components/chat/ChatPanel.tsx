"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { X, Loader2, MessageCircle, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChatConversation } from "./ChatConversation";

interface CloserWithStatus {
  _id: string;
  name: string;
  email: string;
  isOnCall: boolean;
  unreadCount: number;
  lastMessage: {
    message: string;
    createdAt: number;
    isFromCloser: boolean;
  } | null;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function CloserListItem({
  closer,
  onClick,
}: {
  closer: CloserWithStatus;
  onClick: () => void;
}) {
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 p-3 hover:bg-zinc-50 transition-colors text-left"
    >
      {/* Avatar with status */}
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-zinc-800 text-white text-sm">
            {getInitials(closer.name)}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white",
            closer.isOnCall ? "bg-green-500" : "bg-zinc-300"
          )}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm truncate">{closer.name}</p>
          {closer.lastMessage && (
            <span className="text-[10px] text-zinc-400 shrink-0">
              {formatRelativeTime(closer.lastMessage.createdAt)}
            </span>
          )}
        </div>

        {/* Last message preview */}
        {closer.lastMessage ? (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {closer.lastMessage.isFromCloser ? "" : "You: "}
            {closer.lastMessage.message}
          </p>
        ) : (
          <p className="text-xs text-zinc-400 mt-0.5">No messages yet</p>
        )}

        {/* Status badges */}
        <div className="flex items-center gap-2 mt-1">
          {closer.isOnCall && (
            <span className="inline-flex items-center gap-1 text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
              <Phone className="h-2.5 w-2.5" />
              On call
            </span>
          )}
        </div>
      </div>

      {/* Unread badge */}
      {closer.unreadCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
          {closer.unreadCount > 9 ? "9+" : closer.unreadCount}
        </span>
      )}
    </button>
  );
}

export function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const { team, user } = useTeam();
  const [selectedCloser, setSelectedCloser] = useState<CloserWithStatus | null>(
    null
  );

  // Get closers with message status
  const closersWithStatus = useQuery(
    api.liveMessages.getClosersWithMessageStatus,
    team?._id && user?._id
      ? { teamId: team._id, userId: user._id }
      : "skip"
  ) as CloserWithStatus[] | undefined;

  const handleSelectCloser = (closer: CloserWithStatus) => {
    setSelectedCloser(closer);
  };

  const handleBack = () => {
    setSelectedCloser(null);
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed bottom-24 right-6 z-50 w-80 h-[500px] max-h-[calc(100vh-140px)]",
        "bg-white rounded-xl shadow-xl border border-zinc-200",
        "flex flex-col overflow-hidden",
        "animate-in slide-in-from-bottom-2 fade-in duration-200"
      )}
    >
      {selectedCloser ? (
        <ChatConversation closer={selectedCloser} onBack={handleBack} />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-200">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-zinc-600" />
              <h3 className="font-semibold text-sm">Team Messages</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Closer list */}
          <div className="flex-1 overflow-y-auto">
            {closersWithStatus === undefined ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
              </div>
            ) : closersWithStatus.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <MessageCircle className="h-10 w-10 text-zinc-300 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No closers on your team yet
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Add team members to start messaging
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {closersWithStatus.map((closer) => (
                  <CloserListItem
                    key={closer._id}
                    closer={closer}
                    onClick={() => handleSelectCloser(closer)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
