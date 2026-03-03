"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
import { formatTime } from "./utils";

interface VideoReviewPlayerProps {
  recordingUrl: string;
  comments: Array<{ timestampSeconds?: number; _id: string }>;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onPlayPause: () => void;
  onPlayStateChange: (playing: boolean) => void;
  onSeek: (time: number) => void;
  onVideoError?: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export function VideoReviewPlayer({
  recordingUrl,
  comments,
  currentTime,
  duration,
  isPlaying,
  onTimeUpdate,
  onDurationChange,
  onPlayPause,
  onPlayStateChange,
  onSeek,
  onVideoError,
  videoRef,
}: VideoReviewPlayerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PLAYBACK_RATES = [1, 1.25, 1.5, 2];

  const handleCycleSpeed = useCallback(() => {
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
    const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length];
    setPlaybackRate(nextRate);
  }, [playbackRate]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, videoRef]);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || duration === 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, x / rect.width));
    onSeek(fraction * duration);
  };

  const handleToggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(!isMuted);
  }, [isMuted, videoRef]);

  const handleFullscreen = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  }, [videoRef]);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  const handleMouseLeave = useCallback(() => {
    if (isPlaying) {
      hideTimeoutRef.current = setTimeout(() => setShowControls(false), 1000);
    }
  }, [isPlaying]);

  const commentMarkers = comments.filter(
    (c) => c.timestampSeconds !== undefined && c.timestampSeconds !== null
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="relative group rounded-lg overflow-hidden bg-gray-950 aspect-video max-h-[480px] mx-auto"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Video — no native controls */}
      <video
        ref={videoRef}
        src={recordingUrl}
        playsInline
        preload="auto"
        className="w-full h-full cursor-pointer"
        onClick={onPlayPause}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => onDurationChange(e.currentTarget.duration)}
        onPlay={() => onPlayStateChange(true)}
        onPause={() => onPlayStateChange(false)}
        onError={() => onVideoError?.()}
      />

      {/* Play overlay when paused */}
      {!isPlaying && duration > 0 && (
        <button
          className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
          onClick={onPlayPause}
        >
          <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="h-7 w-7 text-white ml-1" fill="white" />
          </div>
        </button>
      )}

      {/* Bottom controls — scrubber + buttons */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-8 pb-2 px-3 transition-opacity duration-200 ${
          showControls || !isPlaying ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Scrubber bar with comment dots */}
        <div
          ref={trackRef}
          className="relative h-4 cursor-pointer flex items-center mb-2"
          onClick={handleTrackClick}
        >
          {/* Track background */}
          <div className="absolute inset-x-0 h-1 bg-white/30 rounded-full group-hover:h-1.5 transition-all">
            {/* Progress fill */}
            <div
              className="absolute inset-y-0 left-0 bg-white rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Comment dots */}
          {duration > 0 &&
            commentMarkers.map((comment) => {
              const position =
                ((comment.timestampSeconds ?? 0) / duration) * 100;
              return (
                <button
                  key={comment._id}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-blue-500 border-2 border-white shadow-md hover:scale-150 transition-transform z-10"
                  style={{ left: `${position}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(comment.timestampSeconds ?? 0);
                  }}
                  title={`Comment at ${formatTime(
                    comment.timestampSeconds ?? 0
                  )}`}
                />
              );
            })}
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button
            onClick={onPlayPause}
            className="text-white hover:text-white/80 transition-colors"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" fill="white" />
            ) : (
              <Play className="h-5 w-5 ml-0.5" fill="white" />
            )}
          </button>

          {/* Time */}
          <span className="text-xs text-white/80 font-mono select-none">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Playback Speed */}
          <button
            onClick={handleCycleSpeed}
            className="text-white hover:text-white/80 transition-colors text-xs font-medium min-w-[2.5rem]"
            title="Playback speed"
          >
            {playbackRate}x
          </button>

          {/* Volume */}
          <button
            onClick={handleToggleMute}
            className="text-white hover:text-white/80 transition-colors"
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>

          {/* Fullscreen */}
          <button
            onClick={handleFullscreen}
            className="text-white hover:text-white/80 transition-colors"
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
