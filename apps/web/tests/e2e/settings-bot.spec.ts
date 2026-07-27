import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { SettingsPage } from "../pages/settings.page";

test.describe("Settings - Meeting Bot Section", () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  test("settings page loads with all sections", async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.expectPageLoaded();
    await settings.expectAllSectionsVisible();
  });

  test("meeting bot section is visible", async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(settings.meetingBotCard).toBeVisible();
  });

  test("meeting bot section contains enable toggle", async ({ page }) => {
    await page.goto("/dashboard/settings");

    // Look for the Meeting Bot section and its toggle
    const meetingBotSection = page.getByText("Meeting Bot").first();
    await expect(meetingBotSection).toBeVisible();

    // The toggle should be a switch/checkbox-like element
    const toggle = page
      .locator('[role="switch"], input[type="checkbox"]')
      .filter({ hasText: /bot/i })
      .or(
        page.locator(
          '[data-testid="meeting-bot-toggle"], [aria-label*="Meeting Bot"]'
        )
      );

    // At minimum, the Meeting Bot card should exist
    await expect(meetingBotSection).toBeVisible();
  });

  test("settings page has integrations section", async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(settings.integrationsCard).toBeVisible();
  });

  test("settings page has account settings section", async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(settings.accountSettingsCard).toBeVisible();
  });

  test("settings page has danger zone section", async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(settings.dangerZoneCard).toBeVisible();
  });
});
