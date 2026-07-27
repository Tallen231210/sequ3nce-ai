import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Page object for the Settings page (/dashboard/settings).
 *
 * The settings page has several Card sections:
 * - Account Settings (team name, user name, email)
 * - Billing (plan display, manage billing link)
 * - Team Preferences (timezone, call outcomes, playbook categories)
 * - Integrations (Google Calendar, Calendly, Slack, Discord, GHL, Close CRM)
 * - Meeting Bot (enable/disable toggle, beta)
 * - Danger Zone (delete team)
 */
export class SettingsPage {
  readonly page: Page;

  // Header
  readonly headerTitle: Locator;
  readonly headerDescription: Locator;

  // Account Settings card
  readonly accountSettingsCard: Locator;
  readonly teamNameInput: Locator;
  readonly userNameInput: Locator;
  readonly emailInput: Locator;

  // Billing card
  readonly billingCard: Locator;
  readonly manageBillingLink: Locator;

  // Team Preferences card
  readonly teamPreferencesCard: Locator;
  readonly timezoneSelect: Locator;

  // Integrations card
  readonly integrationsCard: Locator;
  readonly slackSection: Locator;
  readonly discordSection: Locator;

  // Meeting Bot card
  readonly meetingBotCard: Locator;

  // Danger Zone card
  readonly dangerZoneCard: Locator;
  readonly deleteTeamButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.headerTitle = page.getByRole("heading", { name: "Settings" }).first();
    this.headerDescription = page.getByText(
      "Manage your account and preferences"
    );

    // Account Settings
    this.accountSettingsCard = page.getByText("Account Settings").first();
    this.teamNameInput = page.locator("#teamName");
    this.userNameInput = page.locator("#userName");
    this.emailInput = page.locator('input[disabled]').first();

    // Billing
    this.billingCard = page.getByText("Billing").first();
    this.manageBillingLink = page.getByRole("link", {
      name: /Manage Billing/i,
    });

    // Team Preferences
    this.teamPreferencesCard = page.getByText("Team Preferences").first();
    this.timezoneSelect = page.locator("button").filter({
      hasText: /Time/i,
    }).first();

    // Integrations
    this.integrationsCard = page.getByText("Integrations").first();
    this.slackSection = page.getByText("Slack").first();
    this.discordSection = page.getByText("Discord").first();

    // Meeting Bot
    this.meetingBotCard = page.getByText("Meeting Bot").first();

    // Danger Zone
    this.dangerZoneCard = page.getByText("Danger Zone").first();
    this.deleteTeamButton = page.getByRole("button", {
      name: /Delete Team/i,
    });
  }

  async goto() {
    await this.page.goto("/dashboard/settings");
  }

  async expectPageLoaded() {
    await expect(this.headerTitle).toBeVisible();
  }

  async expectAllSectionsVisible() {
    await expect(this.accountSettingsCard).toBeVisible();
    await expect(this.billingCard).toBeVisible();
    await expect(this.teamPreferencesCard).toBeVisible();
    await expect(this.integrationsCard).toBeVisible();
    await expect(this.meetingBotCard).toBeVisible();
    await expect(this.dangerZoneCard).toBeVisible();
  }
}
