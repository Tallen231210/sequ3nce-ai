import {
  test,
  expect,
  resetToAuthenticated,
  reloadApp,
} from "./fixtures";

const outageMode = process.env.FREEHIRE_RESILIENCE_TEST;

test.describe("FreeHire outage resilience", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!outageMode, "Run with FREEHIRE_RESILIENCE_TEST=curated or unavailable");
    await resetToAuthenticated(page);
    await reloadApp(page);
    await page.getByRole("button", { name: "Job Board" }).first().click();
    await expect(page.getByTestId("freehire-job-board")).toBeVisible({ timeout: 20_000 });
  });

  test("keeps the curated catalogue usable when the external catalogue fails", async ({ page }) => {
    test.skip(outageMode !== "curated", "Run with FREEHIRE_RESILIENCE_TEST=curated");

    const cards = page.getByTestId("freehire-job-card");
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });
    expect(await cards.count()).toBeGreaterThan(0);
    const ids = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-job-id") || ""),
    );
    expect(ids.every((id) => id.startsWith("sequ3nce:"))).toBe(true);
    await expect(page.getByText("Job board temporarily unavailable", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("limited-catalogue-notice")).toBeVisible();
    await expect(page.getByTestId("limited-catalogue-notice")).toContainText("Some job listings are temporarily unavailable");
    await expect(page.getByTestId("matching-role-count-label")).toHaveText("available now");
    await expect(page.getByText("Limited results", { exact: true })).toBeVisible();
  });

  test("loads the catalogue through the authenticated Sequ3nce proxy", async ({ page }) => {
    test.skip(outageMode !== "proxy", "Run with FREEHIRE_RESILIENCE_TEST=proxy");
    const siteUrl = process.env.FREEHIRE_DEV_CONVEX_SITE_URL;
    if (!siteUrl) throw new Error("FREEHIRE_DEV_CONVEX_SITE_URL is required for the proxy test");

    const loginResponse = await fetch(`${siteUrl.replace(/\/+$/, "")}/b2c/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "pw-test@sequ3nce.ai", password: "PlaywrightTest2024" }),
    });
    const login = await loginResponse.json() as { closer?: { sessionToken?: string } };
    const sessionToken = login.closer?.sessionToken;
    if (!sessionToken) throw new Error("Development login did not return a session token");

    await page.evaluate(({ token }) => {
      const key = "sequ3nce_personal_info";
      const current = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...current, sessionToken: token }));
    }, { token: sessionToken });
    await reloadApp(page);
    await page.getByRole("button", { name: "Job Board" }).first().click();
    await expect(page.getByTestId("freehire-job-card").first()).toBeVisible({ timeout: 20_000 });
    const ids = await page.getByTestId("freehire-job-card").evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-job-id") || ""),
    );
    expect(ids.some((id) => !id.startsWith("sequ3nce:"))).toBe(true);
    await expect(page.getByTestId("limited-catalogue-notice")).toHaveCount(0);
    await expect(page.getByTestId("matching-role-count-label")).toHaveText("matching roles");
  });

  test("uses neutral product copy when every catalogue source is unavailable", async ({ page }) => {
    test.skip(outageMode !== "unavailable", "Run with FREEHIRE_RESILIENCE_TEST=unavailable");

    await expect(page.getByText("Job board temporarily unavailable", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("We’re making a few improvements. Please check back soon.", { exact: true })).toBeVisible();
    await expect(page.getByText(/FreeHire returned|HTTP 4\d\d/i)).toHaveCount(0);
  });
});
