import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for Sequ3nce Personal (B2C) Electron app E2E tests.
 *
 * Uses Playwright's Electron support to launch the app directly.
 * Tests interact with the renderer process via page objects.
 *
 * The webServer config starts a static file server on port 3000 to serve
 * the compiled renderer files. This is necessary because Electron Forge's
 * webpack plugin hardcodes http://localhost:3000 as the renderer entry URL.
 *
 * Prerequisites: Run `npm run start` once (then stop it) to compile .webpack/
 *
 * Run: npx playwright test
 * Run with UI: npx playwright test --ui
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // Electron tests must run sequentially (single app instance)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker — Electron can't run multiple instances
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 60_000, // 60s per test (Electron startup is slow)

  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  // Serve the compiled renderer files on port 3000 (replaces webpack-dev-server)
  webServer: {
    command: "node tests/serve-renderer.js",
    port: 3000,
    reuseExistingServer: true, // If `npm run start` is already running, use it
    timeout: 10_000,
  },

  projects: [
    {
      name: "electron",
      testMatch: /.*\.spec\.ts/,
    },
  ],
});
