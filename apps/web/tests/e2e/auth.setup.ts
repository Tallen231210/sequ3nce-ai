import { test as setup } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * Auth setup: Signs in once and saves the session state so all
 * authenticated tests can reuse it without logging in each time.
 *
 * Requires env vars: CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 * and a test user in your Clerk dashboard.
 *
 * Set E2E_CLERK_USER_EMAIL and E2E_CLERK_USER_PASSWORD in .env.local
 * for the test user credentials.
 */

const authFile = "tests/.auth/user.json";

setup("authenticate", async ({ page }) => {
  // Set up Clerk testing token for bypassing bot protection
  await setupClerkTestingToken({ page });

  // Navigate to the app
  await page.goto("/");

  // Sign in with Clerk
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: process.env.E2E_CLERK_USER_EMAIL || "test@sequ3nce.ai",
      password: process.env.E2E_CLERK_USER_PASSWORD || "testpassword123",
    },
  });

  // Wait for redirect to dashboard after successful sign-in
  await page.waitForURL("**/dashboard**", { timeout: 15000 });

  // Save the authenticated state
  await page.context().storageState({ path: authFile });
});
