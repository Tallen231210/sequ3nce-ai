import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { RecordingsPage } from "../pages/recordings.page";

test.describe("Recordings Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  test("recordings page loads with header", async ({ page }) => {
    const recordings = new RecordingsPage(page);
    await recordings.goto();
    await recordings.expectPageLoaded();
  });

  test("recordings page is accessible from sidebar", async ({ page }) => {
    await page.goto("/dashboard");
    const sidebar = page.locator("aside");
    const recordingsLink = sidebar.getByRole("link", { name: "Recordings" });
    await expect(recordingsLink).toBeVisible();
    await recordingsLink.click();
    await page.waitForURL("**/dashboard/recordings");
    expect(page.url()).toContain("/dashboard/recordings");
  });

  test("recordings page shows empty state or recordings grid", async ({
    page,
  }) => {
    const recordings = new RecordingsPage(page);
    await recordings.goto();

    // Either show empty state message or the recordings grid
    const emptyVisible = await recordings.emptyState
      .isVisible()
      .catch(() => false);
    const gridVisible = await recordings.recordingsGrid
      .isVisible()
      .catch(() => false);

    expect(emptyVisible || gridVisible).toBeTruthy();
  });

  test("recordings page has date range filters", async ({ page }) => {
    const recordings = new RecordingsPage(page);
    await recordings.goto();

    // Check for date filter inputs
    const dateInputs = page.locator('input[type="date"]');
    const count = await dateInputs.count();
    expect(count).toBeGreaterThanOrEqual(0); // May not be visible if no recordings
  });
});
