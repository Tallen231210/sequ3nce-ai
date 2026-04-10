import React, { useEffect, useRef } from 'react';

interface WaveformProps {
  active: boolean;
  isDark?: boolean;
}

/**
 * Compact horizontal equalizer — green vertical bars that animate when recording.
 * Designed to sit in the middle of the floating pill overlay between the logo and close button.
 */

const NUM_BARS = 20;

export function Waveform({ active, isDark = true }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = canvas.clientWidth;
    const logicalHeight = canvas.clientHeight;
    canvas.width = Math.round(logicalWidth * dpr);
    canvas.height = Math.round(logicalHeight * dpr);
    ctx.scale(dpr, dpr);

    const barWidth = 3;
    const sidePad = 4;
    // Fill available width — calculate gap dynamically
    const availableWidth = logicalWidth - sidePad * 2;
    const gap = Math.max(2, (availableWidth - NUM_BARS * barWidth) / (NUM_BARS - 1));
    const startX = sidePad;
    const centerY = logicalHeight / 2;
    const maxBarHeight = logicalHeight * 0.75;

    const render = () => {
      ctx.clearRect(0, 0, logicalWidth, logicalHeight);
      const t = (performance.now() - startRef.current) / 1000;

      for (let i = 0; i < NUM_BARS; i++) {
        const progress = i / (NUM_BARS - 1);

        // Each bar has a different "natural" height for visual variety
        const baseRatio = 0.3 + 0.7 * Math.abs(Math.sin((i + 3) * 0.8));

        const idleHeight = 4;
        const barHeight = active
          ? Math.max(6, maxBarHeight * baseRatio * (0.4 + 0.6 * Math.abs(Math.sin(t * 3.5 + i * 0.55))))
          : idleHeight;

        const x = startX + i * (barWidth + gap);
        const y = centerY - barHeight / 2;
        const r = barWidth / 2;

        const alpha = active
          ? 0.6 + 0.4 * Math.abs(Math.sin(t * 2 + progress * Math.PI * 2))
          : 0.35;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#34d399'; // emerald-400 green
        ctx.beginPath();
        // Manual rounded rect (TS 4.5 doesn't know roundRect)
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + barWidth, y, x + barWidth, y + r, r);
        ctx.arcTo(x + barWidth, y + barHeight, x + barWidth - r, y + barHeight, r);
        ctx.arcTo(x, y + barHeight, x, y + barHeight - r, r);
        ctx.arcTo(x, y, x + r, y, r);
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
  }, [active, isDark]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}
