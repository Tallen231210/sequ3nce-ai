/**
 * Custom hook for capturing system audio + microphone as RAW PCM stereo
 *
 * This hook handles:
 * - Requesting display media with audio (loopback on macOS) for system audio
 * - Requesting microphone access for the closer's voice
 * - Combining into STEREO stream with TRUE channel separation:
 *   - Channel 0 (Left) = Microphone = Closer's voice
 *   - Channel 1 (Right) = System audio = Prospect's voice
 * - Using AudioWorklet to capture RAW PCM (linear16) with channel separation
 * - Keeping MediaRecorder for the recording file (S3 playback)
 * - Calculating real-time audio levels
 * - Sending raw PCM data to main process via IPC
 *
 * RAW PCM is used instead of WebM/Opus because Opus uses "joint stereo" encoding
 * which mixes the channels together. Raw PCM preserves true channel separation
 * for Deepgram's multichannel transcription.
 */

import { useRef, useCallback } from 'react';

interface AudioCaptureOptions {
  onAudioLevel?: (level: number) => void;
  onError?: (error: string) => void;
}

// AudioWorklet processor code - runs in audio rendering thread
// Captures raw Float32 samples and converts to interleaved Int16 (linear16)
const workletProcessorCode = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // Samples per channel before sending
    this.leftBuffer = new Float32Array(this.bufferSize);
    this.rightBuffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.messageCount = 0;
    this.loggedChannelInfo = false;
    this.leftHasAudio = false;
    this.rightHasAudio = false;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];

    // Debug: Log channel info once
    if (!this.loggedChannelInfo) {
      this.loggedChannelInfo = true;
      console.log('[PCMProcessor] First process call - inputs:', inputs.length, 'input[0] channels:', input ? input.length : 0);
      if (input) {
        for (let i = 0; i < input.length; i++) {
          console.log('[PCMProcessor] Channel', i, 'length:', input[i] ? input[i].length : 0);
        }
      }
    }

    if (!input || input.length === 0) {
      return true;
    }

    // Handle mono input by duplicating to stereo
    const leftChannel = input[0];
    const rightChannel = input.length > 1 ? input[1] : input[0]; // Fallback to left if no right channel

    // AudioWorklet processes in 128-sample blocks
    for (let i = 0; i < leftChannel.length; i++) {
      this.leftBuffer[this.bufferIndex] = leftChannel[i];
      this.rightBuffer[this.bufferIndex] = rightChannel[i];

      // Track if channels have actual audio (not silence)
      if (Math.abs(leftChannel[i]) > 0.001) this.leftHasAudio = true;
      if (Math.abs(rightChannel[i]) > 0.001) this.rightHasAudio = true;

      this.bufferIndex++;

      if (this.bufferIndex >= this.bufferSize) {
        // Buffer is full, convert to interleaved Int16 and send
        const int16Buffer = new Int16Array(this.bufferSize * 2);

        for (let j = 0; j < this.bufferSize; j++) {
          // Interleave: [L0, R0, L1, R1, ...]
          // Convert Float32 (-1 to 1) to Int16 (-32768 to 32767)
          const leftSample = Math.max(-1, Math.min(1, this.leftBuffer[j]));
          const rightSample = Math.max(-1, Math.min(1, this.rightBuffer[j]));

          int16Buffer[j * 2] = leftSample < 0
            ? leftSample * 0x8000
            : leftSample * 0x7FFF;
          int16Buffer[j * 2 + 1] = rightSample < 0
            ? rightSample * 0x8000
            : rightSample * 0x7FFF;
        }

        // Send to main thread with debug info periodically
        this.messageCount++;
        if (this.messageCount % 100 === 0) {
          console.log('[PCMProcessor] Sent', this.messageCount, 'buffers. Left has audio:', this.leftHasAudio, 'Right has audio:', this.rightHasAudio);
          // Reset audio detection for next batch
          this.leftHasAudio = false;
          this.rightHasAudio = false;
        }

        this.port.postMessage(int16Buffer.buffer, [int16Buffer.buffer]);

        // Reset buffers
        this.leftBuffer = new Float32Array(this.bufferSize);
        this.rightBuffer = new Float32Array(this.bufferSize);
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

      // 5. Create channel merger for stereo output
      const merger = audioContextRef.current.createChannelMerger(2);

      // Connect microphone to Channel 0 (Left) = Closer
      if (micStream) {
        const micSource = audioContextRef.current.createMediaStreamSource(micStream);
        micSource.connect(merger, 0, 0);
        console.log('[AudioCapture] Microphone connected to Channel 0 (Left/Closer)');
      } else {
        // Silent oscillator for Channel 0 if no mic
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
        systemSource.connect(merger, 0, 1);
        console.log('[AudioCapture] System audio connected to Channel 1 (Right/Prospect)');

        // DEBUG: Add analyser directly on system audio to check if it has any content
        const systemAnalyser = audioContextRef.current.createAnalyser();
        systemAnalyser.fftSize = 256;
        systemSource.connect(systemAnalyser);
        const systemDataArray = new Uint8Array(systemAnalyser.frequencyBinCount);

        // Check system audio level every second
        const systemCheckInterval = setInterval(() => {
          systemAnalyser.getByteFrequencyData(systemDataArray);
          const avg = systemDataArray.reduce((a, b) => a + b, 0) / systemDataArray.length;
          const hasAudio = avg > 1;
          console.log(`[AudioCapture] System audio source level: ${avg.toFixed(2)} (has audio: ${hasAudio})`);
        }, 1000);

        // Store interval for cleanup (attach to window for now)
        (window as any).__systemAudioCheckInterval = systemCheckInterval;
      } else {
        const silentOsc = audioContextRef.current.createOscillator();
        const silentGain = audioContextRef.current.createGain();
        silentGain.gain.value = 0;
        silentOsc.connect(silentGain);
        silentGain.connect(merger, 0, 1);
        silentOsc.start();
        console.log('[AudioCapture] No system audio - using silence for Channel 1');
      }

      // 6. Create PCM worklet node and connect merger to it
      workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'pcm-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0, // No audio output needed
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'discrete', // Keep channels separate!
      });

      // Handle raw PCM data from worklet
      workletNodeRef.current.port.onmessage = (event) => {
        const pcmBuffer = event.data as ArrayBuffer;
        // Send raw PCM to main process (which forwards to audio processor)
        window.electron.audio.sendAudioData(pcmBuffer);
      };

      merger.connect(workletNodeRef.current);
      console.log('[AudioCapture] PCM worklet connected - capturing raw stereo PCM');

      // 7. Set up audio level analysis
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      merger.connect(analyserRef.current);

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

      console.log('[AudioCapture] ✅ Capture started with RAW PCM stereo (Left=Closer, Right=Prospect)');
      console.log('[AudioCapture] Audio will be buffered by audio processor and converted to WAV for S3');

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

    // Stop system audio debug interval
    if ((window as any).__systemAudioCheckInterval) {
      clearInterval((window as any).__systemAudioCheckInterval);
      (window as any).__systemAudioCheckInterval = null;
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
