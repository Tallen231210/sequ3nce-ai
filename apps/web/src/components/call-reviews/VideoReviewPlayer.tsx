"use client";

import { useRef } from "react";
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
  onTimeUpdate,
  onDurationChange,
  onPlayStateChange,
  onSeek,
  onVideoError,
  videoRef,
}: VideoReviewPlayerProps) {
  const markerBarRef = useRef<HTMLDivElement>(null);

  const handleMarkerBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!markerBarRef.current || duration === 0) return;
    const rect = markerBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, x / rect.width));
    onSeek(fraction * duration);
  };

  const commentMarkers = comments.filter(
    (c) => c.timestampSeconds !== undefined && c.timestampSeconds !== null
  );

  return (
    <div className="relative">
      {/* Native video player with built-in controls */}
      <video
        ref={videoRef}
        src={recordingUrl}
        controls
        playsInline
        preload="auto"
        className="w-full rounded-lg"
        style={{ maxHeight: "480px" }}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => onDurationChange(e.currentTarget.duration)}
        onPlay={() => onPlayStateChange(true)}
        onPause={() => onPlayStateChange(false)}
        onError={() => onVideoError?.()}
      />

      {/* Comment markers overlaid just above native controls */}
      {commentMarkers.length > 0 && duration > 0 && (
        <div
          ref={markerBarRef}
          className="absolute left-3 right-3 bottom-[46px] h-4 cursor-pointer z-10"
          onClick={handleMarkerBarClick}
        >
          {commentMarkers.map((comment) => {
            const position = ((comment.timestampSeconds ?? 0) / duration) * 100;
            return (
              <button
                key={comment._id}
                className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-blue-500 border-2 border-white shadow-md hover:scale-150 transition-transform z-10"
                style={{ left: `${position}%`, marginLeft: "-6px" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(comment.timestampSeconds ?? 0);
                }}
                title={`Comment at ${formatTime(comment.timestampSeconds ?? 0)}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
