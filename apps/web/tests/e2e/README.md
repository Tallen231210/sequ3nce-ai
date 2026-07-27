# E2E Tests - Sequ3nce.ai Web Dashboard

End-to-end tests for the web dashboard, built with [Playwright](https://playwright.dev/).

## Prerequisites

1. Install dependencies (if not already done):

   ```bash
   cd apps/web
   npm install
   ```

2. Install the Chromium browser binary:

   ```bash
   npx playwright install chromium
   ```

## Running Tests

```bash
# Run all E2E tests (headless)
npm run test:e2e

# Run tests with the Playwright UI (interactive mode)
npm run test:e2e:ui

# Run a specific test file
npx playwright test tests/e2e/auth.spec.ts

# Run tests in headed mode (see the browser)
npx playwright test --headed

# Run tests with verbose output
npx playwright test --reporter=list
```

## Viewing Reports

After running tests, Playwright generates an HTML report:

```bash
npm run test:e2e:report
```

This opens the report in your default browser with detailed results, traces, and screenshots for failed tests.

## Recording New Tests

Use Playwright's codegen tool to record browser interactions and generate test code:

```bash
npm run test:e2e:codegen
```

This opens a browser window and a Playwright inspector. Interact with the app and the inspector will generate the corresponding test code.

## Project Structure

```
tests/
  e2e/              # Test spec files
    auth.spec.ts     # Landing page & Clerk auth tests
    dashboard.spec.ts # Dashboard page tests
    navigation.spec.ts # Sidebar navigation tests
  pages/             # Page Object Models
    login.page.ts    # Landing/login page object
    dashboard.page.ts # Dashboard page object
    settings.page.ts  # Settings page object
```

## Authentication for Tests

The dashboard routes are protected by Clerk middleware. Tests that access `/dashboard/*` routes need an authenticated session.

### Setting Up Clerk Testing Tokens

Clerk provides a testing mode for E2E tests. See the [Clerk Playwright docs](https://clerk.com/docs/testing/playwright) for full details.

**Quick summary:**

1. In your Clerk Dashboard, go to **API Keys** and find your **Testing** keys.

2. Create a `tests/.auth/` directory (already gitignored) and set up a global setup script that authenticates and saves the session state:

   ```typescript
   // tests/global-setup.ts
   import { chromium } from "@playwright/test";

   async function globalSetup() {
     const browser = await chromium.launch();
     const page = await browser.newPage();

     // Navigate to your app and sign in via Clerk
     await page.goto("http://localhost:3000");
     // ... perform sign-in steps ...

     // Save the authenticated state
     await page.context().storageState({ path: "tests/.auth/user.json" });
     await browser.close();
   }

   export default globalSetup;
   ```

3. Reference the storage state in your test files:

   ```typescript
   test.use({ storageState: "tests/.auth/user.json" });
   ```

4. Once auth is configured, remove the `.skip` from the authenticated test cases in `dashboard.spec.ts` and `navigation.spec.ts`.

### Running Without Auth

The tests in `auth.spec.ts` run against the public landing page and do not require authentication. Dashboard and navigation tests are marked with `.skip` until auth is configured.

## Configuration

The Playwright config is at `apps/web/playwright.config.ts`. Key settings:

- **Browser**: Chromium only (add Firefox/WebKit in projects array if needed)
- **Base URL**: `http://localhost:3000`
- **Web Server**: Auto-starts `npm run dev` before tests
- **Traces**: Recorded on first retry for debugging
- **Screenshots**: Captured on test failure
- **Reporter**: HTML (open with `npm run test:e2e:report`)

## Tips

- Use `test.only()` to run a single test during development.
- Use `--debug` flag to step through tests: `npx playwright test --debug`
- Traces from failed tests can be viewed at [trace.playwright.dev](https://trace.playwright.dev/).
- When adding new pages, create a page object in `tests/pages/` first, then write specs in `tests/e2e/`.
