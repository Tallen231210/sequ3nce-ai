"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Loader2, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

// Connection states
type ConnectionState = "idle" | "connecting" | "listening" | "reconnecting" | "error" | "ended";

// Audio Waveform Visualization Component - Mirrored/centered style
function AudioWaveform({ analyserRef }: { analyserRef: React.RefObject<AnalyserNode | null> }) {
  const [bars, setBars] = useState<number[]>(Array(10).fill(0.1));
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const barCount = 10; // We'll mirror these to make 20 total

    const updateBars = () => {
      animationRef.current = requestAnimationFrame(updateBars);

      analyser.getByteFrequencyData(dataArray);

      // Focus on the voice frequency range (skip very low bass frequencies)
      // Use frequencies roughly in the 100Hz-4000Hz range where voice is
      const startBin = Math.floor(bufferLength * 0.05); // Skip lowest 5%
      const endBin = Math.floor(bufferLength * 0.5); // Use up to 50%
      const usableRange = endBin - startBin;
      const segmentSize = Math.floor(usableRange / barCount);

      const newBars: number[] = [];

      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        const start = startBin + i * segmentSize;
        for (let j = start; j < start + segmentSize; j++) {
          sum += dataArray[j];
        }
        const average = sum / segmentSize;

        // Amplify and curve for dramatic movement
        const amplified = Math.min(1, (average / 255) * 3);
        const curved = Math.pow(amplified, 0.7);
        newBars.push(Math.max(0.1, curved));
      }

      setBars(newBars);
    };

    updateBars();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyserRef]);

  // Mirror the bars: [1,2,3,4,5] becomes [5,4,3,2,1,1,2,3,4,5]
  const mirroredBars = [...bars].reverse().concat(bars);

  return (
    <div className="flex items-end justify-center gap-1 h-12 bg-zinc-100 rounded-lg px-3">
      {mirroredBars.map((v, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full"
          style={{
            height: `${Math.max(10, v * 100)}%`,
            background: "linear-gradient(to top, #10b981, #34d399)",
            transition: "height 50ms ease-out",
          }}
        />
      ))}
    </div>
  );
}

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
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioQueueRef = useRef<{ left: Float32Array; right: Float32Array }[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  // Reconnection state
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const isUserDisconnectRef = useRef(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect(true); // User-initiated (component unmounting)
    };
  }, [disconnect]);

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

  // Counter for playback logging
  const playbackCountRef = useRef(0);

  /**
   * Schedule mono audio buffer for playback (mic channel only)
   * Using mono to avoid any stereo interleaving issues
   */
  const scheduleAudioPlayback = useCallback((left: Float32Array, right: Float32Array) => {
    if (!audioContextRef.current || !gainNodeRef.current) return;

    const audioContext = audioContextRef.current;
    const currentTime = audioContext.currentTime;

    // Create MONO audio buffer with just the mic (left) channel
    // This avoids any potential stereo interleaving issues
    const audioBuffer = audioContext.createBuffer(1, left.length, SAMPLE_RATE);

    // Copy just the left (mic) channel
    const channelData = audioBuffer.getChannelData(0);
    channelData.set(left);

    // Create buffer source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNodeRef.current);

    // Schedule playback
    const startTime = Math.max(currentTime, nextPlayTimeRef.current);
    source.start(startTime);

    // Update next play time
    nextPlayTimeRef.current = startTime + audioBuffer.duration;

    // Track playback count (for potential future debugging)
    playbackCountRef.current++;
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
   * Attempt to reconnect with exponential backoff
   */
  const attemptReconnect = useCallback(() => {
    reconnectAttemptRef.current += 1;
    setReconnectAttempt(reconnectAttemptRef.current);

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.min(Math.pow(2, reconnectAttemptRef.current - 1) * 1000, 16000);

    console.log(`[ListenLive] Reconnect attempt ${reconnectAttemptRef.current}/${maxReconnectAttempts} in ${delay}ms`);
    setState("reconnecting");
    setError(null);

    // Clear any existing timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      // Reset the state to allow connect to work
      setState("idle");
      // Then immediately connect
      connect();
    }, delay);
  }, []);

  /**
   * Connect to the audio stream
   */
  const connect = useCallback(async () => {
    if (state === "connecting" || state === "listening" || state === "reconnecting") return;

    // Reset reconnection state on successful manual connect
    if (reconnectAttemptRef.current > 0) {
      console.log(`[ListenLive] Reconnected successfully after ${reconnectAttemptRef.current} attempts`);
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
    }

    setState("connecting");
    setError(null);

    try {
      // Initialize Audio Context
      // Don't force sample rate - let browser use system default, Web Audio will resample
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

      // Log sample rate (useful for debugging if issues arise)
      console.log(`[ListenLive] AudioContext: ${audioContextRef.current.sampleRate}Hz`);

      // Create analyser node for waveform visualization
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;

      // Create gain node for volume control
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = isMuted ? 0 : volume;

      // Connect: gain -> analyser -> destination
      gainNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);

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

          // Log periodically for debugging
          audioChunkCount++;
          if (audioChunkCount === 1) {
            console.log(`[ListenLive] Receiving audio chunks (${event.data.byteLength} bytes each)`);
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
        if (event.code !== 1000 && !isUserDisconnectRef.current) {
          // Attempt to reconnect
          if (reconnectAttemptRef.current < maxReconnectAttempts) {
            attemptReconnect();
          } else {
            setError("Connection lost - max reconnect attempts reached");
            setState("error");
            reconnectAttemptRef.current = 0;
            setReconnectAttempt(0);
          }
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
  const disconnect = useCallback((isUserInitiated = false) => {
    // Mark as user-initiated to prevent auto-reconnect
    if (isUserInitiated) {
      isUserDisconnectRef.current = true;
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

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
    analyserRef.current = null;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;

    // Reset reconnection state
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);

    // Only reset to idle if not already in ended/error state
    setState((current) => {
      if (current === "listening" || current === "connecting" || current === "reconnecting") {
        return "idle";
      }
      return current;
    });
  }, []);

  /**
   * Toggle connection
   */
  const handleClick = useCallback(() => {
    if (state === "listening" || state === "connecting" || state === "reconnecting") {
      disconnect(true); // User-initiated disconnect
      setState("idle");
    } else {
      isUserDisconnectRef.current = false; // Reset flag for new connection
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

  // Idle state - just show the Listen button
  if (state === "idle") {
    return (
      <button
        onClick={handleClick}
        className={cn(
          "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
          "bg-emerald-500 hover:bg-emerald-600 text-white",
          className
        )}
      >
        Listen Live
      </button>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <button
          onClick={handleClick}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-red-100 hover:bg-red-200 text-red-700 transition-all"
        >
          Retry
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  // Ended state
  if (state === "ended") {
    return (
      <div className={cn("px-4 py-2 rounded-lg text-sm font-medium bg-zinc-100 text-zinc-500", className)}>
        Stream Ended
      </div>
    );
  }

  // Connecting, Reconnecting, or Listening state - show the floating card
  return (
    <div className={cn("bg-white rounded-2xl shadow-lg border border-zinc-200 p-4 w-72", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {state === "listening" && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          )}
          {state === "reconnecting" && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
          )}
          {state === "connecting" && (
            <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
          )}
          <span className={cn(
            "text-sm font-semibold",
            state === "listening" ? "text-zinc-900" :
            state === "reconnecting" ? "text-amber-700" : "text-zinc-500"
          )}>
            {state === "connecting" ? "Connecting..." :
             state === "reconnecting" ? `Reconnecting... (${reconnectAttempt}/${maxReconnectAttempts})` :
             "Listening to Call"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Mute toggle */}
          {state === "listening" && (
            <button
              onClick={handleMuteToggle}
              className="p-1.5 rounded-md hover:bg-zinc-100 transition-colors"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4 text-red-500" />
              ) : (
                <Volume2 className="h-4 w-4 text-zinc-500" />
              )}
            </button>
          )}

          {/* Stop button */}
          <button
            onClick={handleClick}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-all duration-200"
          >
            Stop
          </button>
        </div>
      </div>

      {/* Waveform */}
      {state === "listening" ? (
        <AudioWaveform analyserRef={analyserRef} />
      ) : (
        <div className="flex items-end justify-center gap-0.5 h-12 bg-zinc-100 rounded-lg px-2">
          {Array(20).fill(0).map((_, i) => (
            <div
              key={i}
              className="w-1.5 rounded-full bg-zinc-300"
              style={{ height: "8%" }}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      {state === "listening" && (
        <div className="flex items-center justify-center gap-2 mt-3 text-xs text-zinc-500">
          <Mic className="w-3.5 h-3.5" />
          Real-time audio streaming
        </div>
      )}
    </div>
  );
}
