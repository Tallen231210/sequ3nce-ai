import { execFileSync } from 'child_process';
import path from 'path';
import { expect, test, resetToLogin } from './fixtures';

// ============================================================================
// Remote logout, end to end, against the B2C DEV deployment.
//
// The app is hard-wired to prod, so every prod backend call is rewritten to
// the dev site inside the Electron window. A throwaway isTestAccount on dev
// (rotated freely by these tests) stands in for the shared demo account.
//
// Opt-in — needs a dev deployment and the throwaway to exist:
//   SESSION_EPOCH_DEV_TEST=1 \
//   SESSION_EPOCH_DEV_SITE_URL=https://<dev>.convex.site \
//   npx playwright test tests/e2e/session-epoch-integration.spec.ts
// ============================================================================

const RUN = process.env.SESSION_EPOCH_DEV_TEST === '1';
const DEV_SITE = (process.env.SESSION_EPOCH_DEV_SITE_URL || '').replace(/\/+$/, '');
const PROD_SITE = 'https://ideal-ram-982.convex.site';
const STORAGE_KEY = 'sequ3nce_personal_info';
const NOTICE = 'You were signed out of this account';
const LOGIN_TEXT = 'text="Sign in to your account"';
const WEB_DIR = path.resolve(__dirname, '../../../web');

/** Throwaway test account on the DEV deployment (provisionTestAccount). */
const DEV_USER = {
  email: 'rotation-test@sequ3nce.ai',
  name: 'Rotation Test',
  closerId: 'jd77htt513ykyqkjv2es2pcdvd8e35da',
  teamId: 'jx77njsvxedqr101r25raqajmn8e3gdq',
  b2cUserId: 'n974thr5qmnhev34n7snn8yg9x8e2jcx',
};

async function devEpoch(): Promise<number> {
  const res = await fetch(`${DEV_SITE}/b2c/subscription-status?userId=${DEV_USER.b2cUserId}`);
  const body = (await res.json()) as { sessionEpoch?: number };
  if (typeof body.sessionEpoch !== 'number') throw new Error('dev did not return sessionEpoch');
  return body.sessionEpoch;
}

/** Bump on dev through the CLI — the mutation is internal by design. */
function bumpDevEpoch(): void {
  execFileSync(
    'npx',
    ['convex', 'run', 'b2cSessionEpoch:bumpSessionEpoch', JSON.stringify({ email: DEV_USER.email })],
    { cwd: WEB_DIR, stdio: 'pipe', env: { ...process.env, CLAUDECODE: '' } },
  );
}

async function injectSession(page: import('@playwright/test').Page, sessionEpoch: number) {
  await page.evaluate(
    ({ key, user, epoch }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          ...user,
          status: 'active',
          subscriptionStatus: 'active',
          onboardingCompleted: true,
          sessionEpoch: epoch,
        }),
      );
    },
    { key: STORAGE_KEY, user: DEV_USER, epoch: sessionEpoch },
  );
}

test.describe('Remote logout (session epoch) — dev integration', () => {
  test.skip(!RUN || !DEV_SITE, 'Set SESSION_EPOCH_DEV_TEST=1 and SESSION_EPOCH_DEV_SITE_URL');
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await page.route(`${PROD_SITE}/**`, (route) =>
      route.continue({ url: route.request().url().replace(PROD_SITE, DEV_SITE) }),
    );
    await resetToLogin(page);
  });

  test.afterEach(async ({ page }) => {
    await page.unroute(`${PROD_SITE}/**`);
  });

  test('a session behind the server epoch is signed out at launch, with the notice', async ({ page }) => {
    // Make sure the account has been bumped at least once so "behind" exists.
    if ((await devEpoch()) === 0) bumpDevEpoch();
    const current = await devEpoch();

    // In sync → stays signed in.
    await injectSession(page, current);
    await page.reload();
    await expect(page.locator(LOGIN_TEXT)).toHaveCount(0, { timeout: 20_000 });

    // Behind → signed out at launch, told why.
    await injectSession(page, current - 1);
    await page.reload();
    await expect(page.getByText(NOTICE)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(LOGIN_TEXT)).toBeVisible();
    const stored = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
    expect(stored).toBeNull();
  });

  test('a live session is signed out by the 60s poll after an admin bump', async ({ page }) => {
    const current = await devEpoch();
    await injectSession(page, current);
    await page.reload();
    await expect(page.locator(LOGIN_TEXT)).toHaveCount(0, { timeout: 20_000 });

    bumpDevEpoch();
    expect(await devEpoch()).toBe(current + 1);

    // The subscription poll runs every 60s (immediate: false); allow one full
    // cycle plus slack.
    await expect(page.getByText(NOTICE)).toBeVisible({ timeout: 90_000 });
    const stored = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
    expect(stored).toBeNull();
  });
});
