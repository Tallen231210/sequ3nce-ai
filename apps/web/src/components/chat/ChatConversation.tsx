"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface CloserInfo {
  _id: string;
  name: string;
  email: string;
  isOnCall: boolean;
}

interface ChatConversationProps {
  closer: CloserInfo;
  onBack: () => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

export function ChatConversation({ closer, onBack }: ChatConversationProps) {
  const { user } = useTeam();
  const [messageText, setMessageText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get conversation messages
  const messages = useQuery(
    api.liveMessages.getConversationMessages,
    user?._id
      ? { userId: user._id, closerId: closer._id }
      : "skip"
  );

  // Mutations
  const sendMessage = useMutation(api.liveMessages.sendMessage);
  const markConversationAsRead = useMutation(api.liveMessages.markConversationAsRead);

  // Mark messages as read when viewing conversation
  useEffect(() => {
    if (user?._id && closer._id) {
      markConversationAsRead({
        userId: user._id,
        closerId: closer._id,
      });
    }
  }, [user?._id, closer._id, markConversationAsRead, messages?.length]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSend = async () => {
    if (!user?._id || !messageText.trim() || isSending) return;

    const text = messageText.trim();
    setMessageText("");
    setIsSending(true);

    try {
      await sendMessage({
        teamId: user.teamId,
        senderType: "manager",
        senderUserId: user._id,
        senderName: user.name || user.email || "Manager",
        recipientType: "closer",
        recipientCloserId: closer._id,
        message: text,
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessageText(text); // Restore message on error
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header - Fixed at top */}
      <div className="flex-shrink-0 flex items-center gap-3 p-4 border-b border-zinc-200 bg-white">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-zinc-800 text-white text-xs">
            {getInitials(closer.name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{closer.name}</p>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                closer.isOnCall ? "bg-green-500" : "bg-zinc-300"
              )}
            />
            <span className="text-xs text-muted-foreground">
              {closer.isOnCall ? "On call" : "Not on call"}
            </span>
          </div>
        </div>
      </div>

      {/* Messages - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
        {messages === undefined ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-sm text-muted-foreground">No messages yet</p>
            <p className="text-xs text-zinc-400 mt-1">
              Send a message to start the conversation
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message._id}
              className={cn(
                "flex",
                message.isFromMe ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-lg px-3 py-2",
                  message.isFromMe
                    ? "bg-zinc-800 text-white"
                    : "bg-zinc-100 text-zinc-800"
                )}
              >
                <p className="text-sm whitespace-pre-wrap break-words">
                  {message.message}
                </p>
                <p
                  className={cn(
                    "text-[10px] mt-1",
                    message.isFromMe ? "text-zinc-400" : "text-zinc-500"
                  )}
                >
                  {formatTime(message.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose - Fixed at bottom */}
      <div className="flex-shrink-0 p-4 border-t border-zinc-200 bg-white">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a message..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            maxLength={500}
            className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-200 disabled:opacity-50"
          />
          <Button
            size="icon"
            className="h-9 w-9"
            onClick={handleSend}
            disabled={!messageText.trim() || isSending}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-zinc-400 mt-1 text-right">
          {messageText.length}/500
        </p>
      </div>
    </div>
  );
}
