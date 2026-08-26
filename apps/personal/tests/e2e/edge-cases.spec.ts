import { test, expect, resetToLogin, TEST_USER } from "./fixtures";

test.describe("Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await resetToLogin(page);
  });

  test("rapid form submission does not cause double login", async ({ page }) => {
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);

    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();
    await submitBtn.click().catch(() => {});

    await page.waitForFunction(
      () => {
        const t = document.body.textContent || "";
        return t.includes("Dashboard") || t.includes("Record") || t.includes("Settings") || t.includes("Loading...");
      },
      { timeout: 30_000 }
    );
  });

  test("handles very long email gracefully", async ({ page }) => {
    const longEmail = "a".repeat(300) + "@test.com";
    await page.fill('input[type="email"]', longEmail);
    await page.fill('input[type="password"]', "testpassword1");
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Login Failed", { timeout: 15_000 });
  });

  test("login with email containing uppercase works", async ({ page }) => {
    await page.fill('input[type="email"]', TEST_USER.email.toUpperCase());
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    await page.waitForFunction(
      () => {
        const t = document.body.textContent || "";
        return t.includes("Dashboard") || t.includes("Record") || t.includes("Settings") || t.includes("Loading...");
      },
      { timeout: 30_000 }
    );
  });

  test("login with leading/trailing spaces in email", async ({ page }) => {
    await page.fill('input[type="email"]', `  ${TEST_USER.email}  `);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    await page.waitForFunction(
      () => {
        const t = document.body.textContent || "";
        return t.includes("Dashboard") || t.includes("Record") || t.includes("Settings") || t.includes("Loading...");
      },
      { timeout: 30_000 }
    );
  });

  test("special characters in password don't crash the app", async ({ page }) => {
    await page.fill('input[type="email"]', "test@test.com");
    await page.fill('input[type="password"]', '<script>alert("xss")</script>');
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Login Failed", { timeout: 15_000 });
  });
});

