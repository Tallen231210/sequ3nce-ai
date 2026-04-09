import React, { useEffect, useRef } from 'react';

interface WaveformProps {
  /** Whether the waveform should be animating (recording state). */
  active: boolean;
  /** Optional: number of bars. Defaults to 28 to match CypherKey's visual. */
  bars?: number;
}

/**
 * Simple animated waveform rendered on a canvas. Each bar bounces with a
 * sine wave offset by its index, giving a smooth left-to-right ripple while
 * the user is speaking. Zero audio input — this is purely cosmetic, matching
 * CypherKey's overlay pattern.
 */
export function Waveform({ active, bars = 28 }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // HiDPI scaling
    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = canvas.clientWidth;
    const logicalHeight = canvas.clientHeight;
    canvas.width = Math.round(logicalWidth * dpr);
    canvas.height = Math.round(logicalHeight * dpr);
    ctx.scale(dpr, dpr);

    const barWidth = 3;
    const gap = (logicalWidth - bars * barWidth) / (bars - 1);

    const render = () => {
      ctx.clearRect(0, 0, logicalWidth, logicalHeight);

      const t = (performance.now() - startRef.current) / 1000;
      const centerY = logicalHeight / 2;

      for (let i = 0; i < bars; i++) {
        // Base idle height when not actively recording
        const idleHeight = 4;
        const waveHeight = active
          ? 10 + Math.abs(Math.sin(t * 4 + i * 0.35)) * (logicalHeight * 0.4)
          : idleHeight;

        const x = i * (barWidth + gap);
        const y = centerY - waveHeight / 2;

        // Gradient from indigo to cyan, inspired by Sequ3nce's brand palette
        const gradient = ctx.createLinearGradient(0, y, 0, y + waveHeight);
        gradient.addColorStop(0, active ? '#a78bfa' : '#6b7280');
        gradient.addColorStop(1, active ? '#22d3ee' : '#9ca3af');
        ctx.fillStyle = gradient;

        // Rounded bars
        const radius = barWidth / 2;
        ctx.beginPath();
        ctx.moveTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.arcTo(x + barWidth, y, x + barWidth, y + radius, radius);
        ctx.lineTo(x + barWidth, y + waveHeight - radius);
        ctx.arcTo(x + barWidth, y + waveHeight, x + barWidth - radius, y + waveHeight, radius);
        ctx.arcTo(x, y + waveHeight, x, y + waveHeight - radius, radius);
        ctx.closePath();
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active, bars]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: 64, display: 'block' }}
    />
  );
}
