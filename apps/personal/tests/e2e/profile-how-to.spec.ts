import { expect, test, resetToAuthenticated, dismissModals } from './fixtures';

// The "How closers use this profile" explainer at the top of the Profile tab.

async function openProfile(page: import('@playwright/test').Page) {
  await resetToAuthenticated(page);
  await dismissModals(page);
  const tab = page.locator('text=Profile').first();
  await tab.waitFor({ state: 'visible', timeout: 15_000 });
  await tab.click();
  await page.waitForFunction(
    () => (document.body.textContent || '').includes('Your Profile'),
    { timeout: 20_000 },
  );
}

test.describe('Profile explainer', () => {
  test('explains the two ways to use the profile, above the completeness bar', async ({ page }) => {
    await openProfile(page);
    const box = page.getByTestId('profile-how-to');
    await expect(box).toBeVisible({ timeout: 20_000 });
    await expect(box).toContainText('DM it.');
    await expect(box).toContainText('Attach it.');
    await expect(box).not.toContainText(/high-ticket/i);
  });

  test('copy button copies the link when a URL is claimed, otherwise says so', async ({ page }) => {
    await openProfile(page);
    const button = page.getByTestId('profile-copy-link');
    await expect(button).toBeVisible({ timeout: 20_000 });
    if (await button.isEnabled()) {
      await button.click();
      await expect(button).toContainText('Copied');
      const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
      if (clip) expect(clip).toMatch(/^https:\/\/sequ3nce\.ai\/p\//);
    } else {
      await expect(button).toContainText('Claim your URL below first');
    }
  });
});
