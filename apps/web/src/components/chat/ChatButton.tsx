"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export function ChatButton({ isOpen, onClick }: ChatButtonProps) {
  const { user } = useTeam();

  // Get total unread count for the manager
  const unreadData = useQuery(
    api.liveMessages.getTotalUnreadForManager,
    user?._id ? { userId: user._id } : "skip"
  );

  const unreadCount = unreadData?.count ?? 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-6 z-50 flex items-center justify-center",
        "h-14 w-14 rounded-full shadow-lg transition-all duration-200",
        "hover:scale-105 active:scale-95",
        isOpen
          ? "bg-zinc-800 text-white"
          : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50"
      )}
    >
      <MessageCircle
        className={cn("h-6 w-6", isOpen && "rotate-12")}
        strokeWidth={1.5}
      />

      {/* Unread badge */}
      {unreadCount > 0 && !isOpen && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
