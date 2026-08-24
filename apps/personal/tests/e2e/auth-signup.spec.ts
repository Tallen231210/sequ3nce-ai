import { test, expect, resetToLogin } from "./fixtures";

// Post-Polar reality: accounts are created BY PAYMENT on the web. The app has
// no in-app signup form any more — the login screen offers "Get access",
// which opens the web checkout in the system browser. These tests pin that
// contract so a future change that quietly resurrects in-app signup (and its
// unpaid-account problem) fails loudly.
test.describe("Signup Entry (pay-on-web)", () => {
  test.beforeEach(async ({ page }) => {
    await resetToLogin(page);
  });

  test("login screen offers Get access instead of a signup form", async ({ page }) => {
    await expect(page.locator("text=Get access")).toBeVisible();
    await expect(page.locator('text="Create your account"')).not.toBeVisible();
    await expect(page.locator('input[placeholder="Full Name"]')).toHaveCount(0);
  });

  test("Get access opens the web checkout", async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __opened: string | null }).__opened = null;
      window.open = ((url: string) => {
        (window as unknown as { __opened: string | null }).__opened = String(url);
        return null;
      }) as typeof window.open;
    });
    await page.click("text=Get access");
    const opened = await page.evaluate(
      () => (window as unknown as { __opened: string | null }).__opened,
    );
    expect(opened).toContain("sequ3nce.ai/personal/checkout");
  });
});
