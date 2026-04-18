import { test, expect, resetToLogin, reloadApp, TEST_USER } from "./fixtures";

const STORAGE_KEY = "sequ3nce_personal_info";

function makeCloserInfo(overrides: Record<string, unknown> = {}) {
  return {
    closerId: TEST_USER.closerId,
    teamId: TEST_USER.teamId,
    name: TEST_USER.name,
    email: TEST_USER.email,
    status: "active",
    subscriptionStatus: "none",
    b2cUserId: TEST_USER.b2cUserId,
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
  test("debug: check what app shows after clearing localStorage", async ({ page }) => {
    // Clear localStorage
    try {
      await page.evaluate(() => {
        localStorage.clear();
      });
    } catch {
      // ignore
    }
    await reloadApp(page);
    await page.waitForTimeout(3000);

    // Take screenshot to see what's on screen
    await page.screenshot({ path: "test-debug-after-clear.png" });

    // Dump the page content
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    console.log("Page content after clear:", bodyText.substring(0, 500));

    // Check what's visible
    const hasLogin = await page.locator('text="Sign in to your account"').isVisible().catch(() => false);
    const hasPaywall = await page.locator('text="Unlock Sequ3nce Personal"').isVisible().catch(() => false);
    const hasApp = await page.locator('text="Dashboard"').isVisible().catch(() => false);

    console.log("Has login:", hasLogin);
    console.log("Has paywall:", hasPaywall);
    console.log("Has app:", hasApp);

    // At minimum, one of these should be true
    expect(hasLogin || hasPaywall || hasApp).toBe(true);
  });

  test("paywall appears with subscriptionStatus none", async ({ page }) => {
    await injectSession(page, { subscriptionStatus: "none" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "test-paywall-none.png" });

    const hasPaywall = await page.locator('text="Unlock Sequ3nce Personal"').isVisible().catch(() => false);
    console.log("Has paywall:", hasPaywall);
    expect(hasPaywall).toBe(true);
  });

  test("Subscribe Now button calls checkout API", async ({ page }) => {
    await injectSession(page, { subscriptionStatus: "none" });
    await page.waitForSelector('text="Unlock Sequ3nce Personal"', { timeout: 15_000 });

    await page.click('text="Subscribe Now"');

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
    await injectSession(page, { subscriptionStatus: "active" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "test-active-subscription.png" });

    const hasPaywall = await page.locator('text="Unlock Sequ3nce Personal"').isVisible().catch(() => false);
    expect(hasPaywall).toBe(false);
  });

  test("cancelled state shows Resubscribe", async ({ page }) => {
    await injectSession(page, { subscriptionStatus: "cancelled" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "test-cancelled-state.png" });

    await expect(page.locator('text="Subscription Inactive"')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text="Resubscribe"')).toBeVisible();
  });

  test("past_due state shows Update Payment Method", async ({ page }) => {
    await injectSession(page, { subscriptionStatus: "past_due" });
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
      await page.fill('input[type="email"]', TEST_USER.email);
      await page.fill('input[type="password"]', TEST_USER.password);
      await page.click('button:has-text("Sign In")');

      // Should land on paywall since subscriptionStatus is "none"
      await page.waitForSelector('text="Unlock Sequ3nce Personal"', { timeout: 20_000 });
    }

    await page.screenshot({ path: "test-login-to-paywall.png" });
    await expect(page.locator('text="Unlock Sequ3nce Personal"')).toBeVisible();
  });
});
