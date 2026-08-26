import { test, expect, resetToLogin, reloadApp, TEST_USER } from "./fixtures";

const STORAGE_KEY = "sequ3nce_personal_info";

// Dedicated never-subscribed prod account (isTestAccount: true). The app
// re-hydrates the real subscription status from the server on session
// restore, so gate tests need an account that is genuinely "none" server-side
// — TEST_USER is "active" and would be corrected straight to the hub.
export const NOSUB_USER = {
  email: "pw-nosub@sequ3nce.ai",
  password: "PlaywrightTest2024",
  name: "Playwright NoSub",
  closerId: "jd735czxz4a04fve7p9ytss2es8d2q6f",
  teamId: "js7bjg9kf44vj9m83eqyagx32d8d3gsf",
  b2cUserId: "nh7bnejaayt05pw58mqfjfnkan8d3y5p",
};

function makeCloserInfo(overrides: Record<string, unknown> = {}) {
  return {
    closerId: NOSUB_USER.closerId,
    teamId: NOSUB_USER.teamId,
    name: NOSUB_USER.name,
    email: NOSUB_USER.email,
    status: "active",
    onboardingCompleted: true,
    subscriptionStatus: "none",
    b2cUserId: NOSUB_USER.b2cUserId,
    ...overrides,
  };
}

async function injectSession(page: import("@playwright/test").Page, overrides: Record<string, unknown> = {}) {
  const info = makeCloserInfo(overrides);
  try {
    await page.evaluate(
      ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
      { key: STORAGE_KEY, data: info }
    );
  } catch {
    await reloadApp(page);
    await page.evaluate(
      ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
      { key: STORAGE_KEY, data: info }
    );
  }
  await reloadApp(page);
}

test.describe("Subscription Gate", () => {

  test("paywall appears with subscriptionStatus none", async ({ page }) => {
    await injectSession(page, { subscriptionStatus: "none" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "test-paywall-none.png" });

    const hasPaywall = await page.locator('text="Unlock Sequ3nce Personal"').isVisible().catch(() => false);
    console.log("Has paywall:", hasPaywall);
    expect(hasPaywall).toBe(true);
  });

  test("Choose a plan opens the web checkout and starts polling", async ({ page }) => {
    await injectSession(page, { subscriptionStatus: "none" });
    await page.waitForSelector('text="Unlock Sequ3nce Personal"', { timeout: 15_000 });

    await page.evaluate(() => {
      window.open = (() => null) as typeof window.open; // swallow the external tab
    });
    await page.click('text="Choose a plan on the web"');

    // Should show some state change
    const result = await Promise.race([
      page.waitForSelector('text="Waiting for payment..."', { timeout: 15_000 }).then(() => "polling"),
      page.waitForSelector('text="Opening checkout..."', { timeout: 15_000 }).then(() => "loading"),
      page.waitForSelector('text="Checking payment status..."', { timeout: 15_000 }).then(() => "polling-indicator"),
    ]).catch(() => "timeout");

    console.log("After Subscribe click:", result);
    await page.screenshot({ path: "test-after-subscribe-click.png" });
    expect(["polling", "loading", "polling-indicator"]).toContain(result);
  });

  test("app unlocks with active subscription", async ({ page }) => {
    await injectSession(page, {
      subscriptionStatus: "active",
      closerId: TEST_USER.closerId,
      teamId: TEST_USER.teamId,
      name: TEST_USER.name,
      email: TEST_USER.email,
      b2cUserId: TEST_USER.b2cUserId,
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "test-active-subscription.png" });

    const hasPaywall = await page.locator('text="Unlock Sequ3nce Personal"').isVisible().catch(() => false);
    expect(hasPaywall).toBe(false);
  });

  const GHOST = {
    // Old (purged) pw-test ids: valid Convex id shape, guaranteed unresolvable,
    // so server-side status hydration fails and the injected status sticks.
    b2cUserId: "nh78j2406z31vddy744rdyvza1825710",
    closerId: "jd7b1tv33ta2b6k9s9101tbv2d825bg7",
    teamId: "js74ha9rj7ayar9p2rrh32w2jd824pdr",
    email: "ghost@test.sequ3nce.ai",
  };

  test("cancelled state shows Resubscribe", async ({ page }) => {
    await injectSession(page, { subscriptionStatus: "cancelled", ...GHOST });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "test-cancelled-state.png" });

    await expect(page.locator('text="Subscription Inactive"')).toBeVisible({ timeout: 10_000 });
    // Polar gate: cancelled users re-subscribe through the web checkout
    await expect(page.locator('text="Resubscribe on the web"')).toBeVisible();
  });

  test("past_due state shows Update Payment Method", async ({ page }) => {
    await injectSession(page, { subscriptionStatus: "past_due", ...GHOST });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "test-past-due-state.png" });

    await expect(page.locator('text="Payment Issue"')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text="Update Payment Method"')).toBeVisible();
  });

  test("Log out from paywall returns to login", async ({ page }) => {
    await injectSession(page, { subscriptionStatus: "none" });
    await page.waitForSelector('text="Unlock Sequ3nce Personal"', { timeout: 15_000 });

    await page.click('text="Log out"');

    await page.waitForSelector('text="Sign in to your account"', { timeout: 15_000 });
  });

  test("login flow shows paywall for unsubscribed user", async ({ page }) => {
    // Clear session to show login
    try {
      await page.evaluate(() => localStorage.clear());
    } catch {
      // ignore
    }
    await reloadApp(page);

    // Wait for either login or paywall
    const firstScreen = await Promise.race([
      page.waitForSelector('text="Sign in to your account"', { timeout: 20_000 }).then(() => "login"),
      page.waitForSelector('text="Unlock Sequ3nce Personal"', { timeout: 20_000 }).then(() => "paywall"),
    ]).catch(() => "neither");

    console.log("First screen after clear:", firstScreen);

    if (firstScreen === "login") {
      // Do the login
      await page.fill('input[type="email"]', NOSUB_USER.email);
      await page.fill('input[type="password"]', NOSUB_USER.password);
      await page.click('button:has-text("Sign In")');

      // Should land on paywall since subscriptionStatus is "none"
      await page.waitForSelector('text="Unlock Sequ3nce Personal"', { timeout: 20_000 });
    }

    await page.screenshot({ path: "test-login-to-paywall.png" });
    await expect(page.locator('text="Unlock Sequ3nce Personal"')).toBeVisible();
  });
});
