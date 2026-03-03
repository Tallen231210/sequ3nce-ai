import { test, expect, resetToLogin } from "./fixtures";

test.describe("Auth Screen Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await resetToLogin(page);
  });

  test("toggles between login and signup screens", async ({ page }) => {
    await expect(page.locator('text="Sign in to your account"')).toBeVisible();

    await page.click("text=Sign up");
    await expect(page.locator('text="Create your account"')).toBeVisible();
    await expect(page.locator('text="Sign in to your account"')).not.toBeVisible();

    await page.click("text=Sign in");
    await expect(page.locator('text="Sign in to your account"')).toBeVisible();
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

  test("error screen shows correct heading for signup errors", async ({ page }) => {
    await page.click("text=Sign up");
    await page.fill('input[placeholder="Full Name"]', "Test");
    await page.fill('input[type="email"]', "bad@test.com");
    await page.fill('input[type="tel"]', "+15551234567");
    await page.fill('input[placeholder="Password (min. 8 characters)"]', "pass1");
    await page.fill('input[placeholder="Confirm Password"]', "pass2");
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Signup Failed", { timeout: 10_000 });
    await expect(page.locator("text=Signup Failed")).toBeVisible();
    await expect(page.locator("text=Login Failed")).not.toBeVisible();
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
