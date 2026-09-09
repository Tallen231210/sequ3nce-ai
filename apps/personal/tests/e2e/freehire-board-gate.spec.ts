import { expect, test } from '@playwright/test';
import {
  applyFreeHireBoardFlag,
  initialFreeHireBoardDecision,
  shouldRenderFreeHireBoard,
} from '../../src/renderer/lib/freehire-board-gate';
import { convexFetch, getFeatureFlags } from '../../src/renderer/convex';

test.describe('FreeHire board flag gate', () => {
  test('renders the resilient new board while the remote decision is unknown', () => {
    const pending = initialFreeHireBoardDecision(false, false);
    expect(pending).toBeNull();
    expect(shouldRenderFreeHireBoard(pending)).toBe(true);

    const afterFailure = applyFreeHireBoardFlag(pending, null);
    expect(afterFailure).toBeNull();
    expect(shouldRenderFreeHireBoard(afterFailure)).toBe(true);
  });

  test('keeps a last-known-good decision through malformed responses', () => {
    const cached = initialFreeHireBoardDecision(false, true);
    expect(cached).toBe(true);
    expect(applyFreeHireBoardFlag(cached, {})).toBe(true);
    expect(shouldRenderFreeHireBoard(cached)).toBe(true);
  });

  test('reserves the legacy board for an explicit server-side off decision', () => {
    const disabled = applyFreeHireBoardFlag(null, { freehire_job_board: false });
    expect(disabled).toBe(false);
    expect(shouldRenderFreeHireBoard(disabled)).toBe(false);

    const reenabled = applyFreeHireBoardFlag(disabled, { freehire_job_board: true });
    expect(reenabled).toBe(true);
    expect(shouldRenderFreeHireBoard(reenabled)).toBe(true);
  });

  test('fetches the control-plane flag without waiting on the shared circuit breaker', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response('', { status: 429 });
      return new Response(JSON.stringify({ flags: { freehire_job_board: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    try {
      await convexFetch('https://example.test/throttled');
      const startedAt = Date.now();
      const flags = await getFeatureFlags(undefined);
      expect(Date.now() - startedAt).toBeLessThan(1_000);
      expect(flags).toEqual({ freehire_job_board: true });
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('retries a transient feature-flag transport failure once', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) throw new Error('temporary network failure');
      return new Response(JSON.stringify({ flags: { freehire_job_board: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    try {
      await expect(getFeatureFlags(undefined)).resolves.toEqual({ freehire_job_board: true });
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
