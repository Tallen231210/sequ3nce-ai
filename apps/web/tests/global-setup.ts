import { clerkSetup } from "@clerk/testing/playwright";
import { FullConfig } from "@playwright/test";

/**
 * Global setup for Playwright E2E tests.
 *
 * Uses Clerk's testing mode to set up authentication.
 * Requires CLERK_SECRET_KEY env var (loaded from .env.local).
 */
async function globalSetup(config: FullConfig) {
  await clerkSetup({
    frontendApiUrl:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.replace(
        "pk_test_",
        "https://"
      ) + ".clerk.accounts.dev",
  });
}

export default globalSetup;
