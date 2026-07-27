import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Page object for the Recordings page (/dashboard/recordings).
 *
 * Displays video recordings from meeting bot calls in a grid layout.
 * Includes filtering by date range and outcome.
 */
export class RecordingsPage {
  readonly page: Page;

  // Header
  readonly headerTitle: Locator;
  readonly headerDescription: Locator;

  // Filter controls
  readonly dateFromInput: Locator;
  readonly dateToInput: Locator;
  readonly outcomeFilter: Locator;

  // Content
  readonly recordingsGrid: Locator;
  readonly emptyState: Locator;
  readonly loadingSkeleton: Locator;

  // Sidebar
  readonly sidebar: Locator;
  readonly recordingsNavLink: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.headerTitle = page.getByRole("heading", { name: /Recordings/i }).first();
    this.headerDescription = page.getByText(/video recordings/i).first();

    // Filters
    this.dateFromInput = page.locator('input[type="date"]').first();
    this.dateToInput = page.locator('input[type="date"]').last();
    this.outcomeFilter = page.getByRole("button", { name: /All/i }).first();

    // Content grid
    this.recordingsGrid = page.locator('[class*="grid"]').first();
    this.emptyState = page.getByText(/No video recordings/i);
    this.loadingSkeleton = page.locator('[class*="animate-pulse"]').first();

    // Sidebar
    this.sidebar = page.locator("aside");
    this.recordingsNavLink = page
      .locator("aside")
      .getByRole("link", { name: "Recordings" });
  }

  async goto() {
    await this.page.goto("/dashboard/recordings");
  }

  async expectPageLoaded() {
    await expect(this.headerTitle).toBeVisible();
  }

  async expectEmptyState() {
    await expect(this.emptyState).toBeVisible();
  }

  async expectRecordingsVisible() {
    await expect(this.recordingsGrid).toBeVisible();
  }
}
