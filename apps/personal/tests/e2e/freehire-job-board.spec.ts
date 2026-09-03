import {
  test,
  expect,
  resetToAuthenticated,
  reloadApp,
  TEST_USER,
} from "./fixtures";

const SESSION_KEY = "sequ3nce_personal_info";

async function openJobBoard(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Job Board" }).first().click();
  await expect(page.getByTestId("freehire-job-board")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "The Placement Line", exact: true })).toBeVisible();
  await expect(page.getByTestId("freehire-job-card").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("FreeHire development job board", () => {
  test.beforeEach(async ({ page }) => {
    await resetToAuthenticated(page);
    await page.evaluate(() => {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith("sequ3nce:dev-job-board:")) localStorage.removeItem(key);
      }
    });
    await reloadApp(page);
    await openJobBoard(page);
  });

  test("saves, annotates, advances, reloads, hides, and restores a role", async ({ page }) => {
    const firstCard = page.getByTestId("freehire-job-card").first();
    const title = (await firstCard.locator("p").first().textContent())?.trim();
    if (!title) throw new Error("The live feed returned a job without a title");

    await firstCard.getByTitle("Save job").click();
    await page.getByRole("button", { name: /^Applications/ }).click();
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("freehire-tracking-status")).toContainText(/Synced|Sign in to sync|Offline/);

    await page.getByText(title, { exact: true }).first().click();
    const note = page.getByTestId("freehire-private-note");
    await expect(note).toBeVisible();
    await note.fill("Recruiter: Jordan — ask about ramp quota and lead flow.");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText("Private note saved")).toBeVisible();

    await page.getByRole("button", { name: /^Applications/ }).click();
    await expect(page.getByText(/Recruiter: Jordan/)).toBeVisible();
    await page.getByRole("button", { name: "Move to Preparing" }).click();
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();

    await reloadApp(page);
    await openJobBoard(page);
    await page.getByRole("button", { name: /^Applications/ }).click();
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Recruiter: Jordan/)).toBeVisible();

    await page.getByText(title, { exact: true }).first().click();
    await page.getByRole("button", { name: "Not interested" }).click();
    await page.getByRole("button", { name: /^Applications/ }).click();
    await page.getByText("Hidden roles", { exact: true }).click();
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  });

  test("keeps local fallback activity isolated by signed-in Personal user", async ({ page }) => {
    await page.getByTestId("freehire-job-card").first().getByTitle("Save job").click();
    await page.evaluate(({ key }) => {
      const current = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...current, b2cUserId: "isolated-preview-user" }));
    }, { key: SESSION_KEY });
    await reloadApp(page);
    await openJobBoard(page);
    await page.getByRole("button", { name: /^Applications/ }).click();
    await expect(page.getByText("No roles here yet")).toHaveCount(4);

    await page.evaluate(({ key, user }) => {
      const current = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...current, b2cUserId: user.b2cUserId }));
    }, { key: SESSION_KEY, user: TEST_USER });
    await reloadApp(page);
    await openJobBoard(page);
    await page.getByRole("button", { name: /^Applications/ }).click();
    await expect(page.getByText("No roles here yet")).toHaveCount(3);
  });

  test("fits narrow and wide windows without horizontal document overflow", async ({ page }) => {
    for (const viewport of [{ width: 780, height: 720 }, { width: 1600, height: 1000 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
      await expect(page.getByTestId("freehire-job-board")).toBeVisible();
    }
  });

  test("loads full-set facets and real Sales market rollups", async ({ page }) => {
    const response = await page.evaluate(async () => {
      const [facets, market] = await Promise.all([
        window.electron.freeHire.facets({ lane: "for-you" }),
        window.electron.freeHire.marketInsights({}),
      ]);
      return { facets, market };
    });

    expect(response.facets.total).toBeGreaterThan(24);
    expect(response.facets.pastSevenDaysTotal).toBeGreaterThan(0);
    expect(response.facets.pastSevenDaysTotal).toBeLessThanOrEqual(response.facets.total);
    expect(Object.keys(response.facets.facets.source ?? {}).length).toBeGreaterThan(1);
    expect(response.market.roles.length).toBeGreaterThan(0);
    expect(response.market.skills.length).toBeGreaterThan(0);
    expect(response.market.salary.some((band) => band.sampleSize >= 5)).toBe(true);
    expect(response.market.velocity.length).toBeGreaterThan(1);

    await page.getByRole("button", { name: "Market insights", exact: true }).click();
    await expect(page.getByTestId("market-insights")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("market-insights-scope")).toContainText("For You");
    await expect(page.getByText("Current opportunity set", { exact: true })).toBeVisible();
    await expect(page.getByText("Broader Sales market", { exact: true })).toBeVisible();
    await expect(page.getByTestId("market-salary-median")).toBeVisible();
    await expect(page.getByText("Loaded this week", { exact: true })).toHaveCount(0);

    for (const viewport of [{ width: 780, height: 720 }, { width: 1600, height: 1000 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(200);
      const overflow = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
    }
  });
});
