import { test, expect, resetToAuthenticated, dismissModals } from "./fixtures";

test.describe("Sidebar Navigation (MeetingBotHub)", () => {
  test.beforeEach(async ({ page }) => {
    await resetToAuthenticated(page);
    await page.waitForFunction(
      () => {
        const t = document.body.textContent || "";
        return t.includes("Dashboard") || t.includes("Record") || t.includes("Settings");
      },
      { timeout: 30_000 }
    );
    // Dismiss any modal overlays that might intercept pointer events
    await dismissModals(page);
  });

  test("B2B-only tabs should NOT be visible", async ({ page }) => {
    const removedTabs = ["Messages", "Role Play", "Reinforcement"];
    for (const tab of removedTabs) {
      const isVisible = await page.locator(`text=${tab}`).first().isVisible().catch(() => false);
      expect(isVisible).toBeFalsy();
    }
  });

  test("clicking sidebar tabs does not crash", async ({ page }) => {
    const tabs = ["Dashboard", "Stats", "Calls", "Schedule", "Resources", "Settings"];
    for (const tab of tabs) {
      const tabEl = page.locator(`text=${tab}`).first();
      if (await tabEl.isVisible().catch(() => false)) {
        // Dismiss any modal that appeared from the previous tab
        await dismissModals(page);
        await tabEl.click({ timeout: 10_000 });
        await page.waitForTimeout(500);
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      }
    }
  });
});
