import { expect, test } from '@playwright/test';
import { adoptSessionEpoch, shouldSignOut } from '../../src/renderer/lib/session-epoch';

test.describe('Session epoch (remote-logout rule)', () => {
  test('never signs out without a server value (older backend / failed check)', () => {
    expect(shouldSignOut(undefined, undefined)).toBe(false);
    expect(shouldSignOut(0, undefined)).toBe(false);
    expect(shouldSignOut(7, undefined)).toBe(false);
  });

  test('a pre-feature session stays in until an admin bumps the account', () => {
    expect(shouldSignOut(undefined, 0)).toBe(false);
    expect(shouldSignOut(undefined, 1)).toBe(true);
    expect(shouldSignOut(undefined, 42)).toBe(true);
  });

  test('signs out only when the held epoch differs from the server', () => {
    expect(shouldSignOut(0, 0)).toBe(false);
    expect(shouldSignOut(3, 3)).toBe(false);
    expect(shouldSignOut(3, 4)).toBe(true);
    // A server that somehow moved backwards is still "not the epoch I hold".
    expect(shouldSignOut(4, 3)).toBe(true);
  });

  test('adopting keeps a held epoch and fills a missing one from the server', () => {
    expect(adoptSessionEpoch(5, 9)).toBe(5);
    expect(adoptSessionEpoch(undefined, 0)).toBe(0);
    expect(adoptSessionEpoch(undefined, 2)).toBe(2);
    expect(adoptSessionEpoch(undefined, undefined)).toBeUndefined();
  });

  test('adopt-then-bump is detected on the next check', () => {
    const afterFirstCheck = adoptSessionEpoch(undefined, 0);
    expect(shouldSignOut(afterFirstCheck, 0)).toBe(false);
    expect(shouldSignOut(afterFirstCheck, 1)).toBe(true);
  });
});
