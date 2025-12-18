import React, { useState, useEffect } from 'react';
import { TrainingPlaylist, TrainingPlaylistWithItems } from './types/electron';
import { PlaylistList } from './components/Training/PlaylistList';
import { TrainingPlayer } from './components/Training/TrainingPlayer';

export function TrainingApp() {
  const [closerId, setCloserId] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<TrainingPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<TrainingPlaylistWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get closer ID on mount
  useEffect(() => {
    const fetchCloserId = async () => {
      try {
        const id = await window.training?.getCloserId();
        setCloserId(id);
      } catch (err) {
        console.error('Failed to get closer ID:', err);
        setError('Failed to load training data');
      }
    };

    fetchCloserId();

    // Listen for closer ID changes
    const cleanup = window.training?.onCloserIdChange((id) => {
      setCloserId(id);
    });

    return cleanup;
  }, []);

  // Fetch playlists when closer ID is available
  useEffect(() => {
    if (!closerId) {
      setIsLoading(false);
      return;
    }

    const fetchPlaylists = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await window.training?.getAssignedPlaylists(closerId);
        setPlaylists(data || []);
      } catch (err) {
        console.error('Failed to fetch playlists:', err);
        setError('Failed to load playlists');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlaylists();
  }, [closerId]);

  // Load playlist details when selected
  const handleSelectPlaylist = async (playlistId: string) => {
    if (!closerId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await window.training?.getPlaylistDetails(playlistId, closerId);
      if (data) {
        setSelectedPlaylist(data);
      } else {
        setError('Failed to load playlist');
      }
    } catch (err) {
      console.error('Failed to load playlist details:', err);
      setError('Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedPlaylist(null);
  };

  const handleClose = () => {
    window.training?.close();
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Title Bar (draggable area for macOS) */}
      <div
        className="h-8 flex items-center justify-center relative border-b border-gray-200"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-sm font-medium text-gray-700">Training</span>
        <button
          onClick={handleClose}
          className="absolute right-4 text-gray-400 hover:text-gray-600 transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={() => setError(null)}
              className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : !closerId ? (
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
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <h2 className="text-lg font-medium text-gray-700 mb-2">Not Logged In</h2>
            <p className="text-gray-500 text-sm">Please log in to access your training playlists.</p>
          </div>
        ) : selectedPlaylist ? (
          <TrainingPlayer playlist={selectedPlaylist} onBack={handleBack} />
        ) : (
          <PlaylistList playlists={playlists} onSelect={handleSelectPlaylist} />
        )}
      </div>
    </div>
  );
}
