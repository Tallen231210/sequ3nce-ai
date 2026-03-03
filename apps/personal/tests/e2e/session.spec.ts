import { test, expect, TEST_USER, resetToLogin, resetToAuthenticated, reloadApp } from "./fixtures";

test.describe("Session Management", () => {
  test("persists session across reload", async ({ page }) => {
    await resetToLogin(page);

    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // Wait for authenticated state
    await page.waitForFunction(
      () => {
        const t = document.body.textContent || "";
        return t.includes("Dashboard") || t.includes("Record") || t.includes("Settings");
      },
      { timeout: 30_000 }
    );

    // Reload app (simulates app restart)
    await reloadApp(page);

    // Should go directly to authenticated state (not login)
    await page.waitForFunction(
      () => {
        const t = document.body.textContent || "";
        return t.includes("Dashboard") || t.includes("Record") || t.includes("Settings") || t.includes("Loading...");
      },
      { timeout: 30_000 }
    );
  });

  test("shows login screen when no session exists", async ({ page }) => {
    await resetToLogin(page);
    await expect(page.locator('text="Sign in to your account"')).toBeVisible();
  });

  test("injected session loads authenticated view", async ({ page }) => {
    await resetToAuthenticated(page);

    await page.waitForFunction(
      () => {
        const t = document.body.textContent || "";
        return t.includes("Dashboard") || t.includes("Record") || t.includes("Settings") || t.includes("Loading...");
      },
      { timeout: 30_000 }
    );
  });

  test("handles corrupted localStorage gracefully", async ({ page }) => {
    // First ensure we're on the app page and can access localStorage
    await resetToLogin(page);

    // Set invalid JSON in localStorage
    await page.evaluate((key) => {
      localStorage.setItem(key, "this is not valid json{{{");
    }, "sequ3nce_personal_info");

    // Reload — app should handle the parse error and fall back to login
    await reloadApp(page);
    await page.waitForSelector('text="Sign in to your account"', { timeout: 20_000 });
  });
});
