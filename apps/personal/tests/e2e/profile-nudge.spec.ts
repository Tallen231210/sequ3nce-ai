import { expect, test, resetToAuthenticated, dismissModals, TEST_USER } from './fixtures';

// The job-board profile nudge: appears after a member saves/tracks a role
// while their profile is under 60% complete; "Not now" hides it for a week.
// The profile is stubbed so completeness is deterministic; the job feed is
// the real one (the harness has catalogue access), so the test needs at
// least one job card to save.

const SNOOZE_KEY = `sequ3nce:profile-nudge:${TEST_USER.b2cUserId}`;

function profileStub(complete: boolean) {
  return {
    profileSlug: complete ? 'pw-test' : null,
    name: 'Playwright Tester',
    headline: complete ? 'Closer' : null,
    bio: complete ? 'Bio' : null,
    location: complete ? 'Austin, TX' : null,
    photoUrl: complete ? 'https://example.com/p.png' : null,
    photoStorageId: null,
    industries: complete ? ['Coaching'] : [],
    ticketRange: complete ? '$3k-$10k' : null,
    skills: complete ? ['Discovery'] : [],
    socialLinks: complete ? { linkedin: 'https://linkedin.com/in/x' } : null,
    isPublic: true,
    isAvailable: true,
    introVideoUrl: null,
    highlightReelUrl: null,
    whatsappNumber: null,
    autoStats: null,
    manualStats: null,
    statsSource: 'auto',
    isManuallyVerified: false,
    createdAt: null,
    updatedAt: null,
  };
}

async function openJobBoardAndSaveFirstRole(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Job Board' }).first().click();
  await expect(page.getByTestId('freehire-job-board')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('freehire-job-card').first().waitFor({ state: 'visible', timeout: 45_000 });
  // Any card's bookmark still reading "Save job" (the test account may have
  // saved earlier cards on previous runs): stage "saved" arms the nudge.
  const save = page.locator('button[title="Save job"]').first();
  await save.waitFor({ state: 'visible', timeout: 15_000 });
  await save.click();
}

test.describe('Job board profile nudge', () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate((key) => localStorage.removeItem(key), SNOOZE_KEY).catch(() => {});
  });
  test.afterEach(async ({ page }) => {
    await page.unroute('**/b2c/profile?*');
    await page.evaluate((key) => localStorage.removeItem(key), SNOOZE_KEY).catch(() => {});
  });

  test('appears after saving a role when the profile is incomplete, and snoozes for a week', async ({ page }) => {
    await page.route('**/b2c/profile?*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profileStub(false)) });
    });
    await resetToAuthenticated(page);
    await dismissModals(page);
    await page.getByRole('button', { name: 'Job Board' }).first().click();
    await expect(page.getByTestId('freehire-job-board')).toBeVisible({ timeout: 20_000 });
    // Not armed yet: no nudge before any action.
    await expect(page.getByTestId('profile-nudge')).toHaveCount(0);

    await openJobBoardAndSaveFirstRole(page);
    const nudge = page.getByTestId('profile-nudge');
    await expect(nudge).toBeVisible({ timeout: 15_000 });
    await expect(nudge).toContainText(/yours is \d+%/);

    await page.getByTestId('profile-nudge-dismiss').click();
    await expect(nudge).toHaveCount(0);
    const snoozed = await page.evaluate((key) => localStorage.getItem(key), SNOOZE_KEY);
    expect(snoozed).not.toBeNull();
  });

  test('"Finish it" opens the Profile tab', async ({ page }) => {
    await page.route('**/b2c/profile?*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profileStub(false)) });
    });
    await resetToAuthenticated(page);
    await dismissModals(page);
    await openJobBoardAndSaveFirstRole(page);
    await page.getByTestId('profile-nudge-finish').click();
    await expect(page.getByTestId('profile-how-to')).toBeVisible({ timeout: 20_000 });
  });

  test('never appears for a complete profile', async ({ page }) => {
    await page.route('**/b2c/profile?*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profileStub(true)) });
    });
    await resetToAuthenticated(page);
    await dismissModals(page);
    await openJobBoardAndSaveFirstRole(page);
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('profile-nudge')).toHaveCount(0);
  });
});
