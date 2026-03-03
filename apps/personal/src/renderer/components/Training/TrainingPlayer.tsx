import React, { useState, useRef, useEffect } from 'react';
import { TrainingPlaylistWithItems, TrainingPlaylistItem } from '../../types/electron';

// Parse transcript text into segments with timestamps
interface TranscriptSegment {
  timestamp: number;
  speaker: string;
  text: string;
}

function parseTranscriptSegments(transcriptText: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  // Match patterns like "[5:55] Prospect:" or "[6:00] Closer:"
  const regex = /\[(\d+):(\d+)\]\s*(Prospect|Closer):\s*(?:\[(?:Prospect|Closer)\]:\s*)?(.+?)(?=\[|\n\n|$)/g;

  let match;
  while ((match = regex.exec(transcriptText)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const timestamp = minutes * 60 + seconds;
    const speaker = match[3];
    const text = match[4].trim();

    if (text) {
      segments.push({ timestamp, speaker, text });
    }
  }

  return segments;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Category styling
const CATEGORY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  objection_handling: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Objection Handling' },
  pitch: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Pitch' },
  close: { bg: 'bg-green-100', text: 'text-green-700', label: 'Close' },
  pain_discovery: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Pain Discovery' },
};

function getCategoryStyle(category: string) {
  return CATEGORY_STYLES[category] || { bg: 'bg-gray-100', text: 'text-gray-700', label: category };
}

interface TrainingPlayerProps {
  playlist: TrainingPlaylistWithItems;
  onBack: () => void;
}

export function TrainingPlayer({ playlist, onBack }: TrainingPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const currentItem = playlist.items[currentIndex];
  const highlight = currentItem?.highlight;

  // Parse transcript segments
  const segments = highlight ? parseTranscriptSegments(highlight.transcriptText) : [];

  // Calculate timestamps relative to snippet
  const startTime = highlight?.startTimestamp || 0;
  const endTime = highlight?.endTimestamp || 0;
  const snippetDuration = endTime - startTime;

  // Reset player state when clip changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(startTime);
    setIsLoading(true);
    setHasError(false);
    setActiveSegmentIndex(0);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = startTime;
    }
  }, [currentIndex, startTime]);

  // Enable play button after timeout as fallback
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isLoading && !hasError) {
        setIsLoading(false);
      }
    }, 2000);
    return () => clearTimeout(timeout);
  }, [isLoading, hasError, currentIndex]);

  // Update active segment based on current time
  const updateActiveSegment = (time: number) => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (time >= segments[i].timestamp) {
        if (i !== activeSegmentIndex) {
          setActiveSegmentIndex(i);
          // Scroll to active segment
          const element = document.getElementById(`segment-${i}`);
          if (element && transcriptRef.current) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        return;
      }
    }
    setActiveSegmentIndex(0);
  };

  const handleCanPlay = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      updateActiveSegment(time);

      // Stop at end time and auto-advance
      if (time >= endTime) {
        audioRef.current.pause();
        setIsPlaying(false);

        // Auto-advance to next clip
        if (currentIndex < playlist.items.length - 1) {
          setTimeout(() => {
            setCurrentIndex(currentIndex + 1);
          }, 1000);
        }
      }
    }
  };

  const togglePlay = async () => {
    if (!audioRef.current || hasError) return;

    if (isLoading) {
      setIsLoading(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        // Reset to start if at end
        if (audioRef.current.currentTime >= endTime) {
          audioRef.current.currentTime = startTime;
          setCurrentTime(startTime);
          setActiveSegmentIndex(0);
        }
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.error('Play failed:', err);
        setHasError(true);
      }
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < playlist.items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleSelectClip = (index: number) => {
    setCurrentIndex(index);
  };

  const progress = Math.min(100, ((currentTime - startTime) / snippetDuration) * 100);
  const categoryStyle = highlight ? getCategoryStyle(highlight.category) : { bg: '', text: '', label: '' };

  if (!highlight) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <p className="text-gray-500">No clips in this playlist</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm">{playlist.name}</span>
        </button>
        <h2 className="text-lg font-semibold text-gray-900">{highlight.title}</h2>
        <div className="flex items-center gap-2 mt-1">
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${categoryStyle.bg} ${categoryStyle.text}`}>
            {categoryStyle.label}
          </span>
          <span className="text-xs text-gray-500">by {highlight.closerName}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Player and Transcript */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Audio Player */}
          {highlight.recordingUrl ? (
            <div className="p-4 border-b border-gray-200">
              <audio
                ref={audioRef}
                src={highlight.recordingUrl}
                preload="auto"
                onCanPlay={handleCanPlay}
                onLoadedData={handleCanPlay}
                onError={handleError}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
              />

              {/* Player Controls */}
              <div className="flex items-center gap-3">
                {/* Prev Button */}
                <button
                  onClick={handlePrevious}
                  disabled={currentIndex === 0}
                  className="p-2 text-gray-500 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </button>

                {/* Play/Pause Button */}
                <button
                  onClick={togglePlay}
                  disabled={isLoading || hasError}
                  className="w-12 h-12 flex items-center justify-center bg-gray-900 text-white rounded-full hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : isPlaying ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                {/* Next Button */}
                <button
                  onClick={handleNext}
                  disabled={currentIndex === playlist.items.length - 1}
                  className="p-2 text-gray-500 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Progress Bar */}
                <div className="flex-1">
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-900 transition-all duration-100"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{formatTimestamp(currentTime)}</span>
                    <span>{formatTimestamp(endTime)}</span>
                  </div>
                </div>
              </div>

              {hasError && (
                <p className="text-xs text-red-500 mt-2">Unable to load audio. Please try again.</p>
              )}
            </div>
          ) : (
            <div className="p-4 border-b border-gray-200">
              <p className="text-sm text-gray-500">No audio available for this clip</p>
            </div>
          )}

          {/* Transcript */}
          <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4">
            {segments.length > 0 ? (
              <div className="space-y-3">
                {segments.map((segment, index) => (
                  <div
                    key={index}
                    id={`segment-${index}`}
                    className={`p-2 rounded transition-all duration-200 ${
                      index === activeSegmentIndex && isPlaying
                        ? 'bg-yellow-100 border-l-2 border-yellow-500'
                        : ''
                    }`}
                  >
                    <span className="text-xs text-gray-400 mr-2">[{formatTimestamp(segment.timestamp)}]</span>
                    <span className={`font-medium ${segment.speaker === 'Closer' ? 'text-blue-600' : 'text-green-600'}`}>
                      {segment.speaker}:
                    </span>{' '}
                    <span className="text-gray-700">{segment.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 whitespace-pre-wrap">{highlight.transcriptText}</p>
            )}
          </div>

          {/* Coaching Notes */}
          {highlight.notes && (
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-500 mb-1">Coaching Notes</p>
              <p className="text-sm text-gray-700">{highlight.notes}</p>
            </div>
          )}
        </div>

        {/* Playlist Sidebar */}
        <div className="w-56 border-l border-gray-200 overflow-y-auto bg-gray-50">
          <div className="p-3 border-b border-gray-200">
            <p className="text-xs font-medium text-gray-500">
              Clip {currentIndex + 1} of {playlist.items.length}
            </p>
          </div>
          <div className="p-2">
            {playlist.items.map((item, index) => (
              <button
                key={item._id}
                onClick={() => handleSelectClip(index)}
                className={`w-full text-left p-2 rounded-lg mb-1 transition-colors ${
                  index === currentIndex
                    ? 'bg-gray-200'
                    : 'hover:bg-gray-100'
                }`}
              >
                <p className={`text-sm font-medium truncate ${index === currentIndex ? 'text-gray-900' : 'text-gray-700'}`}>
                  {item.highlight.title}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {getCategoryStyle(item.highlight.category).label}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
