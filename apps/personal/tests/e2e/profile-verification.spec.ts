import { test, expect, resetToAuthenticated, dismissModals, TEST_USER } from "./fixtures";

const CONVEX_SITE_URL = "https://ideal-ram-982.convex.site";
const ADMIN_SECRET = "236f2998b81c8722de84efb316c286619cce8f746cf375b8d0fad3cbfa8337e1";

/** Navigate to Profile tab, wait for load, and scroll to Stats section */
async function navigateToProfileStats(page: import("@playwright/test").Page) {
  const profileTab = page.locator("text=Profile").first();
  await profileTab.waitFor({ state: "visible", timeout: 10_000 });
  await profileTab.click();
  await page.waitForSelector("text=Your Profile", { timeout: 15_000 });
  // Wait for profile data to load from API
  await page.waitForTimeout(2_000);
  // Scroll to Performance Stats section
  const statsHeading = page.locator("text=Performance Stats").first();
  await statsHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
}

/** Reset test user's profile stats via API */
async function resetProfileStats(statsSource: string, manualStats?: Record<string, number>) {
  const body: Record<string, unknown> = {
    userId: TEST_USER.b2cUserId,
    statsSource,
  };
  if (manualStats) body.manualStats = manualStats;

  await fetch(`${CONVEX_SITE_URL}/b2c/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Set admin verification status via API */
async function setAdminVerification(verified: boolean) {
  await fetch(`${CONVEX_SITE_URL}/b2c/admin/verify-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      adminKey: ADMIN_SECRET,
      userId: TEST_USER.b2cUserId,
      isVerified: verified,
    }),
  });
}

test.describe("Profile Verification System", () => {
  test.beforeAll(async () => {
    // Start clean. The test account is re-provisioned from time to time, so
    // claim the public slug the assertions fetch by — idempotent for the
    // owner, and freed whenever the account is purged.
    await fetch(`${CONVEX_SITE_URL}/b2c/profile/slug`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: TEST_USER.b2cUserId, slug: "playwright-tester" }),
    });
    // getPublicProfile only serves profiles with isPublic true; the upsert
    // never unsets fields it isn't given, so this survives the per-test
    // statsSource resets.
    await fetch(`${CONVEX_SITE_URL}/b2c/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: TEST_USER.b2cUserId, isPublic: true }),
    });
    await resetProfileStats("auto");
    await setAdminVerification(false);
  });

  test.beforeEach(async ({ page }) => {
    await resetToAuthenticated(page);
    try {
      await page.waitForFunction(
        () => {
          const t = document.body.textContent || "";
          return t.includes("Dashboard") || t.includes("Record") || t.includes("Settings") || t.includes("Profile");
        },
        { timeout: 20_000 }
      );
    } catch {
      // Retry once — Electron can be slow to reload
      await resetToAuthenticated(page);
      await page.waitForFunction(
        () => {
          const t = document.body.textContent || "";
          return t.includes("Dashboard") || t.includes("Record") || t.includes("Settings") || t.includes("Profile");
        },
        { timeout: 30_000 }
      );
    }
    await dismissModals(page);
  });

  test.afterAll(async () => {
    await resetProfileStats("auto");
    await setAdminVerification(false);
  });

  // ==================== Stats Section Visibility ====================

  test("Performance Stats section with toggle is visible", async ({ page }) => {
    await navigateToProfileStats(page);

    // Toggle buttons should be visible
    const fromCallsBtn = page.locator("button:has-text('From Calls')").first();
    const manualBtn = page.locator("button:has-text('Manual')").first();

    await expect(fromCallsBtn).toBeVisible({ timeout: 5_000 });
    await expect(manualBtn).toBeVisible({ timeout: 5_000 });
  });

  // ==================== Manual Mode Toggle ====================

  test("clicking Manual toggle shows stat input fields and badges", async ({ page }) => {
    await navigateToProfileStats(page);

    // Click "Manual" toggle
    const manualBtn = page.locator("button:has-text('Manual')").first();
    await manualBtn.click();
    await page.waitForTimeout(500);

    // Should show input fields for stats
    const inputs = page.locator('input[type="number"]');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    // Should show "Self-Reported" badge
    const selfReportedBadge = page.locator("text=Self-Reported").first();
    await expect(selfReportedBadge).toBeVisible({ timeout: 5_000 });

    // Should show the verification CTA (renamed from "Get Verified")
    const getVerifiedBtn = page.locator("text=Submit for verification").first();
    await getVerifiedBtn.scrollIntoViewIfNeeded();
    await expect(getVerifiedBtn).toBeVisible({ timeout: 5_000 });
  });

  // ==================== Save Manual Stats ====================

  test("saving manual stats persists to backend and shows on public profile", async ({ page }) => {
    await navigateToProfileStats(page);

    // Switch to manual mode
    const manualBtn = page.locator("button:has-text('Manual')").first();
    await manualBtn.click();
    await page.waitForTimeout(500);

    // Fill in stats
    const inputs = page.locator('input[type="number"]');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    // Fill the first input (Cash Collected)
    await inputs.nth(0).fill("750000");

    // Scroll down to Save button and click
    const saveBtn = page.locator("button:has-text('Save Profile')").first();
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();
    await expect(page.locator("text=Profile saved!").first()).toBeVisible({ timeout: 10_000 });

    // Verify via API
    const response = await fetch(
      `${CONVEX_SITE_URL}/b2c/public-profile?slug=playwright-tester`
    );
    const data = await response.json();
    expect(data.statsSource).toBe("manual");
    expect(data.isVerified).toBe(false);
    expect(data.stats).not.toBeNull();
  });

  // ==================== Admin Verification ====================

  test("admin verification changes badge from Self-Reported to Verified", async ({ page }) => {
    // Set manual stats via API
    await resetProfileStats("manual", {
      callsCompleted: 500,
      closeRate: 32,
      cashCollected: 1250000,
    });

    await navigateToProfileStats(page);

    // Should show Self-Reported initially
    const selfReported = page.locator("text=Self-Reported").first();
    await expect(selfReported).toBeVisible({ timeout: 5_000 });

    // Admin verify via API
    await setAdminVerification(true);

    // Navigate away and back to reload profile
    const dashTab = page.locator("text=Dashboard").first();
    await dashTab.scrollIntoViewIfNeeded();
    await dashTab.click();
    await page.waitForTimeout(1_500);

    await navigateToProfileStats(page);

    // Should now show Verified badge
    const verified = page.locator("text=Verified by Sequ3nce").first();
    await expect(verified).toBeVisible({ timeout: 5_000 });
  });

  // ==================== Verification Clearing ====================

  test("editing stats after verification clears verified status", async ({ page }) => {
    // Set verified manual stats
    await resetProfileStats("manual", {
      callsCompleted: 500,
      closeRate: 32,
      cashCollected: 1250000,
    });
    await setAdminVerification(true);

    await navigateToProfileStats(page);

    // Verify it shows as verified
    const verified = page.locator("text=Verified by Sequ3nce").first();
    await expect(verified).toBeVisible({ timeout: 5_000 });

    // Edit a stat
    const inputs = page.locator('input[type="number"]');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
    await inputs.nth(0).fill("1500000");

    // Save
    const saveBtn = page.locator("button:has-text('Save Profile')").first();
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();
    await expect(page.locator("text=Profile saved!").first()).toBeVisible({ timeout: 10_000 });

    // Verify via API that verification was cleared
    const response = await fetch(
      `${CONVEX_SITE_URL}/b2c/public-profile?slug=playwright-tester`
    );
    const data = await response.json();
    expect(data.isVerified).toBe(false);
  });

  // ==================== Mode Switching ====================

  test("switching from Manual back to From Calls hides inputs", async ({ page }) => {
    await navigateToProfileStats(page);

    // Switch to manual
    const manualBtn = page.locator("button:has-text('Manual')").first();
    await manualBtn.click();
    await page.waitForTimeout(500);

    // Verify number inputs exist
    let inputs = page.locator('input[type="number"]');
    let count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    // Switch back to From Calls
    const fromCallsBtn = page.locator("button:has-text('From Calls')").first();
    await fromCallsBtn.click();
    await page.waitForTimeout(500);

    // Number inputs should be gone
    inputs = page.locator('input[type="number"]');
    count = await inputs.count();
    expect(count).toBe(0);
  });
});
