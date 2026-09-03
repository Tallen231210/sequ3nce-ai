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
        if (
          key?.startsWith("sequ3nce:dev-job-board:")
          || key?.startsWith("sequ3nce:job-preferences:")
          || key?.startsWith("sequ3nce:job-board-visit:")
        ) {
          localStorage.removeItem(key);
        }
      }
    });
    await reloadApp(page);
    await openJobBoard(page);
    await page.getByTestId("reset-job-preferences").click();
    await expect(page.getByLabel("Role")).toHaveValue("sales");
    await expect(page.getByLabel("Target pay")).toHaveValue("0");
    await expect(page.getByTestId("freehire-job-card").first()).toBeVisible({ timeout: 20_000 });
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

  test("marks newly discovered roles viewed and keeps that state private per user", async ({ page }) => {
    const count = page.getByTestId("new-job-count");
    const initialCount = Number(await count.textContent());
    expect(initialCount).toBeGreaterThan(0);

    await page.getByTestId("new-since-last-visit").click();
    const newCard = page.locator('[data-testid="freehire-job-card"][data-new="true"]').first();
    await expect(newCard).toBeVisible();
    const jobId = await newCard.getAttribute("data-job-id");
    if (!jobId) throw new Error("New job card did not expose its stable id");

    await newCard.getByTestId("open-job").click();
    await expect(page.locator(`[data-job-id="${jobId}"]`)).toHaveAttribute("data-new", "false");
    await expect(count).toHaveText(String(initialCount - 1));
    await expect(page.getByText("Select a role to review it")).toHaveCount(0);

    await page.evaluate(({ visitKey }) => {
      localStorage.setItem(visitKey, String(Date.now() - 7 * 24 * 60 * 60 * 1000));
    }, { visitKey: `sequ3nce:job-board-visit:${TEST_USER.b2cUserId}` });
    await reloadApp(page);
    await openJobBoard(page);
    await expect(page.locator(`[data-job-id="${jobId}"]`)).toHaveAttribute("data-new", "false");

    await page.evaluate(({ sessionKey }) => {
      const current = JSON.parse(localStorage.getItem(sessionKey) || "{}");
      localStorage.setItem(sessionKey, JSON.stringify({ ...current, b2cUserId: "isolated-viewed-user" }));
      localStorage.removeItem("sequ3nce:job-board-visit:isolated-viewed-user");
    }, { sessionKey: SESSION_KEY });
    await reloadApp(page);
    await openJobBoard(page);
    await expect(page.locator(`[data-job-id="${jobId}"]`)).toHaveAttribute("data-new", "true");
  });

  test("renders a curated legacy job in its lane with its source and saves it", async ({ page }) => {
    await page.getByLabel("Role").selectOption("account-executive");
    const searchResult = await page.evaluate(async () => {
      const firstPage = await window.electron.freeHire.search({
        lane: "account-executive",
        limit: 1,
      });
      const nextPage = await window.electron.freeHire.search({
        lane: "account-executive",
        limit: 1,
        offset: 1,
      });
      return {
        legacy: firstPage.jobs.find((job) => job.id.startsWith("sequ3nce:")) ?? null,
        laterPageHasLegacy: nextPage.jobs.some((job) => job.id.startsWith("sequ3nce:")),
      };
    });
    const { legacy } = searchResult;
    expect(legacy).not.toBeNull();
    expect(searchResult.laterPageHasLegacy).toBe(false);
    if (!legacy) return;

    const card = page.locator(`[data-job-id="${legacy.id}"]`);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText(legacy.source);
    await card.getByTitle("Save job").click();

    await page.getByRole("button", { name: /^Applications/ }).click();
    await expect(page.getByText(legacy.title, { exact: true }).first()).toBeVisible();
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

  test("adjusts, applies, persists, and isolates the For You preferences", async ({ page }) => {
    const preferences = page.getByTestId("job-preferences");
    await expect(preferences).toBeVisible();
    await expect(preferences.getByRole("combobox")).toHaveCount(6);
    await expect(page.getByRole("button", { name: "For You", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Discover", exact: true })).toHaveCount(0);

    const totals = await page.evaluate(async () => {
      const [broad, highPay] = await Promise.all([
        window.electron.freeHire.search({ lane: "sales", limit: 1 }),
        window.electron.freeHire.search({ lane: "sales", minSalary: 150000, limit: 10 }),
      ]);
      const freeHireHighPayJob = highPay.jobs.find((job) => !job.id.startsWith("sequ3nce:"));
      const detail = freeHireHighPayJob
        ? await window.electron.freeHire.getJob(freeHireHighPayJob.id)
        : null;
      return {
        broad: broad.total,
        highPay: highPay.total,
        displaysCompensation: highPay.jobs.some((job) => job.salary !== "Compensation not listed"),
        detailDisplaysCompensation: detail?.salary !== "Compensation not listed",
      };
    });
    expect(totals.highPay).toBeGreaterThan(0);
    expect(totals.highPay).toBeLessThan(totals.broad);
    expect(totals.displaysCompensation).toBe(true);
    expect(totals.detailDisplaysCompensation).toBe(true);

    const initialCount = await page.getByTestId("matching-role-count").textContent();
    await page.getByLabel("Role").selectOption("closer");
    await page.getByLabel("Target pay").selectOption("150000");
    await expect(page.getByTestId("target-pay-disclosure")).toBeVisible();
    await expect(page.getByTestId("matching-role-count")).not.toHaveText(initialCount ?? "", { timeout: 20_000 });
    await page.waitForTimeout(500);

    await reloadApp(page);
    await openJobBoard(page);
    await expect(page.getByLabel("Role")).toHaveValue("closer");
    await expect(page.getByLabel("Target pay")).toHaveValue("150000");

    await page.evaluate(({ key }) => {
      const current = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...current, b2cUserId: "isolated-preference-user" }));
    }, { key: SESSION_KEY });
    await reloadApp(page);
    await openJobBoard(page);
    await expect(page.getByLabel("Role")).toHaveValue("sales");
    await expect(page.getByLabel("Target pay")).toHaveValue("0");

    await page.evaluate(({ key, user }) => {
      const current = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...current, b2cUserId: user.b2cUserId }));
    }, { key: SESSION_KEY, user: TEST_USER });
    await reloadApp(page);
    await openJobBoard(page);
    await expect(page.getByLabel("Role")).toHaveValue("closer");
    await expect(page.getByLabel("Target pay")).toHaveValue("150000");
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
    await expect(page.getByTestId("market-insights-scope")).toContainText("All Sales");
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
