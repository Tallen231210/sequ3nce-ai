import React, { useState } from 'react';
import type { CommunityChannel } from './types';

interface NewPostFormProps {
  channels: CommunityChannel[];
  selectedChannelId?: string;
  onSubmit: (channelId: string, body: string) => Promise<void>;
}

export function NewPostForm({ channels, selectedChannelId, onSubmit }: NewPostFormProps) {
  const [body, setBody] = useState('');
  const [channelId, setChannelId] = useState(selectedChannelId || channels[0]?._id || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed || !channelId || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(channelId, trimmed);
      setBody('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl p-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What's on your mind?"
        className="w-full border-0 bg-transparent text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-zinc-500 resize-none focus:outline-none"
        rows={2}
        maxLength={5000}
      />

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-zinc-700">
        {/* Channel selector (only show when not in a specific channel view) */}
        {!selectedChannelId && channels.length > 0 && (
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="text-xs border border-gray-200 dark:border-zinc-600 rounded-md px-2 py-1 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300"
          >
            {channels.map((ch) => (
              <option key={ch._id} value={ch._id}>
                #{ch.slug}
              </option>
            ))}
          </select>
        )}
        {selectedChannelId && <div />}

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 dark:text-zinc-500">
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
