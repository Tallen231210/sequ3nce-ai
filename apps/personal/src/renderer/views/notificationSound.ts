// Gentle two-tone notification chime using Web Audio API.
// Produces a soft, peaceful "ding-ding" without requiring audio files.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function playNotificationChime(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // First tone — soft high note
    playTone(ctx, now, 880, 0.28, 0.15);
    // Second tone — slightly higher, delayed
    playTone(ctx, now + 0.15, 1047, 0.22, 0.2);
  } catch {
    // Silently fail — audio isn't critical
  }
}

function playTone(
  ctx: AudioContext,
  startTime: number,
  frequency: number,
  volume: number,
  duration: number,
): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startTime);

  // Gentle envelope: quick fade in, slow fade out
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}
