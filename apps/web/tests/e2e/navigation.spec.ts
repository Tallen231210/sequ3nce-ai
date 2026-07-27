import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * Navigation tests for the dashboard sidebar.
 *
 * The sidebar contains links to all major sections:
 *   Dashboard, Live Calls, Schedule, Completed, Recordings,
 *   Analytics, Closer Stats, Playbook, Resources, Team, Billing, Settings
 */

const sidebarLinks = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Live Calls", href: "/dashboard/live" },
  { name: "Schedule", href: "/dashboard/schedule" },
  { name: "Completed", href: "/dashboard/calls" },
  { name: "Recordings", href: "/dashboard/recordings" },
  { name: "Analytics", href: "/dashboard/analytics" },
  { name: "Closer Stats", href: "/dashboard/closer-stats" },
  { name: "Playbook", href: "/dashboard/playbook" },
  { name: "Resources", href: "/dashboard/resources" },
  { name: "Team", href: "/dashboard/team" },
  { name: "Billing", href: "/dashboard/billing" },
  { name: "Settings", href: "/dashboard/settings" },
];

test.describe("Sidebar Navigation - Authenticated", () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  test("sidebar is visible on the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
  });

  test("sidebar contains all navigation links", async ({ page }) => {
    await page.goto("/dashboard");
    const sidebar = page.locator("aside");

    for (const item of sidebarLinks) {
      const link = sidebar.getByRole("link", { name: item.name });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", item.href);
    }
  });

  test("sidebar highlights the active page", async ({ page }) => {
    await page.goto("/dashboard");
    const sidebar = page.locator("aside");

    // The Dashboard link should have the active styling
    const dashboardLink = sidebar.getByRole("link", { name: "Dashboard" });
    await expect(dashboardLink).toHaveClass(/bg-primary/);
  });

  for (const item of sidebarLinks) {
    test(`navigating to ${item.name} loads correctly`, async ({ page }) => {
      await page.goto("/dashboard");
      const sidebar = page.locator("aside");
      const link = sidebar.getByRole("link", { name: item.name });

      await link.click();
      await page.waitForURL(`**${item.href}`, { timeout: 10000 });

      expect(page.url()).toContain(item.href);
    });
  }

  test("sidebar logo links to /dashboard", async ({ page }) => {
    await page.goto("/dashboard/settings");
    const sidebar = page.locator("aside");

    const logoLink = sidebar.getByRole("link").first();
    await expect(logoLink).toHaveAttribute("href", "/dashboard");
  });

  test("sidebar has copyright footer", async ({ page }) => {
    await page.goto("/dashboard");
    const sidebar = page.locator("aside");
    const copyright = sidebar.getByText(/Sequ3nce.ai/);
    await expect(copyright).toBeVisible();
  });
});

test.describe("Landing Page Navigation", () => {
  test("landing page 'See How It Works' scrolls to section", async ({
    page,
  }) => {
    await page.goto("/");

    const seeHowItWorks = page.getByText("See How It Works");
    await seeHowItWorks.click();

    const section = page.locator("#how-it-works");
    await expect(section).toBeInViewport({ timeout: 5000 });
  });

  test("privacy policy link navigates to /privacy", async ({ page }) => {
    await page.goto("/");
    const privacyLink = page.getByRole("link", { name: /Privacy Policy/i });
    await privacyLink.click();
    await page.waitForURL("**/privacy");
    expect(page.url()).toContain("/privacy");
  });

  test("terms of service link navigates to /terms", async ({ page }) => {
    await page.goto("/");
    const termsLink = page.getByRole("link", { name: /Terms of Service/i });
    await termsLink.click();
    await page.waitForURL("**/terms");
    expect(page.url()).toContain("/terms");
  });
});
