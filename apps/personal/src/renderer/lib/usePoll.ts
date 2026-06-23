import { useEffect, useRef } from 'react';

/**
 * Drop-in replacement for ad-hoc setInterval polling. Solves the
 * Convex action-concurrency saturation pattern by:
 *
 *   1. Pausing polls when the window is hidden (no work for a
 *      minimized Sequ3nce that nobody is looking at).
 *   2. Exponential backoff on failure (doubles the next interval up
 *      to baseIntervalMs * 8) so a Convex 429 storm doesn't get
 *      retried at full pace.
 *   3. Per-poll timing jitter so N signed-in users don't pile up at
 *      the same second.
 *   4. setTimeout-based scheduling (not setInterval) so a slow fetch
 *      doesn't queue a backlog of ticks behind it.
 *
 * Usage:
 *   usePoll('botStatus', fetchBotStatus, 10_000);
 *
 * The name is a debug label only — used for console traces if you
 * ever need to spot which poll is misbehaving.
 *
 * @param name Debug label (no functional effect).
 * @param fn Async function that performs one poll iteration. Throwing
 *   counts as a failure and triggers backoff. Returning normally —
 *   including with caught errors — resets the backoff window.
 * @param baseIntervalMs Steady-state interval. Backoff multiplies this.
 * @param options.pauseWhenHidden Default true. Set false for polls that
 *   MUST run even when the window is hidden (rare — heartbeats only).
 * @param options.immediate Default true. If true, fires once on mount
 *   before waiting. Set false for polls that should wait the full
 *   interval before their first call.
 * @param options.jitterPct Default 0.15 (±15%). The fraction of the
 *   interval used for random jitter on each tick.
 * @param options.enabled Default true. Pass a flag if the poll should
 *   only run when some condition is met (e.g. user signed in).
 */
export function usePoll(
  name: string,
  fn: () => Promise<void> | void,
  baseIntervalMs: number,
  options: {
    pauseWhenHidden?: boolean;
    immediate?: boolean;
    jitterPct?: number;
    enabled?: boolean;
  } = {},
): void {
  const {
    pauseWhenHidden = true,
    immediate = true,
    jitterPct = 0.15,
    enabled = true,
  } = options;

  // Keep the latest fn in a ref so changing deps don't tear down
  // the schedule. The caller's fn is captured each render via this ref.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let consecutiveFailures = 0;
    const MAX_BACKOFF_MULTIPLIER = 8;

    function nextDelay(): number {
      const backoffFactor = Math.min(
        MAX_BACKOFF_MULTIPLIER,
        Math.pow(2, consecutiveFailures),
      );
      const base = baseIntervalMs * backoffFactor;
      const jitter = base * jitterPct * (Math.random() * 2 - 1);
      return Math.max(50, Math.floor(base + jitter));
    }

    async function tick() {
      if (cancelled) return;
      // Skip if window is hidden — we'll resume on visibilitychange.
      if (pauseWhenHidden && typeof document !== 'undefined' && document.hidden) {
        scheduleNext();
        return;
      }
      try {
        await fnRef.current();
        consecutiveFailures = 0;
      } catch (err) {
        // Cap to prevent overflow. Log first few for diagnostics.
        if (consecutiveFailures < MAX_BACKOFF_MULTIPLIER) {
          consecutiveFailures += 1;
        }
        if (consecutiveFailures <= 2) {
          console.warn(`[usePoll:${name}] failed (#${consecutiveFailures}):`, err);
        }
      }
      scheduleNext();
    }

    function scheduleNext() {
      if (cancelled) return;
      timeoutId = setTimeout(tick, nextDelay());
    }

    // Resume immediately when window becomes visible again, in case
    // we were paused mid-cycle.
    function onVisibility() {
      if (!pauseWhenHidden) return;
      if (cancelled) return;
      if (document.hidden) return;
      // Cancel pending timer and fire now-ish to snap back to fresh data.
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(tick, 0);
    }
    document.addEventListener('visibilitychange', onVisibility);

    if (immediate) {
      void tick();
    } else {
      scheduleNext();
    }

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, baseIntervalMs, pauseWhenHidden, immediate, jitterPct]);
}
