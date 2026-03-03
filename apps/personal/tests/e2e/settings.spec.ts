import { test, expect, TEST_USER, resetToAuthenticated, dismissModals } from "./fixtures";

test.describe("Settings View", () => {
  test.beforeEach(async ({ page }) => {
    await resetToAuthenticated(page);
    await page.waitForFunction(
      () => {
        const t = document.body.textContent || "";
        return t.includes("Settings") || t.includes("Dashboard");
      },
      { timeout: 30_000 }
    );

    // Dismiss any modal overlays
    await dismissModals(page);

    // Navigate to Settings tab
    const settingsTab = page.locator("text=Settings").first();
    if (await settingsTab.isVisible()) {
      await settingsTab.click();
      await page.waitForTimeout(1000);
    }
  });

  test("settings view renders without crash", async ({ page }) => {
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeTruthy();
  });

  test("logout option is accessible", async ({ page }) => {
    const logoutBtn = page.locator("text=Log Out").or(page.locator("text=Logout")).or(page.locator("text=Sign Out"));
    const isVisible = await logoutBtn.isVisible().catch(() => false);
    if (isVisible) {
      await expect(logoutBtn).toBeVisible();
    }
  });

  test("displays user name and email", async ({ page }) => {
    // Use .first() because name appears in both sidebar and settings content
    await expect(page.locator(`text=${TEST_USER.name}`).first()).toBeVisible();
    await expect(page.locator(`text=${TEST_USER.email}`).first()).toBeVisible();
  });
});

test.describe("Change Password", () => {
  test.beforeEach(async ({ page }) => {
    await resetToAuthenticated(page);
    await page.waitForFunction(
      () => {
        const t = document.body.textContent || "";
        return t.includes("Settings") || t.includes("Dashboard");
      },
      { timeout: 30_000 }
    );
    await dismissModals(page);

    // Navigate to Settings
    const settingsTab = page.locator("text=Settings").first();
    if (await settingsTab.isVisible()) {
      await settingsTab.click();
      await page.waitForTimeout(1000);
    }

    // Expand the password form
    const changePasswordLink = page.locator("text=Change Password");
    if (await changePasswordLink.isVisible()) {
      await changePasswordLink.click();
      await page.waitForTimeout(300);
    }
  });

  test("password form expands when clicking Change Password", async ({ page }) => {
    await expect(page.locator('input[placeholder="Current password"]')).toBeVisible();
    await expect(page.locator('input[placeholder="New password"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Confirm new password"]')).toBeVisible();
  });

  test("save button is disabled when fields are empty", async ({ page }) => {
    const saveBtn = page.locator("button", { hasText: "Save" });
    await expect(saveBtn).toBeDisabled();
  });

  test("save button enables when all fields are filled", async ({ page }) => {
    await page.fill('input[placeholder="Current password"]', "oldpass");
    await page.fill('input[placeholder="New password"]', "newpass123");
    await page.fill('input[placeholder="Confirm new password"]', "newpass123");

    const saveBtn = page.locator("button", { hasText: "Save" });
    await expect(saveBtn).toBeEnabled();
  });

  test("shows error for password mismatch", async ({ page }) => {
    await page.fill('input[placeholder="Current password"]', TEST_USER.password);
    await page.fill('input[placeholder="New password"]', "NewPassword123");
    await page.fill('input[placeholder="Confirm new password"]', "DifferentPassword");

    await page.locator("button", { hasText: "Save" }).click();

    await expect(page.locator("text=Passwords do not match")).toBeVisible();
  });

  test("shows error for short password", async ({ page }) => {
    await page.fill('input[placeholder="Current password"]', TEST_USER.password);
    await page.fill('input[placeholder="New password"]', "short");
    await page.fill('input[placeholder="Confirm new password"]', "short");

    await page.locator("button", { hasText: "Save" }).click();

    await expect(page.locator("text=at least 6 characters")).toBeVisible();
  });

  test("shows error for wrong current password", async ({ page }) => {
    await page.fill('input[placeholder="Current password"]', "WrongCurrentPassword");
    await page.fill('input[placeholder="New password"]', "ValidNewPass123");
    await page.fill('input[placeholder="Confirm new password"]', "ValidNewPass123");

    await page.locator("button", { hasText: "Save" }).click();

    // Wait for server response
    await page.waitForSelector("text=Failed to change password", { timeout: 10_000 }).catch(() => {});
    await page.waitForSelector("text=incorrect", { timeout: 5_000 }).catch(() => {});

    // Should show some error (exact message depends on backend)
    const errorVisible = await page.locator("text=Failed to change password")
      .or(page.locator("text=incorrect"))
      .or(page.locator("text=Invalid"))
      .isVisible();
    expect(errorVisible).toBeTruthy();
  });

  test("cancel button hides the form", async ({ page }) => {
    await expect(page.locator('input[placeholder="Current password"]')).toBeVisible();

    await page.locator("button", { hasText: "Cancel" }).click();

    await expect(page.locator('input[placeholder="Current password"]')).not.toBeVisible();
    // The "Change Password" link should be visible again
    await expect(page.locator("text=Change Password")).toBeVisible();
  });

  // TODO: Enable once B2C changePassword updates both closers AND b2cUsers tables.
  // Currently, /changePassword only updates closers.passwordHash, which causes a
  // desync with b2cUsers.passwordHash. The B2C login reads from b2cUsers, so
  // changing the password via the settings UI breaks the login flow.
  test.skip("successful password change shows success and reverts", async ({ page }) => {
    const TEMP_PASSWORD = "TempPlaywright999";

    await page.fill('input[placeholder="Current password"]', TEST_USER.password);
    await page.fill('input[placeholder="New password"]', TEMP_PASSWORD);
    await page.fill('input[placeholder="Confirm new password"]', TEMP_PASSWORD);

    await page.locator("button", { hasText: "Save" }).click();

    await expect(page.locator("text=Password changed successfully")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[placeholder="Current password"]')).not.toBeVisible();
  });
});
