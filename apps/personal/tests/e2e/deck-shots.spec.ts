import { test, reloadApp } from "./fixtures";
import type { Page } from "@playwright/test";

const STORAGE_KEY = "sequ3nce_personal_info";
const STUDENT = {
  email: "classroom-test-student@sequ3nce.ai",
  name: "Jordan Reeves",
  closerId: "jd7fa6ct95pe12dn3b73r5qnzs8dkck2",
  teamId: "js78hxatmwwcsya748n83p1dwh8dk1f6",
  b2cUserId: "nh76z47at12fa0qyw785exdcfn8dkev6",
};

test("capture deck screenshots", async ({ page }) => {
  test.setTimeout(180_000);
  await page.evaluate(
    ({ key, u }) => {
      localStorage.setItem(key, JSON.stringify({
        closerId: u.closerId, teamId: u.teamId, name: u.name, email: u.email,
        status: "active", onboardingCompleted: true, subscriptionStatus: "active",
        b2cUserId: u.b2cUserId,
      }));
    },
    { key: STORAGE_KEY, u: STUDENT },
  );
  await reloadApp(page);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "test-results/deck-dashboard.png" });

  await page.getByRole("button", { name: "Stats" }).first().click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "test-results/deck-stats.png" });

  await page.getByRole("button", { name: "Calls" }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-results/deck-calls.png" });

  await page.getByRole("button", { name: "Job Board" }).first().click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "test-results/deck-jobboard.png" });

  await page.getByRole("button", { name: "Community" }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-results/deck-community.png" });

  await page.getByRole("button", { name: "Classroom" }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-results/deck-classroom.png" });
});
