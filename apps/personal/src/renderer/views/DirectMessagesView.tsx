import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CloserInfo, DMThread, DMMessage, TeamThread, TeamThreadMessage } from '../convex';
import { usePoll } from '../lib/usePoll';
import {
  getDMThreads,
  getDMMessages,
  sendDM,
  markDMThreadRead,
  deleteDMMessage,
  setDMTyping,
  getDMTypingUsers,
  listTeamThreads,
  getTeamThreadMessages,
  sendTeamMessageAsTeam,
  markTeamThreadRead,
  replyToTeamThread,
} from '../convex';
import { formatRelativeTime, getInitials, getAvatarGradient } from './community/types';
import { TypingIndicator } from './community/TypingIndicator';
import { NewDMModal } from './NewDMModal';
import iconImage from '../../assets/icon.png';

const MAX_DM_BODY = 2000;
// DM polling intervals. Active conversations (message body, typing) stay
// fairly tight; the thread LIST refresh (which surfaces new threads) was
// bumped from 3s to 15s — a new-thread notification doesn't need 3s
// freshness. See task #348.
const THREAD_LIST_POLL = 15_000;
const ACTIVE_THREAD_POLL = 5_000;
const TYPING_POLL = 3_000;

interface DirectMessagesViewProps {
  closerInfo: CloserInfo;
  initialRecipientId?: string | null;
  initialRecipientName?: string;
  initialRecipientPhotoUrl?: string | null;
  onRecipientConsumed?: () => void;
  onlineUserIds?: Set<string>;
}

export function DirectMessagesView({
  closerInfo,
  initialRecipientId,
  initialRecipientName,
  initialRecipientPhotoUrl,
  onRecipientConsumed,
  onlineUserIds = new Set(),
}: DirectMessagesViewProps) {
  const userId = closerInfo.b2cUserId || '';
  const isFounder = !!closerInfo.badges?.includes('founder') || !!closerInfo.badges?.includes('admin');

  // Thread list state
  const [threads, setThreads] = useState<DMThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [threadSearch, setThreadSearch] = useState('');

  // Founder-only: Sequ3nce Inbox (team threads across all recipients)
  const [teamInboxThreads, setTeamInboxThreads] = useState<TeamThread[]>([]);
  const [showTeamInbox, setShowTeamInbox] = useState(true);

  // Active conversation state. Team-inbox threads are tracked separately so the
  // existing DM thread state isn't complicated by founder-only semantics.
  const [activeThread, setActiveThread] = useState<DMThread | null>(null);
  const [activeTeamInboxThread, setActiveTeamInboxThread] = useState<TeamThread | null>(null);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [teamInboxMessages, setTeamInboxMessages] = useState<TeamThreadMessage[]>([]);
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
  const [sendError, setSendError] = useState<string | null>(null);

  // New DM modal
  const [showNewDM, setShowNewDM] = useState(false);

  // Typing indicator state
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const lastTypingSentRef = useRef(0);

  const mountedRef = useRef(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  // Founder-only: load team inbox threads
  const loadTeamInbox = useCallback(async () => {
    if (!userId || !isFounder) return;
    const result = await listTeamThreads(userId, 50);
    if (mountedRef.current && 'threads' in result) {
      setTeamInboxThreads(result.threads);
    }
  }, [userId, isFounder]);

  // Load messages for active thread
  const loadMessages = useCallback(async (threadId: string) => {
    if (!userId) return;
    const result = await getDMMessages(userId, threadId);
    if (mountedRef.current) {
      setMessages(result.messages);
    }
  }, [userId]);

  // Initial load on mount
  useEffect(() => {
    mountedRef.current = true;
    loadThreads();
    loadTeamInbox();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Thread list + team inbox refresh — 15s (bumped from 3s; new threads
  // can wait that long to surface).
  usePoll(
    'dmThreadList',
    async () => {
      await loadThreads();
      await loadTeamInbox();
    },
    THREAD_LIST_POLL,
    { immediate: false },
  );

  // Active-thread message refresh — 5s. Keeps an open conversation feeling
  // live without hammering Convex (was 3s).
  usePoll(
    'dmActiveMessages',
    async () => {
      if (!activeThread) return;
      await loadMessages(activeThread._id);
    },
    ACTIVE_THREAD_POLL,
    { enabled: !!activeThread, immediate: true },
  );

  // Founder-only: message polling for active team-inbox thread
  const loadTeamInboxMessages = useCallback(async (threadId: string) => {
    if (!userId) return;
    const result = await getTeamThreadMessages(userId, threadId);
    if (mountedRef.current && 'messages' in result) {
      setTeamInboxMessages(result.messages);
    }
  }, [userId]);

  usePoll(
    'teamInboxMessages',
    async () => {
      if (!activeTeamInboxThread) return;
      await loadTeamInboxMessages(activeTeamInboxThread._id);
    },
    ACTIVE_THREAD_POLL,
    { enabled: !!activeTeamInboxThread, immediate: true },
  );

  // Typing indicator — 3s. Reset names when active thread changes.
  useEffect(() => {
    setTypingNames([]);
  }, [activeThread?._id]);

  usePoll(
    'dmTyping',
    async () => {
      if (!activeThread || !userId) return;
      const result = await getDMTypingUsers(userId, activeThread._id);
      if (mountedRef.current) setTypingNames((result.users || []).map((u) => u.userName));
    },
    TYPING_POLL,
    { enabled: !!activeThread && !!userId, immediate: true },
  );

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle initial recipient from external navigation
  useEffect(() => {
    if (initialRecipientId && !initialRecipientHandled.current && !loadingThreads) {
      initialRecipientHandled.current = true;

      // Check if there's an existing thread with this user
      const existingThread = threads.find((t) => t.otherUserId !== null && t.otherUserId === initialRecipientId);
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
    setActiveTeamInboxThread(null);
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

  // Founder-only: select a team-inbox thread (loaded via founder queries, shared state)
  const selectTeamInboxThread = useCallback(async (thread: TeamThread) => {
    setPendingRecipient(null);
    setActiveThread(null);
    setActiveTeamInboxThread(thread);
    setDraft('');
    setLoadingMessages(true);
    const result = await getTeamThreadMessages(userId, thread._id);
    if (mountedRef.current) {
      if ('messages' in result) setTeamInboxMessages(result.messages);
      setLoadingMessages(false);
    }
    if (thread.unreadCount > 0) {
      await markTeamThreadRead(userId, thread._id);
      loadTeamInbox();
    }
  }, [userId, loadTeamInbox]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;

    // Founder replying in a team-inbox thread (as "Sequ3nce Team")
    if (activeTeamInboxThread) {
      setSending(true);
      const res = await sendTeamMessageAsTeam(userId, activeTeamInboxThread._id, body);
      setSending(false);
      if ('error' in res) {
        setSendError(res.error);
        setTimeout(() => setSendError(null), 4000);
        return;
      }
      setDraft('');
      loadTeamInboxMessages(activeTeamInboxThread._id);
      loadTeamInbox();
      return;
    }

    // User replying in a team thread (existing active thread with senderType === 'team')
    if (activeThread?.senderType === 'team') {
      if (activeThread.repliesAllowed === false) {
        setSendError('Replies are disabled for this notification');
        setTimeout(() => setSendError(null), 4000);
        return;
      }
      setSending(true);
      const res = await replyToTeamThread(userId, activeThread._id, body);
      setSending(false);
      if ('error' in res) {
        setSendError(res.error);
        setTimeout(() => setSendError(null), 4000);
        return;
      }
      setDraft('');
      loadMessages(activeThread._id);
      loadThreads();
      return;
    }

    // Regular user-to-user DM
    const recipientId = pendingRecipient?.userId || activeThread?.otherUserId;
    if (!recipientId) return;

    setSending(true);
    const result = await sendDM(userId, recipientId, body);
    setSending(false);

    if (result.error) {
      console.error("Send DM error:", result.error);
      setSendError(result.error);
      setTimeout(() => setSendError(null), 4000);
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
        (t) => t.otherUserId !== null && t.otherUserId === recipientId
      );
      if (updatedThread) {
        setActiveThread(updatedThread);
        const msgsResult = await getDMMessages(userId, updatedThread._id);
        if (mountedRef.current) setMessages(msgsResult.messages);
      }
    }
  }, [draft, sending, userId, pendingRecipient, activeThread, activeTeamInboxThread, loadMessages, loadThreads, loadTeamInbox, loadTeamInboxMessages]);

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

  // Determine conversation header info. Branches for:
  //   - Team-inbox thread (founder viewing a recipient's conversation) — shows recipient's name/photo
  //   - Regular DM (including team threads where user is recipient — shows "Sequ3nce Team")
  let conversationName: string;
  let conversationPhoto: string | null;
  let conversationUserId: string;
  let conversationBrand: 'user' | 'team' = 'user';

  if (activeTeamInboxThread) {
    conversationName = activeTeamInboxThread.recipientName;
    conversationPhoto = activeTeamInboxThread.recipientPhotoUrl;
    conversationUserId = activeTeamInboxThread.recipientUserId;
  } else if (pendingRecipient) {
    conversationName = pendingRecipient.name;
    conversationPhoto = pendingRecipient.photoUrl;
    conversationUserId = pendingRecipient.userId;
  } else if (activeThread) {
    if (activeThread.senderType === 'team') {
      conversationName = 'Sequ3nce Team';
      conversationPhoto = iconImage;
      conversationUserId = '';
      conversationBrand = 'team';
    } else {
      conversationName = activeThread.otherUserName;
      conversationPhoto = activeThread.otherUserPhotoUrl;
      conversationUserId = activeThread.otherUserId ?? '';
    }
  } else {
    conversationName = '';
    conversationPhoto = null;
    conversationUserId = '';
  }

  const isConversationUserOnline = conversationUserId ? onlineUserIds.has(conversationUserId) : false;
  const showConversation = !!(activeThread || activeTeamInboxThread || pendingRecipient);

  // Reply input gating: hide for team threads that disallow replies (from user's side).
  // Founders always see the input in team-inbox view.
  const replyInputVisible = (() => {
    if (activeTeamInboxThread) return true;
    if (activeThread?.senderType === 'team' && activeThread.repliesAllowed === false) return false;
    return true;
  })();

  const handleNewDMSelect = useCallback((memberId: string, memberName: string, memberPhotoUrl: string | null) => {
    setShowNewDM(false);
    // Check if there's an existing thread with this user
    const existingThread = threads.find((t) => t.otherUserId !== null && t.otherUserId === memberId);
    if (existingThread) {
      selectThread(existingThread);
    } else {
      setPendingRecipient({ userId: memberId, name: memberName, photoUrl: memberPhotoUrl });
      setActiveThread(null);
      setMessages([]);
    }
  }, [threads, selectThread]);

  return (
    <div className="flex h-full">
      {/* New DM Modal */}
      {showNewDM && (
        <NewDMModal
          userId={userId}
          existingThreads={threads}
          onlineUserIds={onlineUserIds}
          onSelect={handleNewDMSelect}
          onClose={() => setShowNewDM(false)}
        />
      )}

      {/* Left panel — Thread list */}
      <div className="w-[280px] border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Messages</h2>
          <button
            onClick={() => setShowNewDM(true)}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="New message"
          >
            <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
          </button>
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
          {/* Founder-only: Sequ3nce Inbox section (shared across all founders) */}
          {isFounder && (
            <div className="border-b border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setShowTeamInbox(!showTeamInbox)}
                className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <img src={iconImage} alt="" className="w-4 h-4 rounded-sm [filter:invert(1)_contrast(1.5)_brightness(1.1)] dark:[filter:none]" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-600 dark:text-gray-300">
                    Sequ3nce Inbox
                  </span>
                  {teamInboxThreads.length > 0 && (
                    <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">
                      {teamInboxThreads.length}
                    </span>
                  )}
                </span>
                <svg className={`w-3 h-3 text-gray-400 transition-transform ${showTeamInbox ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>
              {showTeamInbox && (
                <div>
                  {teamInboxThreads.length === 0 ? (
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 px-3 py-3">
                      No replies yet.
                    </div>
                  ) : (
                    teamInboxThreads.map((t) => (
                      <TeamInboxItem
                        key={t._id}
                        thread={t}
                        isActive={activeTeamInboxThread?._id === t._id}
                        onClick={() => selectTeamInboxThread(t)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          )}
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
                isOnline={thread.otherUserId !== null && onlineUserIds.has(thread.otherUserId)}
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
              <div className="relative shrink-0">
                {conversationBrand === 'team' ? (
                  <img
                    src={iconImage}
                    alt="Sequ3nce Team"
                    className="w-8 h-8 rounded-full [filter:invert(1)_contrast(1.5)_brightness(1.1)] dark:[filter:none]"
                  />
                ) : (
                  <>
                    <Avatar name={conversationName} photoUrl={conversationPhoto} size="sm" />
                    {isConversationUserOnline && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full" />
                    )}
                  </>
                )}
              </div>
              <div>
                <div className="font-semibold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  {conversationName}
                  {activeTeamInboxThread && (
                    <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      Replying as Sequ3nce Team
                    </span>
                  )}
                </div>
                {isConversationUserOnline && conversationBrand !== 'team' && (
                  <div className="text-[10px] text-green-500 font-medium">Online</div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {loadingMessages ? (
                <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
                  Loading messages...
                </div>
              ) : activeTeamInboxThread ? (
                teamInboxMessages.length === 0 ? (
                  <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
                    No messages yet.
                  </div>
                ) : (
                  teamInboxMessages.map((msg) => (
                    <MessageBubble
                      key={msg._id}
                      message={{
                        _id: msg._id,
                        threadId: msg.threadId,
                        senderId: msg.senderId,
                        body: msg.body,
                        isRead: msg.isRead,
                        isDeleted: msg.isDeleted,
                        createdAt: msg.createdAt,
                        teamSentBy: msg.teamSentBy,
                      }}
                      // Founder sees team-sent messages as "mine" (styled as sent); user replies are shown as received.
                      isMine={!!msg.teamSentBy}
                      onDelete={handleDelete}
                    />
                  ))
                )
              ) : messages.length === 0 ? (
                <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
                  Start the conversation by sending a message.
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble
                    key={msg._id}
                    message={msg}
                    isMine={msg.senderId === userId && !msg.teamSentBy}
                    onDelete={handleDelete}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing indicator */}
            <TypingIndicator names={typingNames} />

            {/* Input bar — hidden on one-way announcement threads */}
            {replyInputVisible ? (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, MAX_DM_BODY))}
                    onKeyDown={handleKeyDown}
                    placeholder={activeTeamInboxThread ? 'Reply as Sequ3nce Team…' : 'Type a message...'}
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
                <div className="flex items-center justify-between mt-1">
                  {sendError ? (
                    <div className="text-[11px] text-red-500 font-medium">{sendError}</div>
                  ) : (
                    <div />
                  )}
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">
                    {draft.length}/{MAX_DM_BODY}
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-center">
                <span className="text-[11px] font-mono uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  — announcement —
                </span>
              </div>
            )}
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
  isOnline,
  onClick,
}: {
  thread: DMThread;
  isActive: boolean;
  isOnline?: boolean;
  onClick: () => void;
}) {
  const isTeam = thread.senderType === 'team';
  const displayName = isTeam ? 'Sequ3nce Team' : thread.otherUserName;
  const initials = getInitials(displayName);
  const gradient = getAvatarGradient(displayName);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors ${
        isActive
          ? 'bg-gray-100 dark:bg-gray-800'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      {/* Avatar with online indicator (or Sequ3nce logo for team threads) */}
      <div className="relative flex-shrink-0">
        {isTeam ? (
          <img
            src={iconImage}
            alt="Sequ3nce Team"
            className="w-10 h-10 rounded-full [filter:invert(1)_contrast(1.5)_brightness(1.1)] dark:[filter:none]"
          />
        ) : thread.otherUserPhotoUrl ? (
          <img
            src={thread.otherUserPhotoUrl}
            alt={displayName}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div
            className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-sm`}
          >
            {initials}
          </div>
        )}
        {isOnline && !isTeam && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${
            thread.unreadCount > 0
              ? 'font-bold text-gray-900 dark:text-white'
              : 'font-medium text-gray-700 dark:text-gray-300'
          }`}>
            {displayName}
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
  const isTeamMessage = !!message.teamSentBy;

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div className="relative group max-w-[70%]">
        {/* Sender label for team-sent messages (replaces the implicit user avatar context) */}
        {isTeamMessage && !isMine && (
          <div className="flex items-center gap-1.5 mb-0.5">
            <img src={iconImage} alt="" className="w-3.5 h-3.5 rounded-sm [filter:invert(1)_contrast(1.5)_brightness(1.1)] dark:[filter:none]" />
            <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Sequ3nce Team</span>
          </div>
        )}
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

// Founder-only: row inside the Sequ3nce Inbox — shows the recipient's name/photo
// (because that's the person a founder is replying to), not the "Sequ3nce Team" label.
function TeamInboxItem({
  thread,
  isActive,
  onClick,
}: {
  thread: TeamThread;
  isActive: boolean;
  onClick: () => void;
}) {
  const initials = getInitials(thread.recipientName);
  const gradient = getAvatarGradient(thread.recipientName);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
        isActive
          ? 'bg-gray-100 dark:bg-gray-800'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      <div className="relative shrink-0">
        {thread.recipientPhotoUrl ? (
          <img src={thread.recipientPhotoUrl} alt={thread.recipientName} className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-[10px]`}>
            {initials}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs truncate ${
            thread.unreadCount > 0
              ? 'font-bold text-gray-900 dark:text-white'
              : 'font-medium text-gray-700 dark:text-gray-300'
          }`}>
            {thread.recipientName}
          </span>
          <span className="text-[9px] text-gray-400 dark:text-gray-500 shrink-0">
            {formatRelativeTime(thread.lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate flex-1">
            {thread.lastMessagePreview || 'No messages yet'}
          </span>
          {thread.unreadCount > 0 && (
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0" />
          )}
        </div>
      </div>
    </button>
  );
}
