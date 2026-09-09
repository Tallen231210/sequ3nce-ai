import { expect, test, resetToAuthenticated, dismissModals, reloadApp, TEST_USER } from './fixtures';

// Settings → Notifications → "Email me updates". The route is stubbed so the
// toggle's request body and reflected state can be asserted exactly.

const STORAGE_KEY = 'sequ3nce_personal_info';
const FAKE_TOKEN = 'a'.repeat(64);

/** The injected fixture session has no bearer token (pre-token shape), and
 *  the switch refuses to call without one — so give it a fake token the
 *  stubbed route never validates. */
async function authenticateWithToken(page: import('@playwright/test').Page) {
  await resetToAuthenticated(page);
  await page.evaluate(
    ({ key, token }) => {
      const raw = localStorage.getItem(key);
      const info = raw ? JSON.parse(raw) : {};
      localStorage.setItem(key, JSON.stringify({ ...info, sessionToken: token }));
    },
    { key: STORAGE_KEY, token: FAKE_TOKEN },
  );
  await reloadApp(page);
  await page.waitForFunction(() => (document.body.textContent || '').includes('Settings'), { timeout: 30_000 });
  await dismissModals(page);
}

test.describe('Email notifications toggle', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute('**/b2c/email-preferences*');
  });

  test('reads the current preference and posts the flipped value', async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = [];
    await page.route('**/b2c/email-preferences*', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      bodies.push(body);
      const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, enabled }) });
    });
    await authenticateWithToken(page);
    await page.locator('text=Settings').first().click();

    const row = page.getByTestId('email-prefs');
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText('Email me updates');
    await expect.poll(() => bodies.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(bodies[0]).toHaveProperty('sessionToken', FAKE_TOKEN);
    void TEST_USER;
    expect(bodies[0]).not.toHaveProperty('enabled');

    const toggle = page.getByTestId('email-prefs-toggle');
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect.poll(() => bodies.filter((b) => typeof b.enabled === 'boolean').length).toBe(1);
    expect(bodies.find((b) => typeof b.enabled === 'boolean')?.enabled).toBe(false);
    // Reflected state: the knob slides back to the "off" position (no translate class).
    await expect(toggle.locator('span')).not.toHaveClass(/translate-x-5/);
  });

  test('a pre-token session sees the relogin hint and a disabled switch', async ({ page }) => {
    await page.route('**/b2c/email-preferences*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ needsRelogin: true }) });
    });
    await resetToAuthenticated(page);
    await dismissModals(page);
    await page.locator('text=Settings').first().click();

    await expect(page.getByTestId('email-prefs')).toContainText('Log out and back in once', { timeout: 20_000 });
    await expect(page.getByTestId('email-prefs-toggle')).toBeDisabled();
  });
});
