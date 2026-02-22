"use client";

import { useRef, useEffect } from "react";

interface PublicVideoPlayerProps {
  recordingUrl: string;
  startSeconds?: number;
  endSeconds?: number;
}

export function PublicVideoPlayer({
  recordingUrl,
  startSeconds,
  endSeconds,
}: PublicVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      // For clips, seek to start time
      if (startSeconds != null && startSeconds > 0) {
        video.currentTime = startSeconds;
      }
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => video.removeEventListener("loadedmetadata", handleLoadedMetadata);
  }, [startSeconds]);

  // For clips, pause when reaching end time
  useEffect(() => {
    const video = videoRef.current;
    if (!video || endSeconds == null) return;

    const handleTimeUpdate = () => {
      if (video.currentTime >= endSeconds) {
        video.pause();
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [endSeconds]);

  return (
    <div className="relative rounded-lg overflow-hidden bg-black">
      {/* Clip indicator badge */}
      {startSeconds != null && endSeconds != null && (
        <div className="absolute top-3 left-3 z-10 bg-black/70 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm">
          Clip: {formatTime(startSeconds)} &mdash; {formatTime(endSeconds)}
        </div>
      )}
      <video
        ref={videoRef}
        src={recordingUrl}
        controls
        playsInline
        className="w-full aspect-video"
        controlsList="nodownload"
      />
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
