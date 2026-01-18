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
const SAMPLE_RATE = 48000; // Match the audio processor's sample rate
const BUFFER_SIZE = 4096; // Size of audio buffer for playback

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
  const audioQueueRef = useRef<Float32Array[]>([]);
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
   * Convert Int16 PCM buffer to Float32 for Web Audio API
   */
  const int16ToFloat32 = useCallback((buffer: ArrayBuffer): Float32Array => {
    const int16Array = new Int16Array(buffer);
    const float32Array = new Float32Array(int16Array.length);

    for (let i = 0; i < int16Array.length; i++) {
      // Convert Int16 (-32768 to 32767) to Float32 (-1 to 1)
      float32Array[i] = int16Array[i] / 32768;
    }

    return float32Array;
  }, []);

  /**
   * Schedule audio buffer for playback
   */
  const scheduleAudioPlayback = useCallback((audioData: Float32Array) => {
    if (!audioContextRef.current || !gainNodeRef.current) return;

    const audioContext = audioContextRef.current;
    const currentTime = audioContext.currentTime;

    // Create audio buffer
    const audioBuffer = audioContext.createBuffer(1, audioData.length, SAMPLE_RATE);
    // Use getChannelData to get a reference and copy manually
    const channelData = audioBuffer.getChannelData(0);
    channelData.set(audioData);

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
        scheduleAudioPlayback(audioData);
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
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
      });

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

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          // Binary audio data
          const float32Data = int16ToFloat32(event.data);
          audioQueueRef.current.push(float32Data);
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
  }, [state, visitorCallId, managerId, volume, isMuted, int16ToFloat32, processAudioQueue]);

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
