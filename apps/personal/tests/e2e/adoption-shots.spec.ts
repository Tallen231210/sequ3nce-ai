import path from 'path';
import { expect, test, resetToAuthenticated, dismissModals } from './fixtures';

// Screenshots of the four adoption-batch surfaces for design review.
// Opt-in: ADOPTION_SHOTS_DIR=<dir> npx playwright test tests/e2e/adoption-shots.spec.ts

const DIR = process.env.ADOPTION_SHOTS_DIR;

test.describe('Adoption batch — screenshots', () => {
  test.skip(!DIR, 'Set ADOPTION_SHOTS_DIR');

  test('dashboard, profile, settings, job board', async ({ page }) => {
    await page.route('**/b2c/this-week*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          nextCoachingCall: {
            callId: 'k17f00000000000000000000000000000',
            title: 'Objection Handling Live',
            scheduledStartTime: Date.now() + 26 * 60 * 60 * 1000,
            scheduledDurationMin: 45,
            status: 'scheduled',
            coachName: 'Ben Byrne',
          },
          rolesThisWeek: { count: 63, topIndustries: ['Coaching', 'SaaS', 'Agency'] },
          onlineCount: 4,
          latestPosts: [{ postId: 'p1', authorName: 'Iskandar S.', channelName: 'General', createdAt: Date.now(), snippet: 'Just tracked three roles — anyone closed for a SaaS offer?' }],
        }),
      });
    });
    await page.route('**/b2c/email-preferences*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, enabled: true }) });
    });
    await resetToAuthenticated(page);
    await dismissModals(page);
    await expect(page.getByTestId('this-week-card')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(DIR!, 'dashboard.png') });

    await page.locator('text=Profile').first().click();
    await expect(page.getByTestId('profile-how-to')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(DIR!, 'profile.png') });

    await page.locator('text=Settings').first().click();
    await expect(page.getByTestId('email-prefs')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('email-prefs').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(DIR!, 'settings.png') });

    await page.unroute('**/b2c/this-week*');
    await page.unroute('**/b2c/email-preferences*');
  });
});
