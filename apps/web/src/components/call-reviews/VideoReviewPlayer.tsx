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
  const trackRef = useRef<HTMLDivElement>(null);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || duration === 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, x / rect.width));
    onSeek(fraction * duration);
  };

  const commentMarkers = comments.filter(
    (c) => c.timestampSeconds !== undefined && c.timestampSeconds !== null
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div>
      {/* Native video — timeline hidden via .review-video CSS in globals.css */}
      <video
        ref={videoRef}
        src={recordingUrl}
        controls
        playsInline
        preload="auto"
        className="review-video w-full rounded-t-lg"
        style={{ maxHeight: "480px" }}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => onDurationChange(e.currentTarget.duration)}
        onPlay={() => onPlayStateChange(true)}
        onPause={() => onPlayStateChange(false)}
        onError={() => onVideoError?.()}
      />

      {/* Custom scrubber with progress track + comment dots */}
      <div className="relative h-5 bg-zinc-900 rounded-b-lg px-3 flex items-center">
        <div
          ref={trackRef}
          className="relative w-full h-full cursor-pointer flex items-center"
          onClick={handleTrackClick}
        >
          {/* Track */}
          <div className="absolute inset-x-0 h-1 bg-zinc-700 rounded-full">
            <div
              className="absolute inset-y-0 left-0 bg-white/70 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Comment dots */}
          {commentMarkers.map((comment) => {
            const position = ((comment.timestampSeconds ?? 0) / duration) * 100;
            return (
              <button
                key={comment._id}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-blue-500 border-[1.5px] border-white shadow-sm hover:scale-150 transition-transform z-10"
                style={{ left: `${position}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(comment.timestampSeconds ?? 0);
                }}
                title={`Comment at ${formatTime(comment.timestampSeconds ?? 0)}`}
              />
            );
          })}
        </div>

        {/* Time display */}
        <div className="ml-3 text-[10px] text-zinc-400 font-mono whitespace-nowrap select-none">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
    </div>
  );
}
