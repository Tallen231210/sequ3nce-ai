import { test, reloadApp } from "./fixtures";
import type { Page } from "@playwright/test";

const STORAGE_KEY = "sequ3nce_personal_info";
const COACH = {
  email: "classroom-test-coach@sequ3nce.ai",
  name: "Test Coach",
  closerId: "jd7d08cdvbhb47y6hgyrq9r47s8dj63r",
  teamId: "js7ddwqc2mf17mb3b1phycny358dja2a",
  b2cUserId: "nh73bgj91gpddewcg8he8zscyx8dkrq9",
};

test("capture handout screenshots", async ({ page }) => {
  await page.evaluate(
    ({ key, u }) => {
      localStorage.setItem(key, JSON.stringify({
        closerId: u.closerId, teamId: u.teamId, name: u.name, email: u.email,
        status: "active", onboardingCompleted: true, subscriptionStatus: "active",
        b2cUserId: u.b2cUserId, badges: ["coach"],
      }));
    },
    { key: STORAGE_KEY, u: COACH },
  );
  await reloadApp(page);
  await page.getByRole("button", { name: "Community" }).first().click();
  await page.getByRole("button", { name: "Classroom" }).click();
  await page.getByText("Test Classroom Call").first().waitFor({ timeout: 15000 });
  // Manage strip open
  await page.getByText("Manage your classroom").click();
  await page.getByPlaceholder(/Module title/).waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/shot-manage.png" });
  await page.getByText("Manage your classroom").click();
  // Replays shelf close-up
  await page.getByText("Call replays").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/shot-replays.png" });
  // Coaching tab (where calls get scheduled)
  await page.getByRole("button", { name: "Coaching" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/shot-coaching.png" });
});
