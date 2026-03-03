import { test, expect, TEST_USER, resetToAuthenticated, dismissModals } from "./fixtures";

test.describe("App UI After Authentication", () => {
  test.beforeEach(async ({ page }) => {
    await resetToAuthenticated(page);
    await page.waitForFunction(
      () => {
        const t = document.body.textContent || "";
        return t.includes("Dashboard") || t.includes("Record") || t.includes("Settings") || t.includes("Loading...");
      },
      { timeout: 30_000 }
    );
    // Dismiss any modal overlays (subscription prompts, welcome dialogs, etc.)
    await dismissModals(page);
  });

  test("app does not crash after authentication", async ({ page }) => {
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(0);
  });

  test("localStorage contains session data", async ({ page }) => {
    const stored = await page.evaluate(() =>
      localStorage.getItem("sequ3nce_personal_info")
    );
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.closerId).toBe(TEST_USER.closerId);
    expect(parsed.teamId).toBe(TEST_USER.teamId);
    expect(parsed.email).toBe(TEST_USER.email);
    expect(parsed.name).toBe(TEST_USER.name);
  });
});
