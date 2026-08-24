import { test as base, type ElectronApplication, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import path from "path";
import fs from "fs";

// Test account credentials (persistent account in production Convex)
export const TEST_USER = {
  email: "pw-test@sequ3nce.ai",
  password: "PlaywrightTest2024",
  name: "Playwright Tester",
  closerId: "jd7eh02mh77dspkjv3f6q3y9ah8d22k3",
  teamId: "js7btbv0gf8jngdzb706ftw89x8d34cm",
  b2cUserId: "nh75we2jj2yjtcrjj1yhae9pkx8d3wjh",
};

// Storage key used by the app
const STORAGE_KEY = "sequ3nce_personal_info";
const APP_ROOT = path.resolve(__dirname, "../..");

// Module-level reference to the Electron app (set by worker fixture)
let sharedElectronApp: ElectronApplication | null = null;

type WorkerFixtures = {
  electronApp: ElectronApplication;
  sharedPage: Page;
};

type TestFixtures = {
  page: Page;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  electronApp: [
    async ({}, use) => {
      const electronBin = require("electron") as string;

      const candidates = [
        path.join(APP_ROOT, ".webpack", process.arch, "main"),
        path.join(APP_ROOT, ".webpack", "main"),
      ];
      const mainEntry = candidates.find((p) =>
        fs.existsSync(path.join(p, "index.js"))
      );

      if (!mainEntry) {
        throw new Error(
          `Webpack build not found. Checked:\n${candidates.map((c) => `  - ${c}/index.js`).join("\n")}\n\n` +
            "Run `npm run start` first to compile the app, then run tests."
        );
      }

      // Strip CLAUDECODE env var to prevent nested-session crash
      const cleanEnv = { ...process.env };
      delete cleanEnv.CLAUDECODE;

      const app = await electron.launch({
        executablePath: electronBin,
        args: [mainEntry],
        cwd: APP_ROOT,
        env: {
          ...cleanEnv,
          NODE_ENV: "test",
          ELECTRON_DISABLE_AUTO_UPDATE: "1",
        },
      });

      sharedElectronApp = app;
      await use(app);
      await app.close();
      sharedElectronApp = null;
    },
    { scope: "worker" },
  ],

  sharedPage: [
    async ({ electronApp }, use) => {
      // Electron in dev mode may auto-open DevTools as its first BrowserWindow.
      // Poll until we find a window whose URL is NOT a devtools:// URL.
      let window: Page | null = null;
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const windows = electronApp.windows();
        const appWindow = windows.find((w) => !w.url().startsWith("devtools://"));
        if (appWindow) {
          window = appWindow;
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!window) {
        // Fall back to firstWindow if we somehow couldn't find a non-devtools window
        window = await electronApp.firstWindow();
      }
      await window.waitForLoadState("domcontentloaded");
      await use(window);
    },
    { scope: "worker" },
  ],

  page: async ({ sharedPage }, use) => {
    await use(sharedPage);
  },
});

/**
 * Reload the app page. Uses page.reload() which is atomic — it triggers the
 * reload and waits for the new page to load in a single call with no race
 * conditions.
 *
 * Falls back to main-process reload if page.reload() fails (e.g., the page
 * is on about:blank or an error page).
 */
export async function reloadApp(page: Page): Promise<void> {
  try {
    // Use 'load' instead of 'domcontentloaded' to ensure scripts have executed
    // and React has had a chance to mount before returning.
    await page.reload({ waitUntil: "load", timeout: 15_000 });
  } catch {
    // Fallback: reload from main process (works regardless of page state)
    if (!sharedElectronApp) {
      throw new Error("Electron app not initialized — reloadApp called outside test context");
    }
    await sharedElectronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) win.webContents.reload();
    });
    await page.waitForLoadState("load");
  }
}

/**
 * Clear session and reload to the login screen.
 * This is the standard way to reset state between tests.
 */
export async function resetToLogin(page: Page): Promise<void> {
  // Try clearing localStorage directly (works if page is on the app)
  try {
    await page.evaluate((key) => {
      localStorage.removeItem(key);
      localStorage.removeItem("sequ3nce_personal_bot_mode");
    }, STORAGE_KEY);
  } catch {
    // Page is on about:blank or error page — reload to get back to the app first
    await reloadApp(page);
    await page.evaluate((key) => {
      localStorage.removeItem(key);
      localStorage.removeItem("sequ3nce_personal_bot_mode");
    }, STORAGE_KEY);
  }

  // Reload to apply the cleared localStorage (React reads it on mount)
  await reloadApp(page);

  // Wait for login screen — retry reload once if it doesn't appear (can happen
  // after heavy test suites leave the page in a slow-to-recover state)
  try {
    await page.waitForSelector('text="Sign in to your account"', { timeout: 15_000 });
  } catch {
    await reloadApp(page);
    await page.waitForSelector('text="Sign in to your account"', { timeout: 20_000 });
  }
}

/**
 * Inject an authenticated session and reload to the authenticated view.
 */
export async function resetToAuthenticated(page: Page): Promise<void> {
  try {
    await page.evaluate(
      ({ key, user }) => {
        const closerInfo = {
          closerId: user.closerId,
          teamId: user.teamId,
          name: user.name,
          email: user.email,
          status: "active",
          subscriptionStatus: "none",
          b2cUserId: user.b2cUserId,
        };
        localStorage.setItem(key, JSON.stringify(closerInfo));
      },
      { key: STORAGE_KEY, user: TEST_USER }
    );
  } catch {
    await reloadApp(page);
    await page.evaluate(
      ({ key, user }) => {
        const closerInfo = {
          closerId: user.closerId,
          teamId: user.teamId,
          name: user.name,
          email: user.email,
          status: "active",
          subscriptionStatus: "none",
          b2cUserId: user.b2cUserId,
        };
        localStorage.setItem(key, JSON.stringify(closerInfo));
      },
      { key: STORAGE_KEY, user: TEST_USER }
    );
  }

  await reloadApp(page);
}

/**
 * Dismiss any modal overlay that might be blocking interactions.
 * Presses Escape and waits briefly for any modal animation to complete.
 */
export async function dismissModals(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

/**
 * @deprecated Use reloadApp(page) instead. Kept for backwards compatibility.
 */
export async function navigateToApp(page: Page): Promise<void> {
  await reloadApp(page);
}

export { expect } from "@playwright/test";
