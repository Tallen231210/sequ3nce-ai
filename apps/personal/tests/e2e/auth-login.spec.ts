import { test, expect, TEST_USER, resetToLogin } from "./fixtures";

test.describe("Login Flow", () => {
  test.beforeEach(async ({ page }) => {
    await resetToLogin(page);
  });

  test("renders login screen with correct elements", async ({ page }) => {
    await expect(page.locator('img[alt="Sequ3nce Personal"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText("Sign In");
    await expect(page.locator("text=Sign up")).toBeVisible();
  });

  test("submit button is disabled when fields are empty", async ({ page }) => {
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
  });

  test("submit button is disabled with only email filled", async ({ page }) => {
    await page.fill('input[type="email"]', TEST_USER.email);
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
  });

  test("submit button is disabled with only password filled", async ({ page }) => {
    await page.fill('input[type="password"]', TEST_USER.password);
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
  });

  test("submit button enables when both fields are filled", async ({ page }) => {
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });

  test("successful login with valid credentials", async ({ page }) => {
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    await expect(page.locator("text=Signing in...")).toBeVisible();

    await page.waitForFunction(
      () => {
        const t = document.body.textContent || "";
        return t.includes("Dashboard") || t.includes("Record") || t.includes("Settings") || t.includes("Loading...");
      },
      { timeout: 30_000 }
    );
  });

  test("shows error for invalid email", async ({ page }) => {
    await page.fill('input[type="email"]', "nonexistent@test.com");
    await page.fill('input[type="password"]', "wrongpassword1");
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Login Failed", { timeout: 15_000 });
    await expect(page.locator("text=Invalid email or password")).toBeVisible();
  });

  test("shows error for wrong password", async ({ page }) => {
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', "wrongpassword1");
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Login Failed", { timeout: 15_000 });
    await expect(page.locator("text=Invalid email or password")).toBeVisible();
  });

  test("retry from error screen returns to login", async ({ page }) => {
    await page.fill('input[type="email"]', "bad@test.com");
    await page.fill('input[type="password"]', "wrongpass1");
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Login Failed", { timeout: 15_000 });
    await page.click("text=Try again");

    await expect(page.locator('text="Sign in to your account"')).toBeVisible();
  });

  test("can navigate to signup via link", async ({ page }) => {
    await page.click("text=Sign up");
    await expect(page.locator('text="Create your account"')).toBeVisible();
  });
});
