import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { DashboardPage } from "../pages/dashboard.page";

test.describe("Dashboard - Unauthenticated", () => {
  test("redirects unauthenticated users away from /dashboard", async ({
    page,
  }) => {
    // Use a fresh context without auth state
    const context = await page.context().browser()!.newContext();
    const freshPage = await context.newPage();

    await freshPage.goto("http://localhost:3000/dashboard");

    // Clerk middleware should redirect to sign-in or the landing page.
    await freshPage.waitForURL(
      (url) => !url.pathname.startsWith("/dashboard"),
      { timeout: 15000 }
    );

    expect(freshPage.url()).not.toContain("/dashboard");
    await context.close();
  });
});

test.describe("Dashboard - Authenticated", () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  test("dashboard page loads with header", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectPageLoaded();
  });

  test("dashboard shows stats grid", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectStatsGridVisible();
  });

  test("dashboard shows sidebar navigation", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectSidebarVisible();
  });

  test("dashboard shows Live Calls section", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.liveCallsHeading).toBeVisible();
  });

  test("dashboard shows Recent Calls section", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.recentCallsHeading).toBeVisible();
  });

  test("Live Calls 'View all' links to /dashboard/live", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.liveCallsViewAll).toHaveAttribute(
      "href",
      "/dashboard/live"
    );
  });

  test("Recent Calls 'View all' links to /dashboard/calls", async ({
    page,
  }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.recentCallsViewAll).toHaveAttribute(
      "href",
      "/dashboard/calls"
    );
  });

  test("Clerk UserButton is visible in the header", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.userButton).toBeVisible();
  });
});
