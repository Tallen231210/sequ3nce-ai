import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Page object for the main Dashboard page (/dashboard).
 *
 * The dashboard shows:
 * - A header with title "Dashboard" and a Clerk UserButton
 * - A stats grid (Calls Today, Live Now, Close Rate, No-Shows)
 * - A "Live Calls" card with a "View all" link to /dashboard/live
 * - A "Recent Calls" card with a "View all" link to /dashboard/calls
 * - A left sidebar with navigation links
 */
export class DashboardPage {
  readonly page: Page;

  // Header
  readonly headerTitle: Locator;
  readonly userButton: Locator;

  // Stats cards
  readonly callsTodayCard: Locator;
  readonly liveNowCard: Locator;
  readonly closeRateCard: Locator;
  readonly noShowsCard: Locator;

  // Live Calls section
  readonly liveCallsHeading: Locator;
  readonly liveCallsViewAll: Locator;
  readonly noLiveCallsMessage: Locator;

  // Recent Calls section
  readonly recentCallsHeading: Locator;
  readonly recentCallsViewAll: Locator;
  readonly noRecentCallsMessage: Locator;

  // Sidebar (present in dashboard layout)
  readonly sidebar: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.headerTitle = page.getByRole("heading", { name: "Dashboard" });
    this.userButton = page.locator(".cl-userButtonTrigger");

    // Stats - identified by their card title text
    this.callsTodayCard = page.getByText("Calls Today");
    this.liveNowCard = page.getByText("Live Now");
    this.closeRateCard = page.getByText("Close Rate (Week)");
    this.noShowsCard = page.getByText("No-Shows (Week)");

    // Live Calls section
    this.liveCallsHeading = page.getByRole("heading", {
      name: "Live Calls",
    });
    this.liveCallsViewAll = page.getByRole("link", {
      name: /View all/i,
    }).first();
    this.noLiveCallsMessage = page.getByText("No live calls at the moment");

    // Recent Calls section
    this.recentCallsHeading = page.getByRole("heading", {
      name: "Recent Calls",
    });
    this.recentCallsViewAll = page.getByRole("link", {
      name: /View all/i,
    }).last();
    this.noRecentCallsMessage = page.getByText("No completed calls yet");

    // Sidebar
    this.sidebar = page.locator("aside");
  }

  async goto() {
    await this.page.goto("/dashboard");
  }

  async expectPageLoaded() {
    await expect(this.headerTitle).toBeVisible();
  }

  async expectStatsGridVisible() {
    await expect(this.callsTodayCard).toBeVisible();
    await expect(this.liveNowCard).toBeVisible();
    await expect(this.closeRateCard).toBeVisible();
    await expect(this.noShowsCard).toBeVisible();
  }

  async expectSidebarVisible() {
    await expect(this.sidebar).toBeVisible();
  }
}
