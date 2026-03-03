import React from 'react';
import { TrainingPlaylist } from '../../types/electron';

// Format duration from seconds to human-readable
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (secs === 0) {
    return `${mins}m`;
  }
  return `${mins}m ${secs}s`;
}

// Format date to readable string
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

interface PlaylistListProps {
  playlists: TrainingPlaylist[];
  onSelect: (playlistId: string) => void;
}

export function PlaylistList({ playlists, onSelect }: PlaylistListProps) {
  if (playlists.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <svg
          className="w-16 h-16 text-gray-300 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
          />
        </svg>
        <h2 className="text-lg font-medium text-gray-700 mb-2">No Training Playlists</h2>
        <p className="text-gray-500 text-sm max-w-xs">
          Your manager hasn't assigned any training playlists to you yet. Check back later!
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-y-auto h-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Training Playlists</h2>
      <div className="space-y-3">
        {playlists.map((playlist) => (
          <button
            key={playlist._id}
            onClick={() => onSelect(playlist._id)}
            className="w-full text-left p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all"
          >
            <h3 className="font-medium text-gray-900 mb-1">{playlist.name}</h3>
            {playlist.description && (
              <p className="text-sm text-gray-500 mb-2 line-clamp-2">{playlist.description}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
                {playlist.itemCount} clip{playlist.itemCount !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {formatDuration(playlist.totalDuration)}
              </span>
              <span className="flex items-center gap-1">
                Assigned {formatDate(playlist.assignedAt)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
