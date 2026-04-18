import React, { useState } from 'react';
import type { CommunityChannel } from './types';

interface NewPostFormProps {
  channels: CommunityChannel[];
  selectedChannelId?: string;
  onSubmit: (channelId: string, body: string, visibility?: string) => Promise<void>;
}

export function NewPostForm({ channels, selectedChannelId, onSubmit }: NewPostFormProps) {
  const [body, setBody] = useState('');
  const [channelId, setChannelId] = useState(selectedChannelId || channels[0]?._id || '');
  const [visibility, setVisibility] = useState<'everyone' | 'friends'>('everyone');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed || !channelId || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(channelId, trimmed, visibility === 'friends' ? 'friends' : undefined);
      setBody('');
      setVisibility('everyone');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What's on your mind?"
        className="w-full border-0 bg-transparent text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none focus:outline-none"
        rows={2}
        maxLength={5000}
      />

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {/* Channel selector (only show when not in a specific channel view) */}
          {!selectedChannelId && channels.length > 0 && (
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="text-xs border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
            >
              {channels.filter((ch) => ch.slug !== 'money-bells').map((ch) => (
                <option key={ch._id} value={ch._id}>
                  #{ch.slug}
                </option>
              ))}
            </select>
          )}

          {/* Visibility toggle */}
          <button
            type="button"
            onClick={() => setVisibility(visibility === 'everyone' ? 'friends' : 'everyone')}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors ${
              visibility === 'friends'
                ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400'
            }`}
            title={visibility === 'everyone' ? 'Visible to everyone' : 'Visible to friends only'}
          >
            {visibility === 'everyone' ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            )}
            {visibility === 'everyone' ? 'Everyone' : 'Friends'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {body.length}/5000
          </span>
          <button
            onClick={handleSubmit}
            disabled={!body.trim() || !channelId || submitting}
            className="px-4 py-1.5 text-xs font-medium bg-black text-white dark:bg-white dark:text-black rounded-md hover:opacity-80 disabled:opacity-40 transition-opacity"
          >
            {submitting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
