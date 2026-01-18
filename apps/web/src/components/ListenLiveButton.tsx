"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Headphones, Loader2, Volume2, VolumeX, Square } from "lucide-react";
import { cn } from "@/lib/utils";

// Connection states
type ConnectionState = "idle" | "connecting" | "listening" | "error" | "ended";

interface ListenLiveButtonProps {
  visitorCallId: string;
  managerId?: string;
  callStatus?: string;
  className?: string;
}

// Audio playback configuration
// Must match Swift AudioFormat: 48kHz, 16-bit Int16, stereo interleaved (L=Mic, R=System)
const SAMPLE_RATE = 48000;
const CHANNELS = 2; // Stereo: Left=Mic, Right=System

export function ListenLiveButton({
  visitorCallId,
  managerId,
  callStatus,
  className,
}: ListenLiveButtonProps) {
  const [state, setState] = useState<ConnectionState>("idle");
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for WebSocket and Audio
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioQueueRef = useRef<{ left: Float32Array; right: Float32Array }[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  // Update volume when changed
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  /**
   * Convert Int16 stereo interleaved PCM buffer to separate Float32 channels
   * Input format: [L0, R0, L1, R1, ...] as Int16
   * Returns: { left: Float32Array, right: Float32Array }
   */
  const int16StereoToFloat32 = useCallback((buffer: ArrayBuffer): { left: Float32Array; right: Float32Array } => {
    const int16Array = new Int16Array(buffer);
    const frameCount = int16Array.length / CHANNELS;

    const leftChannel = new Float32Array(frameCount);
    const rightChannel = new Float32Array(frameCount);

    for (let i = 0; i < frameCount; i++) {
      // Interleaved: [L, R, L, R, ...]
      // Left channel (Mic) is at even indices, Right channel (System) is at odd indices
      leftChannel[i] = int16Array[i * 2] / 32768;
      rightChannel[i] = int16Array[i * 2 + 1] / 32768;
    }

    return { left: leftChannel, right: rightChannel };
  }, []);

  /**
   * Schedule stereo audio buffer for playback
   */
  const scheduleAudioPlayback = useCallback((left: Float32Array, right: Float32Array) => {
    if (!audioContextRef.current || !gainNodeRef.current) return;

    const audioContext = audioContextRef.current;
    const currentTime = audioContext.currentTime;

    // Create stereo audio buffer
    const audioBuffer = audioContext.createBuffer(CHANNELS, left.length, SAMPLE_RATE);

    // Copy channel data
    const leftChannelData = audioBuffer.getChannelData(0);
    const rightChannelData = audioBuffer.getChannelData(1);
    leftChannelData.set(left);
    rightChannelData.set(right);

    // Create buffer source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNodeRef.current);

    // Schedule playback
    const startTime = Math.max(currentTime, nextPlayTimeRef.current);
    source.start(startTime);

    // Update next play time
    nextPlayTimeRef.current = startTime + audioBuffer.duration;
  }, []);

  /**
   * Process queued audio data
   */
  const processAudioQueue = useCallback(() => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;

    while (audioQueueRef.current.length > 0) {
      const audioData = audioQueueRef.current.shift();
      if (audioData) {
        scheduleAudioPlayback(audioData.left, audioData.right);
      }
    }

    isPlayingRef.current = false;
  }, [scheduleAudioPlayback]);

  /**
   * Connect to the audio stream
   */
  const connect = useCallback(async () => {
    if (state === "connecting" || state === "listening") return;

    setState("connecting");
    setError(null);

    try {
      // Initialize Audio Context
      // Note: Browser may not honor the requested sample rate and use system default instead
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
      });

      // Log actual sample rate for debugging
      const actualSampleRate = audioContextRef.current.sampleRate;
      console.log(`[ListenLive] AudioContext created - requested: ${SAMPLE_RATE}Hz, actual: ${actualSampleRate}Hz`);

      // Create gain node for volume control
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = isMuted ? 0 : volume;
      gainNodeRef.current.connect(audioContextRef.current.destination);

      // Reset playback timing
      nextPlayTimeRef.current = 0;
      audioQueueRef.current = [];

      // Build WebSocket URL
      const audioProcessorUrl = process.env.NEXT_PUBLIC_AUDIO_PROCESSOR_URL;
      if (!audioProcessorUrl) {
        throw new Error("Audio processor URL not configured");
      }

      // Convert http(s) to ws(s) if needed
      const wsUrl = audioProcessorUrl
        .replace(/^http:/, "ws:")
        .replace(/^https:/, "wss:");

      const params = new URLSearchParams({
        listen: visitorCallId,
        ...(managerId && { managerId }),
      });

      const fullUrl = `${wsUrl}?${params.toString()}`;

      // Connect WebSocket
      const ws = new WebSocket(fullUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[ListenLive] WebSocket connected");
        // Resume audio context if suspended (browser autoplay policy)
        if (audioContextRef.current?.state === "suspended") {
          audioContextRef.current.resume();
        }
      };

      // Debug counter for logging
      let audioChunkCount = 0;

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          // Binary audio data - stereo interleaved Int16
          const stereoData = int16StereoToFloat32(event.data);
          audioQueueRef.current.push(stereoData);

          // Log first few chunks for debugging
          audioChunkCount++;
          if (audioChunkCount <= 5) {
            const bytesReceived = event.data.byteLength;
            const framesDecoded = stereoData.left.length;
            const durationMs = (framesDecoded / SAMPLE_RATE) * 1000;
            console.log(`[ListenLive] Chunk #${audioChunkCount}: ${bytesReceived} bytes → ${framesDecoded} frames (${durationMs.toFixed(1)}ms at ${SAMPLE_RATE}Hz)`);
          }

          processAudioQueue();
        } else {
          // JSON message
          try {
            const message = JSON.parse(event.data);
            console.log("[ListenLive] Message:", message);

            if (message.status === "connected") {
              setState("listening");
            } else if (message.type === "stream-ended") {
              console.log("[ListenLive] Stream ended");
              setState("ended");
              disconnect();
            } else if (message.error) {
              console.error("[ListenLive] Error:", message.error);
              setError(message.error);
              setState("error");
              disconnect();
            }
          } catch {
            // Ignore parse errors for non-JSON messages
          }
        }
      };

      ws.onerror = (event) => {
        console.error("[ListenLive] WebSocket error:", event);
        setError("Connection error");
        setState("error");
      };

      ws.onclose = (event) => {
        console.log("[ListenLive] WebSocket closed:", event.code, event.reason);
        // Check if this was an unexpected close (not user-initiated)
        if (event.code !== 1000) {
          setError("Connection lost");
          setState("error");
        }
      };
    } catch (err) {
      console.error("[ListenLive] Connection error:", err);
      setError(err instanceof Error ? err.message : "Failed to connect");
      setState("error");
    }
  }, [state, visitorCallId, managerId, volume, isMuted, int16StereoToFloat32, processAudioQueue]);

  /**
   * Disconnect from the audio stream
   */
  const disconnect = useCallback(() => {
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnected");
      wsRef.current = null;
    }

    // Close Audio Context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    gainNodeRef.current = null;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;

    // Only reset to idle if not already in ended/error state
    setState((current) => {
      if (current === "listening" || current === "connecting") {
        return "idle";
      }
      return current;
    });
  }, []);

  /**
   * Toggle connection
   */
  const handleClick = useCallback(() => {
    if (state === "listening" || state === "connecting") {
      disconnect();
      setState("idle");
    } else {
      connect();
    }
  }, [state, connect, disconnect]);

  /**
   * Toggle mute
   */
  const handleMuteToggle = useCallback(() => {
    setIsMuted((m) => !m);
  }, []);

  // Don't show if call is not active
  if (callStatus !== "on_call") {
    return null;
  }

  // Render based on state
  const isActive = state === "listening" || state === "connecting";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant={isActive ? "default" : "outline"}
        size="sm"
        onClick={handleClick}
        disabled={state === "ended"}
        className={cn(
          "gap-2 transition-all",
          state === "listening" && "bg-green-600 hover:bg-green-700",
          state === "error" && "border-red-500 text-red-500"
        )}
      >
        {state === "connecting" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Connecting...
          </>
        ) : state === "listening" ? (
          <>
            <Square className="h-3 w-3" />
            Stop Listening
          </>
        ) : state === "ended" ? (
          <>
            <Headphones className="h-4 w-4" />
            Stream Ended
          </>
        ) : state === "error" ? (
          <>
            <Headphones className="h-4 w-4" />
            Retry
          </>
        ) : (
          <>
            <Headphones className="h-4 w-4" />
            Listen Live
          </>
        )}
      </Button>

      {/* Volume/Mute toggle when listening */}
      {state === "listening" && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMuteToggle}
          className="h-8 w-8"
        >
          {isMuted ? (
            <VolumeX className="h-4 w-4 text-red-500" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>
      )}

      {/* Error message */}
      {error && state === "error" && (
        <span className="text-xs text-red-500">{error}</span>
      )}
    </div>
  );
}
