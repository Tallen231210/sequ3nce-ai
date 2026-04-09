import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Waveform } from './Waveform';
import { AudioRecorder, blobToBase64 } from './AudioRecorder';

type OverlayState = 'idle' | 'recording' | 'processing' | 'success' | 'error';

// Convex prod HTTP endpoint. Must match apps/web/convex/http.ts routes.
// Kept in sync with the CSP in stream-overlay.html.
const STREAM_TRANSCRIBE_URL = 'https://ideal-ram-982.convex.site/b2c/stream/transcribe';

export function StreamOverlayApp() {
  const [state, setState] = useState<OverlayState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const userIdRef = useRef<string | null>(null);
  // Track whether a stop() is already in flight so a fast tap of the hotkey
  // doesn't double-stop the recorder.
  const stoppingRef = useRef(false);

  // On mount, fetch the current user id and subscribe to changes.
  useEffect(() => {
    window.streamOverlay?.getUserId().then((id) => {
      userIdRef.current = id ?? null;
    }).catch(() => {
      userIdRef.current = null;
    });
    const off = window.streamOverlay?.onUserIdChanged((id) => {
      userIdRef.current = id ?? null;
    });
    return () => {
      off?.();
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

      const audioBase64 = await blobToBase64(blob);

      const res = await fetch(STREAM_TRANSCRIBE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          b2cUserId,
          audioBase64,
          mimeType,
          durationSec,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
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

      setState('success');
      resetAfter(500);
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

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: 20,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        background: 'rgba(17, 24, 39, 0.92)',
        borderRadius: 24,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 20px 48px rgba(0, 0, 0, 0.55)',
        color: '#f9fafb',
        fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        userSelect: 'none',
      }}
    >
      {/* Top label */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: isActive ? '#a78bfa' : '#9ca3af',
        }}
      >
        Sequ3nce Stream
      </div>

      <Waveform active={isActive} />

      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: state === 'error' ? '#f87171' : state === 'success' ? '#34d399' : '#d1d5db',
          textAlign: 'center',
          minHeight: 18,
        }}
      >
        {bodyText}
      </div>
    </div>
  );
}
