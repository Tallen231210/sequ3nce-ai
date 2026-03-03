// ChatPanel component for Live Chat feature in AmmoTracker
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage } from '../types/electron';

interface ChatPanelProps {
  closerId: string | null;
  teamId: string | null;
  closerName: string | null;
  onUnreadCountChange?: (count: number) => void;
}

// Format timestamp to relative time or time string
function formatMessageTime(createdAt: number): string {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  // Same day - show time
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  // Different day - show date and time
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
         ' ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Empty state when not logged in
function NotLoggedInState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-zinc-500 py-8 px-4">
      <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <p className="text-xs text-center">Sign in to receive messages from your manager</p>
    </div>
  );
}

// Empty state when no messages
function NoMessagesState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-zinc-500 py-8 px-4">
      <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <p className="text-sm text-gray-500 dark:text-zinc-400 mb-1">No messages yet</p>
      <p className="text-xs text-gray-400 dark:text-zinc-500 text-center">Messages from your manager will appear here</p>
    </div>
  );
}

// Message bubble component
function MessageBubble({ message, isFromMe }: { message: ChatMessage; isFromMe: boolean }) {
  return (
    <div className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isFromMe ? 'items-end' : 'items-start'}`}>
        {/* Sender name (only for messages from manager) */}
        {!isFromMe && (
          <p className="text-[10px] text-gray-500 dark:text-zinc-400 mb-0.5 px-1">{message.senderName}</p>
        )}

        {/* Message bubble */}
        <div className={`px-3 py-2 rounded-xl ${
          isFromMe
            ? 'bg-blue-500 text-white rounded-br-sm'
            : 'bg-gray-100 dark:bg-zinc-700 text-gray-800 dark:text-zinc-200 rounded-bl-sm'
        }`}>
          <p className="text-sm leading-snug whitespace-pre-wrap break-words">{message.message}</p>
        </div>

        {/* Timestamp */}
        <p className={`text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5 px-1 ${isFromMe ? 'text-right' : ''}`}>
          {formatMessageTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

// Compose message area
function ComposeArea({
  onSend,
  isSending,
  error
}: {
  onSend: (text: string) => void;
  isSending: boolean;
  error: string | null;
}) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    onSend(trimmed);
    setText('');
  };

  const canSend = text.trim().length > 0 && !isSending;

  return (
    <div className="p-2 border-t border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
      {error && (
        <p className="text-[11px] text-red-500 dark:text-red-400 mb-1 px-1">{error}</p>
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a reply..."
          disabled={isSending}
          className="flex-1 px-3 py-2 text-sm text-gray-700 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-500 focus:ring-1 focus:ring-gray-400 dark:focus:ring-zinc-500 transition-all duration-150 placeholder-gray-400 dark:placeholder-zinc-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canSend}
          className={`p-2 rounded-lg transition-all duration-150 ${
            canSend
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-100 dark:bg-zinc-700 text-gray-400 dark:text-zinc-500'
          }`}
        >
          {isSending ? (
            <div className="w-4 h-4 border-2 border-gray-300 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}

export function ChatPanel({ closerId, teamId, closerName, onUnreadCountChange }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!closerId || !window.ammoTracker?.chatGetMessages) return;

    try {
      const data = await window.ammoTracker.chatGetMessages(closerId, 100);
      // Add isFromMe property based on senderType
      const messagesWithFromMe = data.map((msg: ChatMessage) => ({
        ...msg,
        isFromMe: msg.senderType === 'closer'
      }));
      setMessages(messagesWithFromMe);
    } catch (error) {
      console.error('[ChatPanel] Failed to fetch messages:', error);
    }
  }, [closerId]);

  // Mark messages as read
  const markAsRead = useCallback(async () => {
    if (!closerId || !window.ammoTracker?.chatMarkAllRead) return;

    try {
      await window.ammoTracker.chatMarkAllRead(closerId);
      setUnreadCount(0);
      onUnreadCountChange?.(0);
    } catch (error) {
      console.error('[ChatPanel] Failed to mark as read:', error);
    }
  }, [closerId, onUnreadCountChange]);

  // Send message
  const handleSendMessage = useCallback(async (text: string) => {
    if (!closerId || !teamId || !closerName || !window.ammoTracker?.chatSendMessage) return;

    setIsSending(true);
    setSendError(null);

    try {
      await window.ammoTracker.chatSendMessage(teamId, closerId, closerName, text);
      // Refresh messages after sending
      await fetchMessages();
      scrollToBottom();
    } catch (error) {
      console.error('[ChatPanel] Failed to send message:', error);
      setSendError(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  }, [closerId, teamId, closerName, fetchMessages, scrollToBottom]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      if (!closerId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      await fetchMessages();
      // Note: Don't mark as read immediately - let user actually view messages first
      // The mark-as-read will be triggered after a delay (below)
      setIsLoading(false);

      // Scroll to bottom after initial load
      setTimeout(scrollToBottom, 100);
    };

    init();
  }, [closerId, fetchMessages, scrollToBottom]);

  // Mark messages as read after user has been viewing the chat for 2 seconds
  useEffect(() => {
    if (!closerId || isLoading) return;

    const timer = setTimeout(() => {
      markAsRead();
    }, 2000); // 2 second delay

    return () => clearTimeout(timer);
  }, [closerId, isLoading, markAsRead]);

  // Listen for new messages
  useEffect(() => {
    if (!window.ammoTracker?.onNewMessage) return;

    const unsubscribe = window.ammoTracker.onNewMessage((message) => {
      console.log('[ChatPanel] New message received:', message);
      setMessages(prev => {
        // Check if message already exists
        if (prev.some(m => m._id === message._id)) return prev;

        const newMessage = {
          ...message,
          isFromMe: message.senderType === 'closer'
        };
        return [...prev, newMessage];
      });

      // Note: Notification sound is played by the main process
      // Scroll to bottom
      setTimeout(scrollToBottom, 100);
    });

    return unsubscribe;
  }, [scrollToBottom]);

  // Listen for unread count changes
  useEffect(() => {
    if (!window.ammoTracker?.onUnreadCountChanged) return;

    const unsubscribe = window.ammoTracker.onUnreadCountChanged((count) => {
      setUnreadCount(count);
      onUnreadCountChange?.(count);
    });

    return unsubscribe;
  }, [onUnreadCountChange]);

  // Note: We only mark as read on initial load (in the init function above)
  // We don't auto-mark when unreadCount changes, to preserve the badge/notification state

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Not logged in state
  if (!closerId) {
    return <NotLoggedInState />;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-zinc-500 py-8">
        <div className="w-5 h-5 border-2 border-gray-200 dark:border-zinc-700 border-t-gray-500 dark:border-t-zinc-400 rounded-full animate-spin mb-2" />
        <p className="text-xs">Loading messages...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Messages list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin"
      >
        {messages.length === 0 ? (
          <NoMessagesState />
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message._id}
              message={message}
              isFromMe={message.senderType === 'closer'}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose area */}
      <ComposeArea
        onSend={handleSendMessage}
        isSending={isSending}
        error={sendError}
      />
    </div>
  );
}

export default ChatPanel;
