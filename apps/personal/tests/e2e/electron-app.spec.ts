import { test, expect } from "./fixtures";

test.describe("Electron App Basics", () => {
  test("app launches without crashing", async ({ electronApp }) => {
    const windows = electronApp.windows();
    expect(windows.length).toBeGreaterThan(0);
  });

  test("main window is visible", async ({ electronApp }) => {
    const isVisible = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win?.isVisible() ?? false;
    });
    expect(isVisible).toBeTruthy();
  });

  test("window has expected minimum dimensions", async ({ electronApp }) => {
    const bounds = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win?.getBounds();
    });
    expect(bounds).toBeTruthy();
    expect(bounds!.width).toBeGreaterThanOrEqual(300);
    expect(bounds!.height).toBeGreaterThanOrEqual(400);
  });

  test("renderer loads without critical errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.waitForTimeout(3000);

    const criticalErrors = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("net::ERR_") && !e.includes("Failed to fetch")
    );
    expect(criticalErrors).toEqual([]);
  });

  test("app version is accessible", async ({ page }) => {
    const version = await page.evaluate(async () => {
      if ((window as any).electron?.app?.getVersion) {
        return await (window as any).electron.app.getVersion();
      }
      return null;
    });

    if (version) {
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    }
  });
});
