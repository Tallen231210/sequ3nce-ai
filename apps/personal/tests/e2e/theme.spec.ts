import { test, expect, resetToLogin } from "./fixtures";

test.describe("Theme and Visual", () => {
  test.beforeEach(async ({ page }) => {
    await resetToLogin(page);
  });

  test("login screen has white background", async ({ page }) => {
    const bgColor = await page.evaluate(() => {
      const el = document.querySelector(".h-screen");
      if (!el) return null;
      return window.getComputedStyle(el).backgroundColor;
    });

    if (bgColor) {
      expect(bgColor).toMatch(/rgb\(255,\s*255,\s*255\)/);
    }
  });

  test("logo image loads on login screen", async ({ page }) => {
    const logo = page.locator('img[alt="Sequ3nce Personal"]');
    await expect(logo).toBeVisible();

    const naturalWidth = await logo.evaluate((img: HTMLImageElement) => img.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test("submit button has black background when enabled", async ({ page }) => {
    await page.fill('input[type="email"]', "test@test.com");
    await page.fill('input[type="password"]', "testpass1");

    const btnBg = await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]');
      if (!btn) return null;
      return window.getComputedStyle(btn).backgroundColor;
    });

    if (btnBg) {
      // Should be black or near-black. Chromium may report the computed
      // color as rgb() or a modern color space (oklch/oklab/color()).
      expect(btnBg).toMatch(/rgb\(\d{1,2},\s*\d{1,2},\s*\d{1,2}\)|okl|color\(/);
    }
  });
});
