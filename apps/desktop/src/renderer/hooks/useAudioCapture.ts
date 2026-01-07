/**
 * Custom hook for capturing system audio + microphone as RAW PCM STEREO
 *
 * This hook handles:
 * - Requesting display media with audio (loopback via electron-audio-loopback)
 * - Requesting microphone access for the closer's voice
 * - Creating STEREO stream with TRUE channel separation:
 *   - Channel 0 (Left) = Microphone = Closer's voice
 *   - Channel 1 (Right) = System audio = Prospect's voice
 * - Using AudioWorklet to capture RAW PCM (linear16) stereo interleaved
 * - Calculating real-time audio levels
 * - Sending raw PCM data to main process via IPC
 *
 * Deepgram multichannel mode transcribes each channel separately,
 * providing 100% deterministic speaker identification.
 */

import { useRef, useCallback } from 'react';
import { logClientError } from '../convex';

interface AudioCaptureOptions {
  onAudioLevel?: (level: number) => void;
  onError?: (error: string) => void;
}

// AudioWorklet processor code - runs in audio rendering thread
// Captures raw Float32 stereo samples and converts to interleaved Int16 (linear16)
const workletProcessorCode = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // Samples per channel before sending
    this.leftBuffer = new Float32Array(this.bufferSize);  // Channel 0 = Mic = Closer
    this.rightBuffer = new Float32Array(this.bufferSize); // Channel 1 = System = Prospect
    this.bufferIndex = 0;
    this.messageCount = 0;
    this.loggedChannelInfo = false;
    this.leftHasAudio = false;
    this.rightHasAudio = false;
    this.channelWarningLogged = false;
    this.leftPeakLevel = 0;
    this.rightPeakLevel = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];

    // Debug: Log channel info once
    if (!this.loggedChannelInfo) {
      this.loggedChannelInfo = true;
      console.log('[PCMProcessor] ========== CHANNEL DEBUG ==========');
      console.log('[PCMProcessor] inputs.length:', inputs.length);
      console.log('[PCMProcessor] input[0] exists:', !!input);
      console.log('[PCMProcessor] input[0].length (CHANNEL COUNT):', input ? input.length : 0);
      if (input) {
        for (let i = 0; i < input.length; i++) {
          console.log('[PCMProcessor] Channel', i, 'sample length:', input[i] ? input[i].length : 0);
        }
      }
      console.log('[PCMProcessor] ===================================');
    }

    if (!input || input.length === 0) {
      return true;
    }

    // CRITICAL: Check if we actually have 2 channels
    if (input.length < 2 && !this.channelWarningLogged) {
      this.channelWarningLogged = true;
      console.error('[PCMProcessor] WARNING: Only receiving', input.length, 'channel(s)! Expected 2 channels for stereo.');
      console.error('[PCMProcessor] This means the audio graph is NOT outputting stereo to the worklet.');
    }

    // Get stereo channels (left = mic/closer, right = system/prospect)
    const leftChannel = input[0] || new Float32Array(128);
    // DO NOT fallback to left channel - use silence if right channel missing
    const rightChannel = input.length >= 2 ? input[1] : new Float32Array(leftChannel.length);
    const frameLength = leftChannel.length;

    // AudioWorklet processes in 128-sample blocks
    for (let i = 0; i < frameLength; i++) {
      this.leftBuffer[this.bufferIndex] = leftChannel[i];
      this.rightBuffer[this.bufferIndex] = rightChannel[i];

      // Track if channels have actual audio and their peak levels
      const leftAbs = Math.abs(leftChannel[i]);
      const rightAbs = Math.abs(rightChannel[i]);
      if (leftAbs > 0.001) this.leftHasAudio = true;
      if (rightAbs > 0.001) this.rightHasAudio = true;
      if (leftAbs > this.leftPeakLevel) this.leftPeakLevel = leftAbs;
      if (rightAbs > this.rightPeakLevel) this.rightPeakLevel = rightAbs;

      this.bufferIndex++;

      if (this.bufferIndex >= this.bufferSize) {
        // Buffer is full, convert to interleaved Int16 stereo and send
        // Format: [L0, R0, L1, R1, L2, R2, ...]
        const int16Buffer = new Int16Array(this.bufferSize * 2);

        for (let j = 0; j < this.bufferSize; j++) {
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
          // Calculate and log peak levels to verify channel separation
          console.log('[PCMProcessor] Buffer #' + this.messageCount + ' | Left(Closer) has audio:', this.leftHasAudio, 'peak:', this.leftPeakLevel.toFixed(4), '| Right(Prospect) has audio:', this.rightHasAudio, 'peak:', this.rightPeakLevel.toFixed(4));

          // CRITICAL CHECK: If both channels always have the same peak levels, separation is not working
          if (this.leftHasAudio && this.rightHasAudio && Math.abs(this.leftPeakLevel - this.rightPeakLevel) < 0.01) {
            console.warn('[PCMProcessor] ⚠️ Both channels have nearly identical levels - possible channel separation issue!');
          }

          this.leftHasAudio = false;
          this.rightHasAudio = false;
          this.leftPeakLevel = 0;
          this.rightPeakLevel = 0;
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
    // Track which step we're on for detailed error reporting
    let captureStep = 'init';
    let systemAudioTrackCount = 0;
    let micAudioTrackCount = 0;
    let videoTrackCount = 0;

    try {
      console.log('[AudioCapture] Starting capture with RAW PCM STEREO (multichannel)...');

      // Step 1: Get system audio via display media (loopback)
      captureStep = 'getDisplayMedia';
      console.log('[AudioCapture] Step 1: Requesting display media with audio...');
      const systemStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true, // Required by getDisplayMedia, but we only use audio
      });

      systemStreamRef.current = systemStream;

      // Log track counts for debugging
      videoTrackCount = systemStream.getVideoTracks().length;
      systemAudioTrackCount = systemStream.getAudioTracks().length;
      console.log(`[AudioCapture] Got stream: ${videoTrackCount} video tracks, ${systemAudioTrackCount} audio tracks`);

      // Stop video tracks immediately - we only need audio
      systemStream.getVideoTracks().forEach(track => {
        console.log('[AudioCapture] Stopping video track:', track.label);
        track.stop();
      });

      const systemAudioTracks = systemStream.getAudioTracks();
      if (systemAudioTracks.length === 0) {
        console.warn('[AudioCapture] No system audio track available');
      } else {
        const audioTrack = systemAudioTracks[0];
        console.log('[AudioCapture] Got system audio track:', audioTrack.label, 'state:', audioTrack.readyState);

        // Check for known macOS 15 bug where track arrives in "ended" state
        if (audioTrack.readyState === 'ended') {
          console.error('[AudioCapture] Audio track arrived in ended state - macOS permission issue');
          throw new Error('Audio track arrived in ended state. This is a known macOS bug. Try removing the app from Privacy settings, restart your Mac, and re-grant permission.');
        }
      }
      captureStep = 'getDisplayMedia_done';

      // Step 2: Get microphone audio (with proper macOS permission request)
      captureStep = 'getUserMedia';
      let micStream: MediaStream | null = null;
      try {
        console.log('[AudioCapture] Step 2: Checking microphone permission...');
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
        micAudioTrackCount = micStream.getAudioTracks().length;
        console.log('[AudioCapture] Got microphone track:', micStream.getAudioTracks()[0]?.label);
      } catch (micError) {
        console.warn('[AudioCapture] Could not get microphone, continuing with system audio only:', micError);
      }
      captureStep = 'getUserMedia_done';

      // Step 3: Create AudioContext at 48kHz
      captureStep = 'audioContext';
      console.log('[AudioCapture] Step 3: Creating AudioContext...');
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
      const actualSampleRate = audioContextRef.current.sampleRate;
      console.log('[AudioCapture] AudioContext created at', actualSampleRate, 'Hz');
      console.log('[AudioCapture] AudioContext state:', audioContextRef.current.state);

      // IMPORTANT: Log warning if actual rate differs from requested
      if (actualSampleRate !== 48000) {
        console.warn(`[AudioCapture] ⚠️ SAMPLE RATE MISMATCH: Requested 48000Hz, got ${actualSampleRate}Hz`);
        console.warn('[AudioCapture] This may cause playback speed issues!');
      }

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

      // Step 4: Create AudioWorklet for raw PCM capture
      captureStep = 'audioWorklet';
      console.log('[AudioCapture] Step 4: Loading AudioWorklet...');
      const workletBlob = new Blob([workletProcessorCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(workletBlob);

      await audioContextRef.current.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);
      console.log('[AudioCapture] AudioWorklet module loaded');
      captureStep = 'audioWorklet_done';

      // Step 5: Create ChannelMergerNode for TRUE stereo separation
      captureStep = 'channelMerger';
      // Channel 0 (Left) = Microphone = Closer
      // Channel 1 (Right) = System Audio = Prospect
      const merger = audioContextRef.current.createChannelMerger(2);

      // Connect microphone to Channel 0 (Left) = Closer
      if (micStream) {
        const micSource = audioContextRef.current.createMediaStreamSource(micStream);
        micSource.connect(merger, 0, 0); // Connect to input 0 of merger (left channel)
        console.log('[AudioCapture] Microphone connected to Channel 0 (Left/Closer)');

        // DEBUG: Monitor mic audio level separately
        const micAnalyser = audioContextRef.current.createAnalyser();
        micAnalyser.fftSize = 256;
        micSource.connect(micAnalyser);
        const micDataArray = new Uint8Array(micAnalyser.frequencyBinCount);

        const micCheckInterval = setInterval(() => {
          micAnalyser.getByteFrequencyData(micDataArray);
          const avg = micDataArray.reduce((a, b) => a + b, 0) / micDataArray.length;
          console.log(`[AudioCapture] 🎤 MIC (Closer) level: ${avg.toFixed(2)}`);
        }, 2000);

        (window as any).__micAudioCheckInterval = micCheckInterval;
      } else {
        // If no mic, create silent source for Channel 0
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
        systemSource.connect(merger, 0, 1); // Connect to input 1 of merger (right channel)
        console.log('[AudioCapture] System audio connected to Channel 1 (Right/Prospect)');

        // DEBUG: Monitor system audio level
        const systemAnalyser = audioContextRef.current.createAnalyser();
        systemAnalyser.fftSize = 256;
        systemSource.connect(systemAnalyser);
        const systemDataArray = new Uint8Array(systemAnalyser.frequencyBinCount);

        const systemCheckInterval = setInterval(() => {
          systemAnalyser.getByteFrequencyData(systemDataArray);
          const avg = systemDataArray.reduce((a, b) => a + b, 0) / systemDataArray.length;
          const hasAudio = avg > 1;
          console.log(`[AudioCapture] 🔊 SYSTEM AUDIO (Prospect) level: ${avg.toFixed(2)} (has audio: ${hasAudio})`);
        }, 2000);

        (window as any).__systemAudioCheckInterval = systemCheckInterval;
      } else {
        // If no system audio, create silent source for Channel 1
        const silentOsc = audioContextRef.current.createOscillator();
        const silentGain = audioContextRef.current.createGain();
        silentGain.gain.value = 0;
        silentOsc.connect(silentGain);
        silentGain.connect(merger, 0, 1);
        silentOsc.start();
        console.log('[AudioCapture] No system audio - using silence for Channel 1');
      }

      // Step 6: Create a GainNode to explicitly maintain stereo signal path
      captureStep = 'stereoGain';
      // This ensures the stereo from the merger is preserved before reaching the worklet
      const stereoGain = audioContextRef.current.createGain();
      stereoGain.channelCount = 2;
      stereoGain.channelCountMode = 'explicit';
      stereoGain.channelInterpretation = 'discrete'; // Keep channels separate!
      stereoGain.gain.value = 1.0;

      merger.connect(stereoGain);
      console.log('[AudioCapture] Stereo GainNode created with channelCount: 2, mode: explicit, interpretation: discrete');

      // 7. Create PCM worklet node for STEREO capture
      workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'pcm-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0, // No audio output needed
        channelCount: 2,    // Stereo!
        channelCountMode: 'explicit',
        channelInterpretation: 'discrete', // Keep channels separate!
      });

      // Handle raw PCM data from worklet
      workletNodeRef.current.port.onmessage = (event) => {
        const pcmBuffer = event.data as ArrayBuffer;
        // Send raw stereo PCM to main process (which forwards to audio processor)
        window.electron.audio.sendAudioData(pcmBuffer);
      };

      stereoGain.connect(workletNodeRef.current);
      console.log('[AudioCapture] PCM worklet connected via stereoGain - capturing raw STEREO PCM for multichannel');

      // 8. Set up audio level analysis
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

      console.log('[AudioCapture] ✅ Capture started with RAW PCM STEREO for multichannel');
      console.log('[AudioCapture] Channel 0 (Left) = Closer, Channel 1 (Right) = Prospect');

      return true;
    } catch (error) {
      console.error('[AudioCapture] Failed to start capture:', error);
      stopCapture();

      let errorType = 'capture_exception';
      let errorMessage = 'Failed to start audio capture';

      if (error instanceof DOMException) {
        errorType = `dom_exception_${error.name}`;
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Screen recording permission denied';
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No audio device found';
        } else {
          errorMessage = error.message;
        }
        options.onError?.(errorMessage);
      } else {
        options.onError?.('Failed to start audio capture');
      }

      // Log error remotely for debugging
      try {
        const platformInfo = await window.electron.app.getPlatform();
        const appVersion = await window.electron.app.getVersion();
        const screenPermission = await window.electron.audio.checkPermissions();
        const micPermission = await window.electron.audio.checkMicrophonePermission();

        // Get saved closer email from localStorage
        const savedCloserInfo = localStorage.getItem('sequ3nce_closer_info');
        const closerEmail = savedCloserInfo ? JSON.parse(savedCloserInfo).email : undefined;

        logClientError({
          closerEmail,
          errorType,
          errorMessage,
          errorStack: error instanceof Error ? error.stack : String(error),
          appVersion,
          platform: platformInfo.platform,
          osVersion: platformInfo.osRelease, // Darwin version for macOS debugging
          architecture: platformInfo.arch,
          screenPermission: screenPermission ? 'true' : 'false',
          microphonePermission: micPermission,
          captureStep, // Which step failed for debugging
          context: JSON.stringify({
            systemAudioTrackCount,
            micAudioTrackCount,
            videoTrackCount,
          }),
        });
      } catch (logErr) {
        console.error('[AudioCapture] Failed to log error remotely:', logErr);
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

    // Stop audio debug intervals
    if ((window as any).__systemAudioCheckInterval) {
      clearInterval((window as any).__systemAudioCheckInterval);
      (window as any).__systemAudioCheckInterval = null;
    }
    if ((window as any).__micAudioCheckInterval) {
      clearInterval((window as any).__micAudioCheckInterval);
      (window as any).__micAudioCheckInterval = null;
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
