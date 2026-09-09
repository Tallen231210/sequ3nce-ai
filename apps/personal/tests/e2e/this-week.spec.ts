import { expect, test, resetToAuthenticated, dismissModals } from './fixtures';

// The dashboard's "This week" card, fed by a stubbed /b2c/this-week so the
// four tiles can be asserted in every state regardless of prod data.

const NEXT_CALL = {
  callId: 'k17f00000000000000000000000000000',
  title: 'Objection Handling Live',
  scheduledStartTime: Date.now() + 26 * 60 * 60 * 1000,
  scheduledDurationMin: 45,
  status: 'scheduled',
  coachName: 'Ben Byrne',
};

function stub(body: unknown) {
  return async (page: import('@playwright/test').Page) => {
    await page.route('**/b2c/this-week*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
  };
}

test.describe('Dashboard "This week" card', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute('**/b2c/this-week*');
  });

  test('shows the next call, new roles, members online and the latest post', async ({ page }) => {
    await stub({
      nextCoachingCall: NEXT_CALL,
      rolesThisWeek: { count: 63, topIndustries: ['Coaching', 'SaaS', 'Agency'] },
      onlineCount: 4,
      latestPosts: [{ postId: 'p1', authorName: 'Iskandar S.', channelName: 'General', createdAt: Date.now(), snippet: 'Just tracked three roles — anyone closed for a SaaS offer?' }],
    })(page);
    await resetToAuthenticated(page);
    await dismissModals(page);

    const card = page.getByTestId('this-week-card');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('this-week-coaching')).toContainText('Objection Handling Live');
    await expect(page.getByTestId('this-week-coaching')).toContainText('Ben Byrne');
    await expect(page.getByTestId('this-week-roles')).toContainText('63');
    await expect(page.getByTestId('this-week-roles')).toContainText('Coaching, SaaS, Agency');
    await expect(page.getByTestId('this-week-online')).toContainText('4');
    await expect(page.getByTestId('this-week-post')).toContainText('Iskandar S.');
    await expect(page.getByTestId('this-week-post')).toContainText('General');
  });

  test('a live call reads "Happening now" with a Join call-to-action', async ({ page }) => {
    await stub({
      nextCoachingCall: { ...NEXT_CALL, status: 'live', scheduledStartTime: Date.now() - 5 * 60_000 },
      rolesThisWeek: { count: 0, topIndustries: [] },
      onlineCount: 0,
      latestPosts: [],
    })(page);
    await resetToAuthenticated(page);
    await dismissModals(page);

    const coaching = page.getByTestId('this-week-coaching');
    await expect(coaching).toBeVisible({ timeout: 30_000 });
    await expect(coaching).toContainText('Happening now');
    await expect(coaching).toContainText('Join');
  });

  test('empty states are honest and the roles tile opens the Job Board', async ({ page }) => {
    await stub({
      nextCoachingCall: null,
      rolesThisWeek: { count: 0, topIndustries: [] },
      onlineCount: 0,
      latestPosts: [],
    })(page);
    await resetToAuthenticated(page);
    await dismissModals(page);

    await expect(page.getByTestId('this-week-coaching')).toContainText('No call scheduled yet', { timeout: 30_000 });
    await expect(page.getByTestId('this-week-roles')).toContainText('Fresh roles land every Monday');
    await expect(page.getByTestId('this-week-online')).toContainText('Quiet right now');
    await expect(page.getByTestId('this-week-post')).toContainText('Nothing yet this week');

    await page.getByTestId('this-week-roles').click();
    await expect(page.getByTestId('freehire-job-board').or(page.getByTestId('legacy-job-board'))).toBeVisible({ timeout: 20_000 });
  });
});
