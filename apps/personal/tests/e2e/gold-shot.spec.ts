import { test, reloadApp } from "./fixtures";

const STORAGE_KEY = "sequ3nce_personal_info";
test("gold check shot", async ({ page }) => {
  await page.evaluate(({ key }) => {
    localStorage.setItem(key, JSON.stringify({
      closerId: "jd7fa6ct95pe12dn3b73r5qnzs8dkck2", teamId: "js78hxatmwwcsya748n83p1dwh8dk1f6",
      name: "Jordan Reeves", email: "classroom-test-student@sequ3nce.ai",
      status: "active", onboardingCompleted: true, subscriptionStatus: "active",
      b2cUserId: "nh76z47at12fa0qyw785exdcfn8dkev6", badges: ["vip"],
    }));
  }, { key: STORAGE_KEY });
  await reloadApp(page);
  await page.getByRole("button", { name: "Profile" }).first().click();
  await page.waitForTimeout(4000);
  const perf = page.getByText("Performance Stats", { exact: true });
  await perf.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/show-profile-goldcheck.png" });
  const goldCount = await page.getByText("Gold Verified").count();
  console.log("gold visible:", goldCount);
});
