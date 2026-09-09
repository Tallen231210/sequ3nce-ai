import {
  test,
  expect,
  resetToAuthenticated,
  reloadApp,
} from './fixtures';

async function openJobBoard(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Job Board' }).first().click();
}

test.describe('FreeHire board flag integration', () => {
  test.beforeEach(async ({ page }) => {
    await resetToAuthenticated(page);
  });

  test('keeps the new board mounted when the flag request fails', async ({ page }) => {
    let flagRequests = 0;
    await page.route('**/b2c/feature-flags', async (route) => {
      flagRequests += 1;
      await route.abort('failed');
    });

    await reloadApp(page);
    await openJobBoard(page);

    await expect(page.getByTestId('freehire-job-board')).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => flagRequests).toBeGreaterThan(0);
    await page.waitForTimeout(3_000);
    await expect(page.getByTestId('freehire-job-board')).toBeVisible();
    await expect(page.getByTestId('legacy-job-board')).toHaveCount(0);
  });

  test('still honors an explicit server-side off decision', async ({ page }) => {
    let flagRequests = 0;
    await page.route('**/b2c/feature-flags', async (route) => {
      flagRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ flags: { freehire_job_board: false } }),
      });
    });

    await reloadApp(page);
    await openJobBoard(page);

    await expect.poll(() => flagRequests).toBeGreaterThan(0);
    await expect(page.getByTestId('legacy-job-board')).toBeVisible();
    await expect(page.getByTestId('freehire-job-board')).toHaveCount(0);
  });
});
