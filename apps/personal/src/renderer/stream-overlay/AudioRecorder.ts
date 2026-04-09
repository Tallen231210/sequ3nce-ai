// Encapsulates MediaRecorder + getUserMedia for capturing mic audio as a WebM blob.
// Lives in the overlay renderer, where navigator.mediaDevices is available.

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationSec: number;
}

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt: number = 0;
  private stopResolve: ((r: RecordingResult) => void) | null = null;
  private stopReject: ((err: Error) => void) | null = null;

  /**
   * Pick the best supported MediaRecorder mime type on the current platform.
   * Groq Whisper accepts WebM/Opus and Ogg/Opus directly, so we prefer those.
   */
  private static pickMimeType(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg',
    ];
    for (const type of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  async start(): Promise<void> {
    if (this.mediaRecorder) {
      throw new Error('AudioRecorder: already recording');
    }

    // Request a fresh mic stream on each recording. (We considered caching the
    // stream across sessions but it's fragile — the OS can revoke, the device
    // can change, and the stream goes stale.)
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // 16 kHz mono is plenty for speech-to-text and keeps the upload small.
        sampleRate: 16_000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    const mimeType = AudioRecorder.pickMimeType();
    this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];

    this.mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    });

    this.mediaRecorder.addEventListener('stop', () => {
      const actualMime = this.mediaRecorder?.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(this.chunks, { type: actualMime });
      const durationSec = (Date.now() - this.startedAt) / 1000;

      // Release the mic so the browser doesn't keep the indicator lit
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.mediaRecorder = null;
      this.chunks = [];

      if (this.stopResolve) {
        this.stopResolve({ blob, mimeType: actualMime, durationSec });
        this.stopResolve = null;
        this.stopReject = null;
      }
    });

    this.mediaRecorder.addEventListener('error', (event) => {
      const err = (event as Event & { error?: Error }).error ?? new Error('MediaRecorder error');
      if (this.stopReject) {
        this.stopReject(err);
        this.stopResolve = null;
        this.stopReject = null;
      }
    });

    this.startedAt = Date.now();
    this.mediaRecorder.start();
  }

  /**
   * Stop the recorder and resolve with the final blob once the 'stop' event fires.
   * Throws if called before start().
   */
  async stop(): Promise<RecordingResult> {
    if (!this.mediaRecorder) {
      throw new Error('AudioRecorder: stop() called before start()');
    }
    if (this.mediaRecorder.state === 'inactive') {
      throw new Error('AudioRecorder: already stopped');
    }

    return new Promise<RecordingResult>((resolve, reject) => {
      this.stopResolve = resolve;
      this.stopReject = reject;
      this.mediaRecorder?.stop();
    });
  }

  /** Force-stop and discard any pending audio. Safe to call anytime. */
  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
    if (this.stopReject) {
      this.stopReject(new Error('Recording cancelled'));
      this.stopResolve = null;
      this.stopReject = null;
    }
  }

  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}

/**
 * Convert a Blob to base64 (without the data URI prefix).
 * Used to send the audio payload to the Convex HTTP action.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader did not return a string'));
        return;
      }
      // Strip the "data:...;base64," prefix
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
