import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CloserInfo, DMThread, DMMessage } from '../convex';
import {
  getDMThreads,
  getDMMessages,
  sendDM,
  markDMThreadRead,
  deleteDMMessage,
  setDMTyping,
  getDMTypingUsers,
} from '../convex';
import { formatRelativeTime, getInitials, getAvatarGradient } from './community/types';
import { TypingIndicator } from './community/TypingIndicator';

const MAX_DM_BODY = 2000;
const POLL_INTERVAL = 3000;

interface DirectMessagesViewProps {
  closerInfo: CloserInfo;
  initialRecipientId?: string | null;
  initialRecipientName?: string;
  initialRecipientPhotoUrl?: string | null;
  onRecipientConsumed?: () => void;
}

export function DirectMessagesView({
  closerInfo,
  initialRecipientId,
  initialRecipientName,
  initialRecipientPhotoUrl,
  onRecipientConsumed,
}: DirectMessagesViewProps) {
  const userId = closerInfo.b2cUserId || '';

  // Thread list state
  const [threads, setThreads] = useState<DMThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [threadSearch, setThreadSearch] = useState('');

  // Active conversation state
  const [activeThread, setActiveThread] = useState<DMThread | null>(null);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Pending new conversation (from Members/PostCard)
  const [pendingRecipient, setPendingRecipient] = useState<{
    userId: string;
    name: string;
    photoUrl: string | null;
  } | null>(null);

  // Input state
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  // Typing indicator state
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const lastTypingSentRef = useRef(0);

  const mountedRef = useRef(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadPollRef = useRef<ReturnType<typeof setInterval>>(undefined as any);
  const messagePollRef = useRef<ReturnType<typeof setInterval>>(undefined as any);
  const typingPollRef = useRef<ReturnType<typeof setInterval>>(undefined as any);
  const initialRecipientHandled = useRef(false);

  // Load threads
  const loadThreads = useCallback(async () => {
    if (!userId) return;
    const result = await getDMThreads(userId);
    if (mountedRef.current) {
      setThreads(result.threads);
      setLoadingThreads(false);
    }
  }, [userId]);

  // Load messages for active thread
  const loadMessages = useCallback(async (threadId: string) => {
    if (!userId) return;
    const result = await getDMMessages(userId, threadId);
    if (mountedRef.current) {
      setMessages(result.messages);
    }
  }, [userId]);

  // Initial load + polling
  useEffect(() => {
    mountedRef.current = true;
    loadThreads();
    threadPollRef.current = setInterval(loadThreads, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(threadPollRef.current);
    };
  }, [loadThreads]);

  // Message polling for active thread
  useEffect(() => {
    if (messagePollRef.current) clearInterval(messagePollRef.current);
    if (activeThread) {
      loadMessages(activeThread._id);
      messagePollRef.current = setInterval(() => {
        loadMessages(activeThread._id);
      }, POLL_INTERVAL);
    }
    return () => {
      if (messagePollRef.current) clearInterval(messagePollRef.current);
    };
  }, [activeThread?._id, loadMessages]);

  // Typing indicator polling for active thread
  useEffect(() => {
    if (typingPollRef.current) clearInterval(typingPollRef.current);
    setTypingNames([]);
    if (activeThread && userId) {
      const pollTyping = async () => {
        const result = await getDMTypingUsers(userId, activeThread._id);
        if (mountedRef.current) setTypingNames((result.users || []).map(u => u.userName));
      };
      pollTyping();
      typingPollRef.current = setInterval(pollTyping, 3000);
    }
    return () => {
      if (typingPollRef.current) clearInterval(typingPollRef.current);
    };
  }, [activeThread?._id, userId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle initial recipient from external navigation
  useEffect(() => {
    if (initialRecipientId && !initialRecipientHandled.current && !loadingThreads) {
      initialRecipientHandled.current = true;

      // Check if there's an existing thread with this user
      const existingThread = threads.find((t) => t.otherUserId === initialRecipientId);
      if (existingThread) {
        selectThread(existingThread);
      } else {
        // Enter pending new conversation mode
        setPendingRecipient({
          userId: initialRecipientId,
          name: initialRecipientName || 'Unknown',
          photoUrl: initialRecipientPhotoUrl ?? null,
        });
        setActiveThread(null);
        setMessages([]);
      }

      onRecipientConsumed?.();
    }
  }, [initialRecipientId, threads, loadingThreads]);

  // Reset handled flag when initialRecipientId changes
  useEffect(() => {
    if (!initialRecipientId) {
      initialRecipientHandled.current = false;
    }
  }, [initialRecipientId]);

  const selectThread = useCallback(async (thread: DMThread) => {
    setPendingRecipient(null);
    setActiveThread(thread);
    setDraft('');
    setLoadingMessages(true);

    const result = await getDMMessages(userId, thread._id);
    if (mountedRef.current) {
      setMessages(result.messages);
      setLoadingMessages(false);
    }

    // Mark as read
    if (thread.unreadCount > 0) {
      await markDMThreadRead(userId, thread._id);
      loadThreads();
    }
  }, [userId, loadThreads]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;

    const recipientId = pendingRecipient?.userId || activeThread?.otherUserId;
    if (!recipientId) return;

    setSending(true);
    const result = await sendDM(userId, recipientId, body);
    setSending(false);

    if (result.error) {
      console.error("Send DM error:", result.error);
      return;
    }

    setDraft('');

    // If was pending new conversation, clear it and refresh
    if (pendingRecipient) {
      setPendingRecipient(null);
    }

    // Reload threads and select the new/updated one
    const threadsResult = await getDMThreads(userId);
    if (mountedRef.current) {
      setThreads(threadsResult.threads);
      const updatedThread = threadsResult.threads.find(
        (t) => t.otherUserId === recipientId
      );
      if (updatedThread) {
        setActiveThread(updatedThread);
        const msgsResult = await getDMMessages(userId, updatedThread._id);
        if (mountedRef.current) setMessages(msgsResult.messages);
      }
    }
  }, [draft, sending, userId, pendingRecipient, activeThread]);

  const handleDelete = useCallback(async (messageId: string) => {
    await deleteDMMessage(userId, messageId);
    if (activeThread) loadMessages(activeThread._id);
  }, [userId, activeThread, loadMessages]);

  const handleTyping = useCallback(() => {
    const now = Date.now();
    const threadId = activeThread?._id;
    if (now - lastTypingSentRef.current > 3000 && threadId && userId) {
      lastTypingSentRef.current = now;
      setDMTyping(userId, threadId);
    }
  }, [activeThread?._id, userId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else {
      handleTyping();
    }
  };

  // Filter threads by search
  const filteredThreads = threadSearch.trim()
    ? threads.filter((t) =>
        t.otherUserName.toLowerCase().includes(threadSearch.toLowerCase())
      )
    : threads;

  // Determine conversation header info
  const conversationName = pendingRecipient?.name || activeThread?.otherUserName || '';
  const conversationPhoto = pendingRecipient?.photoUrl || activeThread?.otherUserPhotoUrl || null;
  const showConversation = !!(activeThread || pendingRecipient);

  return (
    <div className="flex h-full">
      {/* Left panel — Thread list */}
      <div className="w-[280px] border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Messages</h2>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {loadingThreads ? (
            <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
              Loading...
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
              {threadSearch ? 'No conversations found' : 'No messages yet'}
            </div>
          ) : (
            filteredThreads.map((thread) => (
              <ThreadItem
                key={thread._id}
                thread={thread}
                isActive={activeThread?._id === thread._id}
                onClick={() => selectThread(thread)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel — Conversation */}
      <div className="flex-1 flex flex-col min-w-0">
        {showConversation ? (
          <>
            {/* Conversation header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <Avatar name={conversationName} photoUrl={conversationPhoto} size="sm" />
              <div className="font-semibold text-sm text-gray-900 dark:text-white">
                {conversationName}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {loadingMessages ? (
                <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
                  Loading messages...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
                  Start the conversation by sending a message.
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble
                    key={msg._id}
                    message={msg}
                    isMine={msg.senderId === userId}
                    onDelete={handleDelete}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing indicator */}
            <TypingIndicator names={typingNames} />

            {/* Input bar */}
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, MAX_DM_BODY))}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  rows={1}
                  className="flex-1 resize-none border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
                  style={{ maxHeight: 120 }}
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black rounded-lg text-sm font-medium hover:opacity-80 disabled:opacity-40 transition-opacity"
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 text-right">
                {draft.length}/{MAX_DM_BODY}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Select a conversation or start a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Sub-components ====================

function ThreadItem({
  thread,
  isActive,
  onClick,
}: {
  thread: DMThread;
  isActive: boolean;
  onClick: () => void;
}) {
  const initials = getInitials(thread.otherUserName);
  const gradient = getAvatarGradient(thread.otherUserName);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors ${
        isActive
          ? 'bg-gray-100 dark:bg-gray-800'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      {/* Avatar */}
      {thread.otherUserPhotoUrl ? (
        <img
          src={thread.otherUserPhotoUrl}
          alt={thread.otherUserName}
          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div
          className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0`}
        >
          {initials}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${
            thread.unreadCount > 0
              ? 'font-bold text-gray-900 dark:text-white'
              : 'font-medium text-gray-700 dark:text-gray-300'
          }`}>
            {thread.otherUserName}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
            {formatRelativeTime(thread.lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">
            {thread.lastMessagePreview || 'No messages yet'}
          </span>
          {thread.unreadCount > 0 && (
            <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
          )}
        </div>
      </div>
    </button>
  );
}

function Avatar({
  name,
  photoUrl,
  size = 'md',
}: {
  name: string;
  photoUrl: string | null;
  size?: 'sm' | 'md';
}) {
  const initials = getInitials(name);
  const gradient = getAvatarGradient(name);
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';

  if (photoUrl) {
    return (
      <img src={photoUrl} alt={name} className={`${cls} rounded-full object-cover flex-shrink-0`} />
    );
  }

  return (
    <div className={`${cls} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

function MessageBubble({
  message,
  isMine,
  onDelete,
}: {
  message: DMMessage;
  isMine: boolean;
  onDelete: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div className="relative group max-w-[70%]">
        <div
          className={`px-3 py-2 rounded-2xl text-sm ${
            message.isDeleted
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 italic'
              : isMine
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
          }`}
        >
          {message.isDeleted ? (
            <span>Message deleted</span>
          ) : (
            <span className="whitespace-pre-wrap break-words">{message.body}</span>
          )}
        </div>

        {/* Timestamp */}
        <div className={`text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 ${isMine ? 'text-right' : 'text-left'}`}>
          {formatRelativeTime(message.createdAt)}
        </div>

        {/* Delete menu (own messages only, not already deleted) */}
        {isMine && !message.isDeleted && (
          <div className="absolute top-0 -left-6 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute left-0 top-6 z-20 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 min-w-[100px]">
                  <button
                    onClick={() => { onDelete(message._id); setShowMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
