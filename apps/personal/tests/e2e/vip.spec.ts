import { expect, type Page } from "@playwright/test";
import { test, reloadApp } from "./fixtures";

const STORAGE_KEY = "sequ3nce_personal_info";
const VIP_USER = {
  email: "classroom-test-student@sequ3nce.ai",
  name: "Jordan Reeves",
  closerId: "jd7fa6ct95pe12dn3b73r5qnzs8dkck2",
  teamId: "js78hxatmwwcsya748n83p1dwh8dk1f6",
  b2cUserId: "nh76z47at12fa0qyw785exdcfn8dkev6",
  badges: ["vip"],
};
const NON_VIP = {
  email: "classroom-test-outsider@sequ3nce.ai",
  name: "Test Outsider",
  closerId: "jd71zvggbmjgwcqzznkn9yfy998dkr8x",
  teamId: "js717zxrrnbra7wa8ybq6zqm418dj17h",
  b2cUserId: "nh7d39r47h604jrbb3rxrsa7218djr4q",
  badges: [] as string[],
};

async function seed(page: Page, u: typeof VIP_USER | typeof NON_VIP) {
  await page.evaluate(
    ({ key, u }) => {
      localStorage.setItem(key, JSON.stringify({
        closerId: u.closerId, teamId: u.teamId, name: u.name, email: u.email,
        status: "active", onboardingCompleted: true, subscriptionStatus: "active",
        b2cUserId: u.b2cUserId, badges: u.badges,
      }));
    },
    { key: STORAGE_KEY, u },
  );
  await reloadApp(page);
}

test.describe("VIP tier", () => {
  test("VIP sees Inner Circle and can open it", async ({ page }) => {
    await seed(page, VIP_USER);
    await page.getByRole("button", { name: "Community" }).first().click();
    await page.waitForTimeout(2500);
    const ic = page.getByRole("button", { name: /inner-circle/ });
    await expect(ic).toBeVisible({ timeout: 10_000 });
    await ic.click();
    await expect(page.getByText("Welcome to The Inner Circle").first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/vip-inner-circle.png" });
  });

  test("VIP chip shows in members panel", async ({ page }) => {
    await seed(page, VIP_USER);
    await page.getByRole("button", { name: "Community" }).first().click();
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: "Members" }).first().click();
    await page.waitForTimeout(2500);
    await expect(page.getByText("VIP", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/vip-members-chip.png" });
  });

  test("VIP on the Line sees the waiting room", async ({ page }) => {
    await seed(page, VIP_USER);
    await page.getByRole("button", { name: "Job Board" }).first().click();
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Internal" }).click();
    await page.waitForTimeout(2500);
    await expect(page.getByText("You're on The Placement Line")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Quiet weeks are normal")).toBeVisible();
    await page.screenshot({ path: "test-results/vip-placement-line.png" });
  });

  test("non-VIP: no Inner Circle; internal tab shows the pitch", async ({ page }) => {
    await seed(page, NON_VIP);
    await page.getByRole("button", { name: "Community" }).first().click();
    await page.waitForTimeout(2500);
    await expect(page.getByRole("button", { name: /inner-circle/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Job Board" }).first().click();
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Internal" }).click();
    await page.waitForTimeout(2000);
    await expect(page.getByText("Reserved for Yearly (VIP) members")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/nonvip-placement-pitch.png" });
  });
});
