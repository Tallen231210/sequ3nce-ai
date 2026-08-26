import { test, expect, resetToLogin } from "./fixtures";

test.describe("Auth Screen Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await resetToLogin(page);
  });

  test("no in-app signup screen — Get access is the only path", async ({ page }) => {
    await expect(page.locator('text="Sign in to your account"')).toBeVisible();
    await expect(page.locator("text=Get access")).toBeVisible();
    await expect(page.locator('text="Create your account"')).not.toBeVisible();
  });

  test("error screen shows correct heading for login errors", async ({ page }) => {
    await page.fill('input[type="email"]', "bad@test.com");
    await page.fill('input[type="password"]', "wrongpass1");
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Login Failed", { timeout: 15_000 });
    await expect(page.locator("text=Login Failed")).toBeVisible();
    await expect(page.locator("text=Signup Failed")).not.toBeVisible();
  });

  test("error screen Try Again returns to correct screen", async ({ page }) => {
    await page.fill('input[type="email"]', "bad@test.com");
    await page.fill('input[type="password"]', "wrongpass1");
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Login Failed", { timeout: 15_000 });
    await page.click("text=Try again");
    await expect(page.locator('text="Sign in to your account"')).toBeVisible();
  });
});
