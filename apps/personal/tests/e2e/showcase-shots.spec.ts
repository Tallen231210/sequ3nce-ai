import { test, reloadApp } from "./fixtures";
import type { Page } from "@playwright/test";

const STORAGE_KEY = "sequ3nce_personal_info";
const VIP_USER = {
  email: "classroom-test-student@sequ3nce.ai", name: "Jordan Reeves",
  closerId: "jd7fa6ct95pe12dn3b73r5qnzs8dkck2", teamId: "js78hxatmwwcsya748n83p1dwh8dk1f6",
  b2cUserId: "nh76z47at12fa0qyw785exdcfn8dkev6", badges: ["vip"],
};
const NON_VIP = {
  email: "classroom-test-outsider@sequ3nce.ai", name: "Test Outsider",
  closerId: "jd71zvggbmjgwcqzznkn9yfy998dkr8x", teamId: "js717zxrrnbra7wa8ybq6zqm418dj17h",
  b2cUserId: "nh7d39r47h604jrbb3rxrsa7218djr4q", badges: [] as string[],
};

async function seed(page: Page, u: typeof VIP_USER | typeof NON_VIP) {
  await page.evaluate(
    ({ key, u }) => {
      localStorage.setItem(key, JSON.stringify({
        closerId: u.closerId, teamId: u.teamId, name: u.name, email: u.email,
        status: "active", onboardingCompleted: true, subscriptionStatus: "active",
        b2cUserId: u.b2cUserId, badges: u.badges,
      }));
    }, { key: STORAGE_KEY, u });
  await reloadApp(page);
}

test("showcase screenshots", async ({ page }) => {
  test.setTimeout(180_000);
  // 1. VIP job board — partner role pinned
  await seed(page, VIP_USER);
  await page.getByRole("button", { name: "Job Board" }).first().click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "test-results/show-jobboard-vip.png" });
  // 2. Community post + VIP chip on the name (Inner Circle w/ founder post)
  await page.getByRole("button", { name: "Community" }).first().click();
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /inner-circle/ }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "test-results/show-inner-circle.png" });
  // 3. Members panel — VIP chip beside the name
  await page.getByRole("button", { name: "Members" }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-results/show-members-chip.png" });
  // 4. Profile — gold check
  await page.getByRole("button", { name: "Profile" }).first().click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "test-results/show-profile-top.png" });
  const gold = page.getByText("Gold Verified");
  if (await gold.count()) {
    await gold.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: "test-results/show-profile-goldcheck.png" });
  }
  // 5. Non-VIP job board — locked teaser
  await seed(page, NON_VIP);
  await page.getByRole("button", { name: "Job Board" }).first().click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "test-results/show-jobboard-teaser.png" });
});
