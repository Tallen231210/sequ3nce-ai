import { test, expect, resetToLogin } from "./fixtures";

test.describe("Signup Flow", () => {
  test.beforeEach(async ({ page }) => {
    await resetToLogin(page);
    await page.click("text=Sign up");
    await page.waitForSelector('text="Create your account"', { timeout: 5_000 });
  });

  test("renders signup screen with all fields", async ({ page }) => {
    await expect(page.locator('img[alt="Sequ3nce Personal"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Full Name"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="tel"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Password (min. 8 characters)"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Confirm Password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText("Create Account");
    await expect(page.locator("text=Sign in")).toBeVisible();
  });

  test("submit button disabled when fields are empty", async ({ page }) => {
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
  });

  test("submit button enables when all fields are filled", async ({ page }) => {
    await page.fill('input[placeholder="Full Name"]', "Test User");
    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="tel"]', "+15551112222");
    await page.fill('input[placeholder="Password (min. 8 characters)"]', "TestPass123");
    await page.fill('input[placeholder="Confirm Password"]', "TestPass123");
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });

  test("shows error for password mismatch", async ({ page }) => {
    await page.fill('input[placeholder="Full Name"]', "Test User");
    await page.fill('input[type="email"]', "mismatch@example.com");
    await page.fill('input[type="tel"]', "+15551112222");
    await page.fill('input[placeholder="Password (min. 8 characters)"]', "TestPass123");
    await page.fill('input[placeholder="Confirm Password"]', "DifferentPass");
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Signup Failed", { timeout: 10_000 });
    await expect(page.locator("text=Passwords do not match")).toBeVisible();
  });

  test("shows error for short password", async ({ page }) => {
    await page.fill('input[placeholder="Full Name"]', "Test User");
    await page.fill('input[type="email"]', "short@example.com");
    await page.fill('input[type="tel"]', "+15551112222");
    await page.fill('input[placeholder="Password (min. 8 characters)"]', "short");
    await page.fill('input[placeholder="Confirm Password"]', "short");
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Signup Failed", { timeout: 10_000 });
    await expect(page.locator("text=Password must be at least 8 characters")).toBeVisible();
  });

  test("shows error for invalid email format", async ({ page }) => {
    // Use "bad@test" which passes HTML5 email validation but fails our EMAIL_REGEX
    // (requires a dot in domain: /^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    await page.fill('input[placeholder="Full Name"]', "Test User");
    await page.fill('input[type="email"]', "bad@test");
    await page.fill('input[type="tel"]', "+15551112222");
    await page.fill('input[placeholder="Password (min. 8 characters)"]', "TestPass123");
    await page.fill('input[placeholder="Confirm Password"]', "TestPass123");
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Signup Failed", { timeout: 10_000 });
    await expect(page.locator("text=valid email")).toBeVisible();
  });

  test("shows error for invalid phone format", async ({ page }) => {
    await page.fill('input[placeholder="Full Name"]', "Test User");
    await page.fill('input[type="email"]', "phone@example.com");
    await page.fill('input[type="tel"]', "abc");
    await page.fill('input[placeholder="Password (min. 8 characters)"]', "TestPass123");
    await page.fill('input[placeholder="Confirm Password"]', "TestPass123");
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Signup Failed", { timeout: 10_000 });
    await expect(page.locator("text=valid phone")).toBeVisible();
  });

  test("shows error for duplicate email", async ({ page }) => {
    await page.fill('input[placeholder="Full Name"]', "Duplicate User");
    await page.fill('input[type="email"]', "pw-test@sequ3nce.ai");
    await page.fill('input[type="tel"]', "+15559999999");
    await page.fill('input[placeholder="Password (min. 8 characters)"]', "TestPass123");
    await page.fill('input[placeholder="Confirm Password"]', "TestPass123");
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Signup Failed", { timeout: 15_000 });
    await expect(page.locator("text=already exists")).toBeVisible();
  });

  test("retry from signup error returns to signup screen", async ({ page }) => {
    // Use "bad@test" to trigger client-side email validation error
    await page.fill('input[placeholder="Full Name"]', "Test");
    await page.fill('input[type="email"]', "bad@test");
    await page.fill('input[type="tel"]', "+15551112222");
    await page.fill('input[placeholder="Password (min. 8 characters)"]', "TestPass123");
    await page.fill('input[placeholder="Confirm Password"]', "TestPass123");
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Signup Failed", { timeout: 10_000 });
    await page.click("text=Try again");

    await expect(page.locator('text="Create your account"')).toBeVisible();
  });

  test("can navigate back to login via link", async ({ page }) => {
    await page.click("text=Sign in");
    await expect(page.locator('text="Sign in to your account"')).toBeVisible();
  });
});
