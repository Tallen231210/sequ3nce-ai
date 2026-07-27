import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page";

test.describe("Authentication - Landing Page", () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test("landing page loads with hero content", async () => {
    await loginPage.expectLandingPageVisible();
    await expect(loginPage.heroSubtext).toBeVisible();
  });

  test("shows signed-out state with Log in and Book a Demo buttons", async () => {
    await loginPage.expectSignedOutState();
  });

  test("Log in button opens Clerk sign-in modal", async () => {
    await loginPage.openClerkSignIn();
    await expect(loginPage.clerkModal).toBeVisible();
  });

  test("Clerk modal contains email input field", async () => {
    await loginPage.openClerkSignIn();
    await expect(loginPage.clerkEmailInput).toBeVisible();
  });

  test("landing page has correct title", async ({ page }) => {
    await expect(page).toHaveTitle(/Sequ3nce/i);
  });

  test("landing page has navigation header with logo", async ({ page }) => {
    // The header contains the logo and auth buttons
    const header = page.locator("header").first();
    await expect(header).toBeVisible();
  });

  test("footer contains privacy and terms links", async ({ page }) => {
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();

    const privacyLink = page.getByRole("link", { name: /Privacy Policy/i });
    const termsLink = page.getByRole("link", { name: /Terms of Service/i });
    await expect(privacyLink).toBeVisible();
    await expect(termsLink).toBeVisible();
  });

  test("How It Works section is present", async ({ page }) => {
    const howItWorks = page.getByRole("heading", {
      name: /Start seeing everything in minutes/i,
    });
    await expect(howItWorks).toBeVisible();
  });

  test("pricing section is present", async ({ page }) => {
    const pricing = page.getByRole("heading", {
      name: /Simple, transparent pricing/i,
    });
    await expect(pricing).toBeVisible();
  });
});
