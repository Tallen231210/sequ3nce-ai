import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Page object for the landing/login page.
 *
 * Auth is handled by Clerk. When signed out, the landing page shows a
 * "Log in" button that opens the Clerk modal, plus a "Book a Demo" CTA.
 * When signed in, a "Dashboard" link appears instead.
 */
export class LoginPage {
  readonly page: Page;

  // Landing page elements (signed-out state)
  readonly logInButton: Locator;
  readonly bookDemoButton: Locator;
  readonly heroHeading: Locator;
  readonly heroSubtext: Locator;

  // Signed-in elements
  readonly dashboardLink: Locator;

  // Clerk modal elements (appear after clicking Log in)
  readonly clerkModal: Locator;
  readonly clerkEmailInput: Locator;
  readonly clerkContinueButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Landing page
    this.logInButton = page.getByRole("button", { name: "Log in" }).first();
    this.bookDemoButton = page.getByRole("button", {
      name: /Book a Demo/i,
    }).first();
    this.heroHeading = page.getByRole("heading", {
      name: /Finally see why deals close/i,
    });
    this.heroSubtext = page.getByText(
      /Stop managing your sales team blind/i
    );

    // Signed-in state
    this.dashboardLink = page.getByRole("link", { name: /Dashboard/i }).first();

    // Clerk sign-in modal (rendered by Clerk SDK)
    this.clerkModal = page.getByRole("dialog").first();
    this.clerkEmailInput = page.locator(
      '.cl-formFieldInput__emailAddress, input[name="identifier"]'
    );
    this.clerkContinueButton = page.getByRole("button", {
      name: /continue/i,
    });
  }

  async goto() {
    await this.page.goto("/");
  }

  async openClerkSignIn() {
    await this.logInButton.click();
    await this.clerkModal.waitFor({ state: "visible", timeout: 10000 });
  }

  async expectLandingPageVisible() {
    await expect(this.heroHeading).toBeVisible();
  }

  async expectSignedOutState() {
    await expect(this.logInButton).toBeVisible();
    await expect(this.bookDemoButton).toBeVisible();
  }

  async expectSignedInState() {
    await expect(this.dashboardLink).toBeVisible();
  }
}
