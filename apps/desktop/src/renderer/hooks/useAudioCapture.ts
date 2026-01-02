/**
 * Custom hook for capturing system audio + microphone as RAW PCM mono
 *
 * This hook handles:
 * - Requesting display media with audio (loopback on macOS) for system audio
 * - Requesting microphone access for the closer's voice
 * - Mixing both sources into MONO stream for Deepgram diarization
 * - Using AudioWorklet to capture RAW PCM (linear16)
 * - Calculating real-time audio levels
 * - Sending raw PCM data to main process via IPC
 *
 * Note: We use diarization (AI-based speaker detection) instead of multichannel
 * because macOS loopback audio via Electron doesn't work reliably.
 * The first speaker detected is assigned as Closer, second as Prospect.
 */

import { useRef, useCallback } from 'react';

interface AudioCaptureOptions {
  onAudioLevel?: (level: number) => void;
  onError?: (error: string) => void;
}

// AudioWorklet processor code - runs in audio rendering thread
// Captures raw Float32 samples and converts to mono Int16 (linear16)
const workletProcessorCode = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // Samples before sending
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.messageCount = 0;
    this.loggedChannelInfo = false;
    this.hasAudio = false;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];

    // Debug: Log channel info once
    if (!this.loggedChannelInfo) {
      this.loggedChannelInfo = true;
      console.log('[PCMProcessor] First process call - inputs:', inputs.length, 'input[0] channels:', input ? input.length : 0);
    }

    if (!input || input.length === 0) {
      return true;
    }

    // Mix all channels to mono
    const numChannels = input.length;
    const frameLength = input[0].length;

    // AudioWorklet processes in 128-sample blocks
    for (let i = 0; i < frameLength; i++) {
      // Sum all channels and average for mono
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += input[ch][i];
      }
      const monoSample = sum / numChannels;

      this.buffer[this.bufferIndex] = monoSample;

      // Track if audio is present
      if (Math.abs(monoSample) > 0.001) this.hasAudio = true;

      this.bufferIndex++;

      if (this.bufferIndex >= this.bufferSize) {
        // Buffer is full, convert to Int16 and send
        const int16Buffer = new Int16Array(this.bufferSize);

        for (let j = 0; j < this.bufferSize; j++) {
          // Convert Float32 (-1 to 1) to Int16 (-32768 to 32767)
          const sample = Math.max(-1, Math.min(1, this.buffer[j]));
          int16Buffer[j] = sample < 0
            ? sample * 0x8000
            : sample * 0x7FFF;
        }

        // Send to main thread with debug info periodically
        this.messageCount++;
        if (this.messageCount % 100 === 0) {
          console.log('[PCMProcessor] Sent', this.messageCount, 'buffers. Has audio:', this.hasAudio);
          this.hasAudio = false;
        }

        this.port.postMessage(int16Buffer.buffer, [int16Buffer.buffer]);

        // Reset buffer
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor('pcm-processor', PCMProcessor);
`;

export function useAudioCapture(options: AudioCaptureOptions = {}) {
  const systemStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelIntervalRef = useRef<number | null>(null);

  const startCapture = useCallback(async (): Promise<boolean> => {
    try {
      console.log('[AudioCapture] Starting capture with RAW PCM stereo...');

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
        console.log('[AudioCapture] Checking microphone permission...');
        const micPermission = await window.electron.audio.checkMicrophonePermission();
        console.log('[AudioCapture] Microphone permission status:', micPermission);

        if (micPermission === 'not-determined') {
          console.log('[AudioCapture] Requesting microphone permission via system dialog...');
          const granted = await window.electron.audio.requestMicrophonePermission();
          console.log('[AudioCapture] Microphone permission granted:', granted);
          if (!granted) {
            console.warn('[AudioCapture] Microphone permission denied');
            await window.electron.audio.openMicrophonePreferences();
            throw new Error('Microphone permission denied - please grant access in System Settings');
          }
        } else if (micPermission === 'denied') {
          console.warn('[AudioCapture] Microphone permission previously denied');
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
      }

      // 3. Create AudioContext at 48kHz (standard for Deepgram)
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
      console.log('[AudioCapture] AudioContext created at', audioContextRef.current.sampleRate, 'Hz');
      console.log('[AudioCapture] AudioContext state:', audioContextRef.current.state);

      // Log detailed stream info
      if (micStream) {
        const micTrack = micStream.getAudioTracks()[0];
        const micSettings = micTrack?.getSettings();
        console.log('[AudioCapture] Mic track settings:', JSON.stringify(micSettings));
      }
      if (systemAudioTracks.length > 0) {
        const sysSettings = systemAudioTracks[0]?.getSettings();
        console.log('[AudioCapture] System audio track settings:', JSON.stringify(sysSettings));
      }

      // 4. Create AudioWorklet for raw PCM capture
      const workletBlob = new Blob([workletProcessorCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(workletBlob);

      await audioContextRef.current.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);
      console.log('[AudioCapture] AudioWorklet module loaded');

      // 5. Create gain node to mix all sources to mono
      const mixerGain = audioContextRef.current.createGain();
      mixerGain.gain.value = 1.0;

      // Connect microphone to mixer
      if (micStream) {
        const micSource = audioContextRef.current.createMediaStreamSource(micStream);
        micSource.connect(mixerGain);
        console.log('[AudioCapture] Microphone connected to mixer');
      }

      // Connect system audio to mixer (even if silent, for completeness)
      if (systemAudioTracks.length > 0) {
        const systemSource = audioContextRef.current.createMediaStreamSource(systemStream);
        systemSource.connect(mixerGain);
        console.log('[AudioCapture] System audio connected to mixer');
      }

      // 6. Create PCM worklet node and connect mixer to it
      workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'pcm-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0, // No audio output needed
        channelCount: 1,    // Mono output
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers', // Mix to mono
      });

      // Handle raw PCM data from worklet
      workletNodeRef.current.port.onmessage = (event) => {
        const pcmBuffer = event.data as ArrayBuffer;
        // Send raw PCM to main process (which forwards to audio processor)
        window.electron.audio.sendAudioData(pcmBuffer);
      };

      mixerGain.connect(workletNodeRef.current);
      console.log('[AudioCapture] PCM worklet connected - capturing raw mono PCM for diarization');

      // 7. Set up audio level analysis
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      mixerGain.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      levelIntervalRef.current = window.setInterval(() => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const normalizedLevel = average / 255;
          window.electron.audio.sendAudioLevel(normalizedLevel);
          options.onAudioLevel?.(normalizedLevel);
        }
      }, 50);

      console.log('[AudioCapture] ✅ Capture started with RAW PCM mono for diarization');
      console.log('[AudioCapture] Deepgram will use AI diarization to identify speakers');

      return true;
    } catch (error) {
      console.error('[AudioCapture] Failed to start capture:', error);
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

    // Disconnect worklet
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
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

    console.log('[AudioCapture] Capture stopped');
  }, []);

  return {
    startCapture,
    stopCapture,
  };
}
