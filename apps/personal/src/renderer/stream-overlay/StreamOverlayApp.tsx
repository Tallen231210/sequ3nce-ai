import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Waveform } from './Waveform';
import { AudioRecorder } from './AudioRecorder';

type OverlayState = 'idle' | 'recording' | 'processing' | 'success' | 'error';

const CONVEX_SITE_URL = 'https://ideal-ram-982.convex.site';
// Direct-to-Groq: call the Whisper API with zero middleman hops for minimum latency
const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = 'whisper-large-v3-turbo';

// Cache the Groq API key in memory after first fetch — never written to disk
let cachedApiKey: string | null = null;

async function getGroqApiKey(userId: string): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  const res = await fetch(`${CONVEX_SITE_URL}/b2c/stream/api-key?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to get API key (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { apiKey?: string; error?: string };
  if (!data.apiKey) throw new Error(data.error ?? 'No API key returned');
  cachedApiKey = data.apiKey;
  return cachedApiKey;
}

/** Save transcription to Convex history (fire-and-forget, doesn't block paste) */
function saveTranscriptionInBackground(userId: string, text: string, durationSec?: number): void {
  fetch(`${CONVEX_SITE_URL}/b2c/stream/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ b2cUserId: userId, text, durationSec }),
  }).catch((err) => {
    console.error('[StreamOverlay] background save failed:', err);
  });
}

export function StreamOverlayApp() {
  const [state, setState] = useState<OverlayState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const recorderRef = useRef<AudioRecorder | null>(null);
  const userIdRef = useRef<string | null>(null);
  // Track whether a stop() is already in flight so a fast tap of the hotkey
  // doesn't double-stop the recorder.
  const stoppingRef = useRef(false);

  const isDark = theme === 'dark';

  // On mount, fetch current user id + theme, and subscribe to changes.
  useEffect(() => {
    window.streamOverlay?.getUserId().then((id) => {
      userIdRef.current = id ?? null;
    }).catch(() => {
      userIdRef.current = null;
    });
    // Fetch the current theme so we don't start with the wrong mode
    window.streamOverlay?.getTheme().then((t) => {
      setTheme(t === 'dark' ? 'dark' : 'light');
    }).catch(() => {});
    const offUser = window.streamOverlay?.onUserIdChanged((id) => {
      userIdRef.current = id ?? null;
    });
    const offTheme = window.streamOverlay?.onThemeChanged((t) => {
      setTheme(t === 'dark' ? 'dark' : 'light');
    });
    return () => {
      offUser?.();
      offTheme?.();
    };
  }, []);

  const resetAfter = useCallback((ms: number) => {
    setTimeout(() => {
      setState('idle');
      setErrorMessage(null);
      window.streamOverlay?.hideOverlay();
    }, ms);
  }, []);

  const handleStart = useCallback(async () => {
    if (state === 'recording' || state === 'processing') return;
    setErrorMessage(null);
    try {
      const recorder = new AudioRecorder();
      recorderRef.current = recorder;
      await recorder.start();
      setState('recording');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access failed';
      console.error('[StreamOverlay] start failed:', msg);
      setErrorMessage(msg);
      setState('error');
      recorderRef.current = null;
      resetAfter(2500);
    }
  }, [state, resetAfter]);

  const handleStop = useCallback(async () => {
    if (stoppingRef.current) return;
    const recorder = recorderRef.current;
    if (!recorder) return;
    stoppingRef.current = true;

    try {
      setState('processing');
      const { blob, mimeType, durationSec } = await recorder.stop();
      recorderRef.current = null;

      // Guard: ignore clips shorter than 300ms — usually a misfire tap.
      if (durationSec < 0.3 || blob.size < 1000) {
        setState('idle');
        window.streamOverlay?.hideOverlay();
        return;
      }

      const b2cUserId = userIdRef.current;
      if (!b2cUserId) {
        throw new Error('Not signed in');
      }

      // Get the Groq API key (cached after first fetch)
      const apiKey = await getGroqApiKey(b2cUserId);

      // Call Groq Whisper directly — single network hop, no Convex middleman
      const form = new FormData();
      form.append('file', blob, `dictation.${mimeType.includes('webm') ? 'webm' : 'ogg'}`);
      form.append('model', GROQ_MODEL);
      form.append('language', 'en');
      form.append('response_format', 'json');

      const res = await fetch(GROQ_TRANSCRIPTION_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        // If auth failed, clear the cached key so next attempt re-fetches
        if (res.status === 401 || res.status === 403) {
          cachedApiKey = null;
        }
        throw new Error(`Transcription failed (${res.status}): ${errBody.slice(0, 200)}`);
      }

      const payload = (await res.json()) as { text?: string; error?: string };
      if (payload.error) {
        throw new Error(payload.error);
      }

      const text = payload.text ?? '';
      if (!text) {
        setState('idle');
        window.streamOverlay?.hideOverlay();
        return;
      }

      // Hand the text to main for the paste + clipboard dance
      const pasteResult = await window.streamOverlay?.pasteText(text);
      if (!pasteResult?.success) {
        throw new Error(pasteResult?.error ?? 'Paste failed');
      }

      // Save transcription to Convex history in the background (non-blocking)
      saveTranscriptionInBackground(b2cUserId, text, durationSec);

      // Instant hide — the paste landing is the confirmation
      setState('idle');
      window.streamOverlay?.hideOverlay();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transcription failed';
      console.error('[StreamOverlay] stop failed:', msg);
      setErrorMessage(msg);
      setState('error');
      resetAfter(2500);
    } finally {
      stoppingRef.current = false;
    }
  }, [resetAfter]);

  // Wire hotkey events from main process
  useEffect(() => {
    const offDown = window.streamOverlay?.onHotkeyDown(() => {
      handleStart();
    });
    const offUp = window.streamOverlay?.onHotkeyUp(() => {
      handleStop();
    });
    return () => {
      offDown?.();
      offUp?.();
    };
  }, [handleStart, handleStop]);

  const bodyText = {
    idle: 'Hold your hotkey to dictate',
    recording: 'Listening…',
    processing: 'Transcribing…',
    success: 'Pasted ✓',
    error: errorMessage ?? 'Something went wrong',
  }[state];

  const isActive = state === 'recording';
  const isProcessing = state === 'processing';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: '0 12px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        background: isDark ? 'rgba(24, 24, 27, 0.92)' : 'rgba(255, 255, 255, 0.92)',
        borderRadius: 28,
        border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.1)',
        boxShadow: isDark ? '0 12px 36px rgba(0, 0, 0, 0.5)' : '0 12px 36px rgba(0, 0, 0, 0.15)',
        color: isDark ? '#ffffff' : '#000000',
        fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        userSelect: 'none',
      }}
    >
      {/* Sequ3nce icon — inverted in light mode so the S stays visible */}
      <img
        src={require('../../assets/icon.png')}
        alt="S"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          flexShrink: 0,
          filter: isDark ? 'none' : 'invert(1)',
        }}
      />

      {/* Waveform / status text */}
      <div style={{ flex: 1, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
        {isProcessing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 14,
                height: 14,
                border: isDark ? '2px solid rgba(255,255,255,0.2)' : '2px solid rgba(0,0,0,0.1)',
                borderTopColor: '#34d399',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 500, color: isDark ? '#a1a1aa' : '#71717a' }}>
              Transcribing...
            </span>
          </div>
        ) : state === 'error' ? (
          <span style={{ fontSize: 11, fontWeight: 500, color: '#f87171' }}>
            {errorMessage ?? 'Error'}
          </span>
        ) : state === 'success' ? (
          <span style={{ fontSize: 12, fontWeight: 500, color: '#34d399' }}>
            Done
          </span>
        ) : (
          <Waveform active={isActive} isDark={isDark} />
        )}
      </div>

      {/* Close / dismiss button */}
      <button
        onClick={() => window.streamOverlay?.hideOverlay()}
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: 'none',
          background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          color: isDark ? '#71717a' : '#a1a1aa',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          lineHeight: 1,
          padding: 0,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="2" y1="2" x2="8" y2="8" />
          <line x1="8" y1="2" x2="2" y2="8" />
        </svg>
      </button>

      {/* Spin animation for the processing spinner */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
