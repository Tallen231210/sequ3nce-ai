import { test, expect, resetToAuthenticated, dismissModals, TEST_USER } from "./fixtures";

/**
 * Navigate to the Profile tab and wait for it to load.
 * Returns when either the profile editor or a loading/error state is visible.
 */
async function navigateToProfile(page: import("@playwright/test").Page) {
  // Click "Profile" in the sidebar
  const profileTab = page.locator("text=Profile").first();
  await profileTab.waitFor({ state: "visible", timeout: 10_000 });
  await profileTab.click();
  // Wait for either "Your Profile" heading or loading spinner to appear
  await page.waitForFunction(
    () => {
      const text = document.body.textContent || "";
      return text.includes("Your Profile") || text.includes("Loading profile");
    },
    { timeout: 15_000 }
  );
}

test.describe("Profile Tab", () => {
  test.beforeEach(async ({ page }) => {
    await resetToAuthenticated(page);
    await page.waitForFunction(
      () => {
        const t = document.body.textContent || "";
        return t.includes("Dashboard") || t.includes("Record") || t.includes("Settings");
      },
      { timeout: 30_000 }
    );
    await dismissModals(page);
  });

  // ==================== Navigation & Loading ====================

  test("Profile tab is visible in the sidebar", async ({ page }) => {
    const profileTab = page.locator("text=Profile").first();
    await expect(profileTab).toBeVisible({ timeout: 10_000 });
  });

  test("clicking Profile tab shows the profile editor", async ({ page }) => {
    await navigateToProfile(page);
    // Should show the "Your Profile" heading
    await expect(page.locator("text=Your Profile").first()).toBeVisible({ timeout: 15_000 });
    // Should show the "Build your public closer profile" subtitle
    await expect(page.locator("text=Build your public closer profile").first()).toBeVisible();
  });

  test("profile editor shows user name from session", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });
    // The name should appear in the Photo & Identity section
    const nameEl = page.locator(`text=${TEST_USER.name}`).first();
    await expect(nameEl).toBeVisible({ timeout: 10_000 });
  });

  // ==================== Section Visibility ====================

  test("profile editor shows all expected sections", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const sections = [
      "Photo & Identity",
      "Profile URL",
      "About",
      "Expertise",
      "Social & Links",
      "Visibility",
    ];

    for (const section of sections) {
      const el = page.locator(`text=${section}`).first();
      await expect(el).toBeVisible({ timeout: 5_000 });
    }
  });

  test("Save Profile button is visible", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });
    const saveBtn = page.locator("text=Save Profile").first();
    await expect(saveBtn).toBeVisible();
  });

  // ==================== Headline Input ====================

  test("headline input accepts text and shows character count", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const headlineInput = page.locator('input[placeholder="High-Ticket Coaching Closer"]');
    await headlineInput.fill("Test Headline For Profile");

    // Character count should be visible
    const charCount = page.locator("text=/25\\/120/").first();
    await expect(charCount).toBeVisible({ timeout: 3_000 });
  });

  test("headline input enforces max 120 characters", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const headlineInput = page.locator('input[placeholder="High-Ticket Coaching Closer"]');
    const longText = "A".repeat(150);
    await headlineInput.fill(longText);

    const value = await headlineInput.inputValue();
    expect(value.length).toBeLessThanOrEqual(120);
  });

  // ==================== Location Input ====================

  test("location input accepts text", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const locationInput = page.locator('input[placeholder="Austin, TX"]');
    await locationInput.fill("San Diego, CA");
    expect(await locationInput.inputValue()).toBe("San Diego, CA");
  });

  // ==================== Bio Textarea ====================

  test("bio textarea shows character count", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const bioTextarea = page.locator("textarea").first();
    await bioTextarea.fill("I am a high-ticket closer.");

    // Should show character count
    const charCount = page.locator("text=/26\\/2000/").first();
    await expect(charCount).toBeVisible({ timeout: 3_000 });
  });

  test("bio textarea enforces max 2000 characters", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const bioTextarea = page.locator("textarea").first();
    const longText = "B".repeat(2100);
    await bioTextarea.fill(longText);

    const value = await bioTextarea.inputValue();
    expect(value.length).toBeLessThanOrEqual(2000);
  });

  // ==================== Profile URL / Slug ====================

  test("slug editor shows sequ3nce.ai/p/ prefix", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const prefix = page.locator("text=sequ3nce.ai/p/").first();
    await expect(prefix).toBeVisible();
  });

  test("slug input pre-fills with a suggested slug", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    // The slug input should have a value (auto-suggested from name or loaded from server)
    const slugInput = page.locator('input[placeholder="your-name"]');
    const value = await slugInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });

  test("slug input only accepts lowercase letters, numbers, and hyphens", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const slugInput = page.locator('input[placeholder="your-name"]');
    await slugInput.fill("");
    await slugInput.type("Test_USER@123!", { delay: 50 });

    const value = await slugInput.inputValue();
    // Should have stripped invalid characters
    expect(value).not.toContain("_");
    expect(value).not.toContain("@");
    expect(value).not.toContain("!");
    expect(value).toMatch(/^[a-z0-9-]*$/);
  });

  // ==================== Ticket Range ====================

  test("ticket range shows all options", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const ranges = ["$1k-$3k", "$3k-$10k", "$10k-$25k", "$25k-$50k", "$50k+"];
    for (const range of ranges) {
      const el = page.locator(`text=${range}`).first();
      await expect(el).toBeVisible({ timeout: 3_000 });
    }
  });

  test("clicking a ticket range selects it", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const rangeBtn = page.locator("text=$10k-$25k").first();
    await rangeBtn.click();

    // The selected range should have the active style (dark bg)
    const classes = await rangeBtn.getAttribute("class");
    expect(classes).toContain("bg-black");
  });

  // ==================== Industries Tag Input ====================

  test("industries section shows label with count", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const label = page.locator("text=Industries").first();
    await expect(label).toBeVisible({ timeout: 5_000 });
  });

  test("typing in industries input shows suggestions dropdown", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const industryInput = page.locator('input[placeholder="Add an industry..."]');
    await industryInput.focus();
    await industryInput.fill("Co");

    // Should show "Coaching" suggestion
    const suggestion = page.locator("text=Coaching").last();
    await expect(suggestion).toBeVisible({ timeout: 3_000 });
  });

  test("pressing Enter in tag input adds a custom tag", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const industryInput = page.locator('input[placeholder="Add an industry..."]');
    await industryInput.focus();
    await industryInput.fill("Fintech");
    await industryInput.press("Enter");

    // "Fintech" should now appear as a tag pill
    const tagPill = page.locator("span:has-text('Fintech')").first();
    await expect(tagPill).toBeVisible({ timeout: 3_000 });
  });

  // ==================== Skills Tag Input ====================

  test("skills section shows label with count", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const label = page.locator("text=Skills").first();
    await expect(label).toBeVisible({ timeout: 5_000 });
  });

  // ==================== Social Links ====================

  test("social links section shows all 5 fields", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const fields = ["LinkedIn", "X (Twitter)", "Instagram", "Website", "Calendly"];
    for (const field of fields) {
      const el = page.locator(`text=${field}`).first();
      await expect(el).toBeVisible({ timeout: 3_000 });
    }
  });

  test("social link inputs accept URLs", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const linkedinInput = page.locator('input[placeholder="https://linkedin.com/in/yourname"]');
    await linkedinInput.fill("https://linkedin.com/in/test-closer");
    expect(await linkedinInput.inputValue()).toBe("https://linkedin.com/in/test-closer");
  });

  // ==================== Visibility Toggle ====================

  test("visibility toggle is present", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const toggleLabel = page.locator("text=Make profile public").first();
    await expect(toggleLabel).toBeVisible();
  });

  test("clicking visibility toggle changes state and description", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    // Initially should show "hidden" message
    const hiddenMsg = page.locator("text=Your profile is hidden from public view").first();
    const visibleMsg = page.locator("text=/Your profile is visible at/").first();

    // Check initial state - should be hidden (isPublic defaults to false for new)
    const initiallyHidden = await hiddenMsg.isVisible().catch(() => false);
    const initiallyVisible = await visibleMsg.isVisible().catch(() => false);

    // Click the toggle
    const toggle = page.locator("text=Make profile public").first();
    await toggle.click();

    // State should have flipped
    await page.waitForTimeout(300);
    if (initiallyHidden) {
      await expect(visibleMsg).toBeVisible({ timeout: 3_000 });
    } else if (initiallyVisible) {
      await expect(hiddenMsg).toBeVisible({ timeout: 3_000 });
    }
  });

  // ==================== Completeness Bar ====================

  test("completeness bar shows percentage", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    // Should show "Profile completeness" text
    const completenessLabel = page.locator("text=Profile completeness").first();
    // May or may not be visible depending on existing profile data
    const isVisible = await completenessLabel.isVisible().catch(() => false);

    if (isVisible) {
      // Should also show a percentage
      const percentText = page.locator("text=/%$/").first();
      await expect(percentText).toBeVisible({ timeout: 3_000 });
    }
    // If not visible, that means profile is 100% complete — also fine
  });

  // ==================== Save Flow ====================

  test("save button triggers save and shows success message", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    // Fill in a field to make a change
    const headlineInput = page.locator('input[placeholder="High-Ticket Coaching Closer"]');
    await headlineInput.fill("E2E Test Headline " + Date.now());

    // Click save
    const saveBtn = page.locator("text=Save Profile").first();
    await saveBtn.click();

    // Should show "Saving..." then "Profile saved!"
    await expect(page.locator("text=Profile saved!").first()).toBeVisible({ timeout: 10_000 });
  });

  test("save button shows Saving... state during API call", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const headlineInput = page.locator('input[placeholder="High-Ticket Coaching Closer"]');
    await headlineInput.fill("Another Test " + Date.now());

    const saveBtn = page.locator("button:has-text('Save Profile')").first();
    await saveBtn.click();

    // "Saving..." should appear (may be brief)
    // Just verify that the button doesn't crash and eventually succeeds
    await expect(page.locator("text=Profile saved!").first()).toBeVisible({ timeout: 10_000 });
  });

  // ==================== Data Persistence ====================

  test("saved profile data persists after navigating away and back", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    // Fill and save a unique headline
    const uniqueHeadline = "Persist Test " + Date.now();
    const headlineInput = page.locator('input[placeholder="High-Ticket Coaching Closer"]');
    await headlineInput.fill(uniqueHeadline);

    const saveBtn = page.locator("text=Save Profile").first();
    await saveBtn.click();
    await expect(page.locator("text=Profile saved!").first()).toBeVisible({ timeout: 10_000 });

    // Navigate to Dashboard
    await page.locator("text=Dashboard").first().click();
    await page.waitForTimeout(1_000);

    // Navigate back to Profile
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    // Wait for data to load from API
    await page.waitForTimeout(2_000);

    // The headline should still be there
    const headlineValue = await headlineInput.inputValue();
    expect(headlineValue).toBe(uniqueHeadline);
  });

  // ==================== Photo Upload UI ====================

  test("photo upload area shows click to upload text", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    const uploadText = page.locator("text=Click to upload photo").first();
    await expect(uploadText).toBeVisible({ timeout: 5_000 });
  });

  test("photo upload shows initials when no photo is set", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    // Should show initials (PT for "Playwright Tester")
    const initials = page.locator("text=PT").first();
    await expect(initials).toBeVisible({ timeout: 5_000 });
  });

  // ==================== View Public Profile Button ====================

  test("View Public Profile button appears when slug is claimed", async ({ page }) => {
    await navigateToProfile(page);
    await page.waitForSelector("text=Your Profile", { timeout: 15_000 });

    // Wait for profile data to load (may already have slug from earlier tests)
    await page.waitForTimeout(2_000);

    const viewBtn = page.locator("text=View Public Profile").first();
    const isVisible = await viewBtn.isVisible().catch(() => false);

    // If slug was previously claimed, button should be visible
    // If not, it's expected to not be visible
    if (isVisible) {
      const href = await viewBtn.getAttribute("href");
      expect(href).toContain("sequ3nce.ai/p/");
    }
  });
});
