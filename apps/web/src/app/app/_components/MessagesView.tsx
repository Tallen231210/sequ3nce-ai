"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CloserInfo, ChatMessage } from '@/lib/closer/client';
import { usePoll } from '@/lib/closer/usePoll';
import {
  getMessagesForCloser,
  sendMessageFromCloser,
  markAllMessagesRead,
} from '@/lib/closer/client';

interface MessagesViewProps {
  closerInfo: CloserInfo;
}

function formatMessageTime(createdAt: number): string {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  return (
    date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' +
    date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  );
}

export function MessagesView({ closerInfo }: MessagesViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const fetchMessages = useCallback(async () => {
    const data = await getMessagesForCloser(closerInfo.closerId, 100);
    if (mountedRef.current) setMessages(data);
  }, [closerInfo.closerId]);

  // Initial load on mount
  useEffect(() => {
    // Re-arm on every run. React's development double-mount fires the cleanup
    // below and then re-runs this effect on the SAME component instance, so a
    // ref left at false silently discards every response that follows and the
    // view sits on "Loading…" forever. Setting it here rather than only at
    // useRef(true) makes the mount and unmount symmetrical.
    mountedRef.current = true;
    setIsLoading(true);
    fetchMessages().then(() => {
      setIsLoading(false);
      setTimeout(scrollToBottom, 100);
    });
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchMessages]);

  // Poll for new messages — bumped from 3s to 15s. Unread badge doesn't
  // need 3s freshness; this was a top contributor to Convex saturation
  // (task #348). Pauses when window hidden.
  usePoll('messages', fetchMessages, 15_000, { immediate: false });

  // Mark as read after 2 seconds of viewing
  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      markAllMessagesRead(closerInfo.closerId);
    }, 2000);
    return () => clearTimeout(timer);
  }, [closerInfo.closerId, isLoading]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setSendError(null);

    const ok = await sendMessageFromCloser(
      closerInfo.teamId,
      closerInfo.closerId,
      closerInfo.name,
      trimmed
    );

    if (ok) {
      setText('');
      await fetchMessages();
      scrollToBottom();
    } else {
      setSendError('Failed to send message');
    }

    setIsSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <span className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-[14px] text-gray-500">Loading messages...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 shrink-0">
        <h1 className="text-2xl font-bold text-black">Messages</h1>
        <p className="text-[14px] text-gray-500 mt-1">Chat with your manager</p>
      </div>

      {/* Messages list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 py-2 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s8 3.582 9 8z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">No Messages Yet</h2>
            <p className="text-[14px] text-gray-500 max-w-sm">
              Messages from your manager will appear here. You can reply directly.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isFromMe = msg.senderType === 'closer';
            return (
              <div key={msg._id} className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] ${isFromMe ? 'items-end' : 'items-start'}`}>
                  {!isFromMe && (
                    <p className="text-[11px] text-gray-500 mb-0.5 px-1">{msg.senderName}</p>
                  )}
                  <div
                    className={`px-3.5 py-2.5 rounded-2xl ${
                      isFromMe
                        ? 'bg-black text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    }`}
                  >
                    <p className="text-[14px] leading-snug whitespace-pre-wrap break-words">
                      {msg.message}
                    </p>
                  </div>
                  <p className={`text-[10px] text-gray-400 mt-0.5 px-1 ${isFromMe ? 'text-right' : ''}`}>
                    {formatMessageTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose area */}
      <div className="px-6 py-3 border-t border-gray-200 shrink-0">
        {sendError && (
          <p className="text-[12px] text-red-600 mb-1">{sendError}</p>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a reply..."
            disabled={isSending}
            className="flex-1 px-4 py-2.5 text-[14px] bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 transition-colors disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || isSending}
            className="p-2.5 bg-black text-white rounded-xl hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isSending ? (
              <span className="w-4 h-4 border-2 border-gray-300 border-t-white rounded-full animate-spin block" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
