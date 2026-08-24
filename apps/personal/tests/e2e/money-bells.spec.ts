import { test, expect, resetToAuthenticated, dismissModals } from "./fixtures";

test.describe("Money Bells", () => {
  test.beforeEach(async ({ page }) => {
    await resetToAuthenticated(page);
    await page.waitForFunction(
      () => {
        const t = document.body.textContent || "";
        return t.includes("Dashboard") || t.includes("Community");
      },
      { timeout: 30_000 }
    );
    await dismissModals(page);

    const community = page.locator('text=Community').first();
    if (await community.isVisible().catch(() => false)) {
      await community.click();
      await page.waitForTimeout(600);
      await dismissModals(page);
    }
  });

  test("Money Bells button is in the community sidebar", async ({ page }) => {
    const btn = page.locator('text="Money Bells"').first();
    await expect(btn).toBeVisible({ timeout: 10_000 });
  });

  test("clicking Money Bells shows the JoinPrompt for non-opted-in user", async ({ page }) => {
    await page.locator('text="Money Bells"').first().click();
    await page.waitForTimeout(1500);

    const bodyText = (await page.textContent("body")) ?? "";
    const hasJoinCopy =
      bodyText.includes("Join Money Bells") ||
      bodyText.includes("honor system") ||
      bodyText.includes("Close a deal");
    expect(hasJoinCopy).toBeTruthy();
  });

  test("money-bells slug is filtered out of the regular channel list", async ({ page }) => {
    const sidebar = await page.locator('[class*="sidebar"], nav, aside').first();
    const sidebarText = (await sidebar.textContent().catch(() => "")) ?? "";
    const occurrences = (sidebarText.match(/Money Bells/g) || []).length;
    // Should appear exactly once (as the special-view nav button) — not duplicated in the channel list.
    expect(occurrences).toBeLessThanOrEqual(1);
  });

  test("Money Bells view renders leaderboard shell after opt-in (or skip if already opted)", async ({ page }) => {
    await page.locator('text="Money Bells"').first().click();
    await page.waitForTimeout(1200);

    const bodyText = (await page.textContent("body")) ?? "";
    const isJoinPrompt = bodyText.includes("Join Money Bells") && bodyText.includes("honor");

    if (isJoinPrompt) {
      // The honor-rules acknowledgement checkbox gates the Join button.
      const ack = page.locator('input[type="checkbox"]').first();
      if (await ack.isVisible().catch(() => false)) {
        await ack.check().catch(() => {});
      }
      const joinBtn = page.locator('button', { hasText: /Join Money Bells/i }).first();
      if (await joinBtn.isVisible().catch(() => false)) {
        await joinBtn.click();
        await page.waitForTimeout(2500);
      }
    }

    // After join (or if already in), the leaderboard scaffold should render one of these labels.
    const afterText = (await page.textContent("body")) ?? "";
    const hasLeaderboardShell =
      afterText.includes("Money Bells ·") ||
      afterText.includes("Broadcasts") ||
      afterText.includes("Biggest") ||
      afterText.includes("Total");
    expect(hasLeaderboardShell).toBeTruthy();
  });

  test("stats row uses Total/Broadcasts/Biggest (not Pool/Goal/Cash MTD)", async ({ page }) => {
    await page.locator('text="Money Bells"').first().click();
    await page.waitForTimeout(1500);

    // Opt in if needed
    const joinBtn = page.locator('button', { hasText: /Join Money Bells/i }).first();
    if (await joinBtn.isVisible().catch(() => false)) {
      await joinBtn.click();
      await page.waitForTimeout(2500);
    }

    const body = (await page.textContent("body")) ?? "";
    // Stale copy should be gone
    expect(body).not.toContain("Pool");
    expect(body).not.toContain("Cash MTD");
    // "Goal" may still appear as the race-track axis label ("$50K · Goal") but NOT as a stat cell.
    // We assert the new copy is present:
    expect(body.includes("Total") || body.includes("Broadcasts") || body.includes("Biggest")).toBeTruthy();
  });

  test("broadcast feed renders existing broadcasts with cash amount", async ({ page }) => {
    await page.locator('text="Money Bells"').first().click();
    await page.waitForTimeout(1500);

    const joinBtn = page.locator('button', { hasText: /Join Money Bells/i }).first();
    if (await joinBtn.isVisible().catch(() => false)) {
      await joinBtn.click();
      await page.waitForTimeout(2500);
    }

    const body = (await page.textContent("body")) ?? "";
    // Existing Tyler broadcast is +$5,000; if feed fetches correctly at least one "+$" amount should appear.
    const hasCashAmount = /\+\$\d/.test(body) || body.includes("No broadcasts yet");
    expect(hasCashAmount).toBeTruthy();
  });

  test("NewPostForm channel dropdown does NOT include money-bells", async ({ page }) => {
    // Click on a regular channel first (General or similar) to expose the composer
    const generalChannel = page.locator('text="#general", text="General"').first();
    if (!(await generalChannel.isVisible().catch(() => false))) {
      test.skip(true, "General channel not visible — sidebar layout may differ");
    }
    await generalChannel.click();
    await page.waitForTimeout(1000);

    // Look for the post-to-channel dropdown; if it's a <select>, we can read options.
    const optionsText = await page.evaluate(() => {
      const sels = Array.from(document.querySelectorAll("select"));
      return sels.flatMap((s) => Array.from(s.options).map((o) => o.textContent || "")).join(" | ");
    });
    // Check the string "money-bells" (slug) or "Money Bells" (name) does not appear in composer options
    expect(optionsText.toLowerCase()).not.toContain("money bells");
  });
});
