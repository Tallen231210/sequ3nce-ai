/**
 * Custom hook for capturing system audio + microphone as STEREO channels
 *
 * This hook handles:
 * - Requesting display media with audio (loopback on macOS) for system audio
 * - Requesting microphone access for the closer's voice
 * - Combining into STEREO stream (NOT mixed):
 *   - Channel 0 (Left) = Microphone = Closer's voice
 *   - Channel 1 (Right) = System audio = Prospect's voice
 * - Recording stereo audio chunks with MediaRecorder
 * - Calculating real-time audio levels
 * - Sending audio data to main process via IPC
 *
 * The stereo separation allows Deepgram's multichannel feature to transcribe
 * each speaker independently with 100% accuracy (no AI diarization needed).
 */

import { useRef, useCallback } from 'react';

interface AudioCaptureOptions {
  onAudioLevel?: (level: number) => void;
  onError?: (error: string) => void;
}

export function useAudioCapture(options: AudioCaptureOptions = {}) {
  const systemStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mixedStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelIntervalRef = useRef<number | null>(null);

  const startCapture = useCallback(async (): Promise<boolean> => {
    try {
      console.log('[AudioCapture] Starting capture with system audio + microphone...');

      // 1. Get system audio via display media (loopback)
      console.log('[AudioCapture] Requesting display media with audio...');
      const systemStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true, // Required by getDisplayMedia, but we only use audio
      });

      systemStreamRef.current = systemStream;

      // Stop video tracks immediately - we only need audio
      systemStream.getVideoTracks().forEach(track => {
        console.log('[AudioCapture] Stopping video track:', track.label);
        track.stop();
      });

      const systemAudioTracks = systemStream.getAudioTracks();
      if (systemAudioTracks.length === 0) {
        console.warn('[AudioCapture] No system audio track available');
      } else {
        console.log('[AudioCapture] Got system audio track:', systemAudioTracks[0].label);
      }

      // 2. Get microphone audio (with proper macOS permission request)
      let micStream: MediaStream | null = null;
      try {
        // First, request microphone permission through Electron's systemPreferences API
        // This is required on macOS for the app to appear in System Settings > Privacy > Microphone
        console.log('[AudioCapture] Checking microphone permission...');
        const micPermission = await window.electron.audio.checkMicrophonePermission();
        console.log('[AudioCapture] Microphone permission status:', micPermission);

        if (micPermission === 'not-determined') {
          console.log('[AudioCapture] Requesting microphone permission via system dialog...');
          const granted = await window.electron.audio.requestMicrophonePermission();
          console.log('[AudioCapture] Microphone permission granted:', granted);
          if (!granted) {
            console.warn('[AudioCapture] Microphone permission denied');
            // Open System Preferences so user can grant permission
            await window.electron.audio.openMicrophonePreferences();
            throw new Error('Microphone permission denied - please grant access in System Settings');
          }
        } else if (micPermission === 'denied') {
          console.warn('[AudioCapture] Microphone permission previously denied');
          // Open System Preferences so user can grant permission
          await window.electron.audio.openMicrophonePreferences();
          throw new Error('Microphone permission denied - please grant access in System Settings');
        }

        console.log('[AudioCapture] Requesting microphone access...');
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        micStreamRef.current = micStream;
        console.log('[AudioCapture] Got microphone track:', micStream.getAudioTracks()[0]?.label);
      } catch (micError) {
        console.warn('[AudioCapture] Could not get microphone, continuing with system audio only:', micError);
        // Continue without mic - system audio might still have the user's voice via Zoom
      }

      // 3. Create AudioContext and merge streams into STEREO (not mixed mono)
      // Channel 0 (Left) = Microphone = Closer
      // Channel 1 (Right) = System audio = Prospect
      audioContextRef.current = new AudioContext();

      // Create a channel merger for 2-channel stereo output
      const merger = audioContextRef.current.createChannelMerger(2);
      const destination = audioContextRef.current.createMediaStreamDestination();

      // Connect microphone to Channel 0 (Left) = Closer
      if (micStream) {
        const micSource = audioContextRef.current.createMediaStreamSource(micStream);
        micSource.connect(merger, 0, 0); // Input 0 → Output channel 0 (Left)
        console.log('[AudioCapture] Microphone connected to Channel 0 (Left/Closer)');
      } else {
        // If no mic, create silence for Channel 0 to maintain stereo format
        const silentOsc = audioContextRef.current.createOscillator();
        const silentGain = audioContextRef.current.createGain();
        silentGain.gain.value = 0;
        silentOsc.connect(silentGain);
        silentGain.connect(merger, 0, 0);
        silentOsc.start();
        console.log('[AudioCapture] No microphone - using silence for Channel 0');
      }

      // Connect system audio to Channel 1 (Right) = Prospect
      if (systemAudioTracks.length > 0) {
        const systemSource = audioContextRef.current.createMediaStreamSource(systemStream);
        systemSource.connect(merger, 0, 1); // Input 0 → Output channel 1 (Right)
        console.log('[AudioCapture] System audio connected to Channel 1 (Right/Prospect)');
      } else {
        // If no system audio, create silence for Channel 1 to maintain stereo format
        const silentOsc = audioContextRef.current.createOscillator();
        const silentGain = audioContextRef.current.createGain();
        silentGain.gain.value = 0;
        silentOsc.connect(silentGain);
        silentGain.connect(merger, 0, 1);
        silentOsc.start();
        console.log('[AudioCapture] No system audio - using silence for Channel 1');
      }

      // Connect merger to destination
      merger.connect(destination);
      console.log('[AudioCapture] Created stereo stream: Left=Closer, Right=Prospect');

      // The stereo stream is what we'll record
      mixedStreamRef.current = destination.stream;

      // 4. Set up audio level analysis on the mixed stream
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      // Connect mixed output to analyser for level metering
      const mixedSource = audioContextRef.current.createMediaStreamSource(destination.stream);
      mixedSource.connect(analyserRef.current);

      // Start level metering
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      levelIntervalRef.current = window.setInterval(() => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          // Calculate average level (0-1)
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const normalizedLevel = average / 255;

          // Send level to main process
          window.electron.audio.sendAudioLevel(normalizedLevel);
          options.onAudioLevel?.(normalizedLevel);
        }
      }, 50); // Update every 50ms

      // 5. Set up MediaRecorder on the stereo stream
      const mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.warn('[AudioCapture] opus not supported, trying default');
      }

      mediaRecorderRef.current = new MediaRecorder(destination.stream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'audio/webm',
        audioBitsPerSecond: 256000, // Higher bitrate for stereo (2 channels)
      });

      mediaRecorderRef.current.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          // Convert Blob to ArrayBuffer and send to main process
          const arrayBuffer = await event.data.arrayBuffer();
          window.electron.audio.sendAudioData(arrayBuffer);
        }
      };

      mediaRecorderRef.current.onerror = (event) => {
        console.error('[AudioCapture] MediaRecorder error:', event);
        options.onError?.('Audio recording error');
      };

      // Start recording - request data every 100ms for low latency
      mediaRecorderRef.current.start(100);
      console.log('[AudioCapture] MediaRecorder started with STEREO audio (Left=Closer, Right=Prospect)');

      return true;
    } catch (error) {
      console.error('[AudioCapture] Failed to start capture:', error);

      // Clean up any partial state
      stopCapture();

      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          options.onError?.('Screen recording permission denied');
        } else if (error.name === 'NotFoundError') {
          options.onError?.('No audio device found');
        } else {
          options.onError?.(error.message);
        }
      } else {
        options.onError?.('Failed to start audio capture');
      }

      return false;
    }
  }, [options]);

  const stopCapture = useCallback(() => {
    console.log('[AudioCapture] Stopping capture...');

    // Stop level metering
    if (levelIntervalRef.current) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // Close AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      analyserRef.current = null;
    }

    // Stop system audio tracks
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach(track => {
        console.log('[AudioCapture] Stopping system track:', track.label);
        track.stop();
      });
      systemStreamRef.current = null;
    }

    // Stop microphone tracks
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => {
        console.log('[AudioCapture] Stopping mic track:', track.label);
        track.stop();
      });
      micStreamRef.current = null;
    }

    // Clear mixed stream reference
    mixedStreamRef.current = null;

    console.log('[AudioCapture] Capture stopped');
  }, []);

  return {
    startCapture,
    stopCapture,
  };
}
