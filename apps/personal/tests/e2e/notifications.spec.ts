import { test, expect, reloadApp } from "./fixtures";
import type { Page } from "@playwright/test";

const STORAGE_KEY = "sequ3nce_personal_info";

// Real accounts on prod Convex — all have subscriptionStatus: "active"
const TYLER = {
  closerId: "jd70a352909s5c4zk6tsmbh0h983r774",
  teamId: "js79941zgxgxtgdyr74ra2g5sx83s11e",
  b2cUserId: "nh73gk1t8k3t111w6f7yh9bxcn83r81v",
  name: "Tyler Allen",
  email: "tyler.allen43@gmail.com",
  badges: ["founder"],
};

const TESTER = {
  closerId: "jd7fzttq6bdvsj51gawpk8vqds8d38dh",
  teamId: "js70r7eksmhbtqacq9c67794ad8d3qxt",
  b2cUserId: "nh76t7zs7q2g9dx91hy4g9r1hd8d32ba",
  name: "Tester Test",
  email: "test@gmail.com",
  badges: [] as string[],
};

const ZION = {
  closerId: "jd79ycv8rn7c24r8zrge59nych83pqbm",
  teamId: "js7dkeav7vtd038yvwewdgawjd83qyv1",
  b2cUserId: "nh79h7pgxrpbx9vmchqz1f6phd83pqmv",
  name: "Zion test",
  email: "zionhernandez42@gmail.com",
  badges: [] as string[],
};

type UserFixture = typeof TYLER;

async function injectAuth(page: Page, user: UserFixture): Promise<void> {
  try {
    await page.evaluate(
      ({ key, info }) => {
        localStorage.setItem(key, JSON.stringify(info));
      },
      {
        key: STORAGE_KEY,
        info: {
          closerId: user.closerId,
          teamId: user.teamId,
          name: user.name,
          email: user.email,
          status: "active",
          onboardingCompleted: true,
          subscriptionStatus: "active",
          b2cUserId: user.b2cUserId,
          badges: user.badges,
          onboardingCompleted: true,
        },
      }
    );
  } catch {
    // Page may be on about:blank — reload first, then inject
    await reloadApp(page);
    await page.evaluate(
      ({ key, info }) => {
        localStorage.setItem(key, JSON.stringify(info));
      },
      {
        key: STORAGE_KEY,
        info: {
          closerId: user.closerId,
          teamId: user.teamId,
          name: user.name,
          email: user.email,
          status: "active",
          onboardingCompleted: true,
          subscriptionStatus: "active",
          b2cUserId: user.b2cUserId,
          badges: user.badges,
          onboardingCompleted: true,
        },
      }
    );
  }
  await reloadApp(page);
  // Wait for sidebar to appear as the authed marker.
  // Short timeout so we can dump diagnostics before the outer test timeout kills the page.
  try {
    await page.waitForSelector('text=Dashboard', { timeout: 30_000 });
  } catch (err) {
    let snippet = "<unavailable>";
    let url = "<unavailable>";
    try {
      url = page.url();
      const bodyText = await page.textContent("body");
      snippet = (bodyText || "").slice(0, 800);
    } catch {}
    // Also screenshot for visual diagnosis
    try { await page.screenshot({ path: `/tmp/e2e-fail-${Date.now()}.png` }); } catch {}
    throw new Error(`injectAuth failed to reach Dashboard.\nURL: ${url}\nBody snippet: ${snippet}`);
  }
}

async function waitForTab(page: Page, label: string) {
  await page.waitForSelector(`text="${label}"`, { timeout: 10_000 });
}

// Sidebar nav click — targets the <button> with the label, more reliable than text-only locator
async function clickSidebarTab(page: Page, label: string): Promise<void> {
  // Wait for any render settling first
  await page.waitForTimeout(400);
  const btn = page.locator(`nav button:has-text("${label}")`).first();
  await btn.waitFor({ state: 'visible', timeout: 15_000 });
  await btn.click({ timeout: 10_000 });
  await page.waitForTimeout(500);
}

test.describe("Team Notifications — end-to-end", () => {
  // Sequential test flow: each step in its own test so failures are isolated + visible
  test.describe.configure({ mode: "serial" });

  test("1. founder sees Notifications sidebar tab", async ({ page }) => {
    await injectAuth(page, TYLER);
    await waitForTab(page, "Notifications");
  });

  test("2. non-founder user does NOT see Notifications tab", async ({ page }) => {
    await injectAuth(page, TESTER);
    // Small wait for sidebar to render fully
    await page.waitForTimeout(500);
    const visible = await page.locator('nav >> text="Notifications"').first().isVisible().catch(() => false);
    expect(visible).toBeFalsy();
  });

  test("3. founder composes + sends replies-on notification to Tester", async ({ page }) => {
    await injectAuth(page, TYLER);
    await clickSidebarTab(page, "Notifications");
    await page.waitForSelector('text="Send Notification"', { timeout: 10_000 });

    // Specific-users mode is default
    // Type in recipient search
    const searchInput = page.locator('input[placeholder="Search members…"]').first();
    await searchInput.click();
    await searchInput.fill("Tester");
    await page.waitForTimeout(600); // debounce

    // Click the Tester row
    const testerRow = page.locator('button:has-text("Tester Test")').first();
    await testerRow.click({ timeout: 10_000 });

    // Chip should show
    await expect(page.locator('text="Tester Test"').first()).toBeVisible();

    // Fill body
    const bodyBox = page.locator('textarea[placeholder="Type your announcement…"]').first();
    await bodyBox.fill("E2E TEST: replies-on notification from Tyler");

    // Toggle Allow replies
    const allowRepliesCheckbox = page.locator('input[type="checkbox"]').first();
    await allowRepliesCheckbox.check();

    // Send
    const sendBtn = page.locator('button:has-text("Send to 1 recipient")').first();
    await sendBtn.click();

    // Wait for success toast
    await page.waitForSelector('text=Sent to 1 recipient', { timeout: 15_000 });
  });

  test("4. history panel shows the sent notification", async ({ page }) => {
    await injectAuth(page, TYLER);
    await clickSidebarTab(page, "Notifications");
    await page.waitForSelector('text="Sent notifications"', { timeout: 10_000 });
    await expect(page.locator('text="E2E TEST: replies-on notification from Tyler"').first()).toBeVisible({ timeout: 10_000 });
    // Read count should be 0 out of 1 initially (recipient hasn't opened yet)
    await expect(page.locator('text=/0 \\/ 1 seen/').first()).toBeVisible();
  });

  test("5. tester sees Sequ3nce Team thread in Messages with replies enabled", async ({ page }) => {
    await injectAuth(page, TESTER);
    await clickSidebarTab(page, "Messages");
    await page.waitForSelector('text="Sequ3nce Team"', { timeout: 15_000 });

    // Click the thread
    await page.locator('button:has-text("Sequ3nce Team")').first().click();
    await page.waitForTimeout(800);

    // Verify message body is visible
    await expect(page.locator('text="E2E TEST: replies-on notification from Tyler"').first()).toBeVisible({ timeout: 10_000 });

    // Reply input should be visible
    const replyInput = page.locator('textarea[placeholder="Type a message..."]').first();
    await expect(replyInput).toBeVisible();
  });

  test("6. tester replies; reply posts successfully", async ({ page }) => {
    await injectAuth(page, TESTER);
    await clickSidebarTab(page, "Messages");
    await page.waitForSelector('text="Sequ3nce Team"', { timeout: 15_000 });
    await page.locator('button:has-text("Sequ3nce Team")').first().click();
    await page.waitForTimeout(800);

    const replyInput = page.locator('textarea[placeholder="Type a message..."]').first();
    await replyInput.fill("E2E REPLY from Tester: got it, here are my details");
    const sendBtn = page.locator('button:has-text("Send")').first();
    await sendBtn.click();

    // Wait for the reply to appear in the thread
    await expect(page.locator('text="E2E REPLY from Tester: got it, here are my details"').first()).toBeVisible({ timeout: 10_000 });
  });

  test("7. founder composes + sends replies-OFF notification to Zion", async ({ page }) => {
    await injectAuth(page, TYLER);
    await clickSidebarTab(page, "Notifications");
    await page.waitForSelector('text="Send Notification"', { timeout: 10_000 });

    const searchInput = page.locator('input[placeholder="Search members…"]').first();
    await searchInput.click();
    await searchInput.fill("Zion test");
    await page.waitForTimeout(600);

    // Click first matching Zion test row
    const zionRow = page.locator('button:has-text("Zion test")').first();
    await zionRow.click({ timeout: 10_000 });

    const bodyBox = page.locator('textarea[placeholder="Type your announcement…"]').first();
    await bodyBox.fill("E2E TEST: one-way announcement (no replies)");

    // Leave replies OFF (default)
    const sendBtn = page.locator('button:has-text("Send to 1 recipient")').first();
    await sendBtn.click();
    await page.waitForSelector('text=Sent to 1 recipient', { timeout: 15_000 });
  });

  test("8. zion sees announcement with reply input HIDDEN", async ({ page }) => {
    await injectAuth(page, ZION);
    await clickSidebarTab(page, "Messages");
    await page.waitForSelector('text="Sequ3nce Team"', { timeout: 15_000 });
    await page.locator('button:has-text("Sequ3nce Team")').first().click();
    await page.waitForTimeout(800);

    await expect(page.locator('text="E2E TEST: one-way announcement (no replies)"').first()).toBeVisible();
    await expect(page.locator('text="— announcement —"').first()).toBeVisible();
    // Reply textarea should not exist
    const replyInput = page.locator('textarea[placeholder="Type a message..."]');
    await expect(replyInput).toHaveCount(0);
  });

  test("9. founder sees Tester's reply in Sequ3nce Inbox section", async ({ page }) => {
    await injectAuth(page, TYLER);
    await clickSidebarTab(page, "Messages");
    await page.waitForTimeout(1000);

    // Sequ3nce Inbox section header is founder-only
    await expect(page.locator('text="Sequ3nce Inbox"').first()).toBeVisible({ timeout: 10_000 });

    // Tester Test row should appear in the inbox
    await expect(page.locator('button:has-text("Tester Test")').first()).toBeVisible();
  });

  test("10. founder opens Sequ3nce Inbox thread + sees conversation history", async ({ page }) => {
    await injectAuth(page, TYLER);
    await clickSidebarTab(page, "Messages");
    await page.waitForTimeout(1000);
    // Click the Tester row in Sequ3nce Inbox
    await page.locator('button:has-text("Tester Test")').first().click();
    await page.waitForTimeout(800);

    // Should see the team-sent message AND the reply
    await expect(page.locator('text="E2E TEST: replies-on notification from Tyler"').first()).toBeVisible();
    await expect(page.locator('text="E2E REPLY from Tester: got it, here are my details"').first()).toBeVisible();

    // Banner should read "Replying as Sequ3nce Team"
    await expect(page.locator('text="Replying as Sequ3nce Team"').first()).toBeVisible();
  });

  test("11. founder replies to Tester as Sequ3nce Team", async ({ page }) => {
    await injectAuth(page, TYLER);
    await clickSidebarTab(page, "Messages");
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Tester Test")').first().click();
    await page.waitForTimeout(800);

    const replyInput = page.locator('textarea[placeholder="Reply as Sequ3nce Team…"]').first();
    await replyInput.fill("E2E FOUNDER REPLY: thanks — we'll ship it");
    const sendBtn = page.locator('button:has-text("Send")').first();
    await sendBtn.click();

    await expect(page.locator('text="E2E FOUNDER REPLY: thanks — we\'ll ship it"').first()).toBeVisible({ timeout: 10_000 });
  });

  test("12. tester sees founder follow-up as Sequ3nce Team", async ({ page }) => {
    await injectAuth(page, TESTER);
    await clickSidebarTab(page, "Messages");
    await page.waitForSelector('text="Sequ3nce Team"', { timeout: 15_000 });
    await page.locator('button:has-text("Sequ3nce Team")').first().click();
    await page.waitForTimeout(1000);

    // The follow-up should appear with Sequ3nce Team branding (via teamSentBy)
    await expect(page.locator('text="E2E FOUNDER REPLY: thanks — we\'ll ship it"').first()).toBeVisible({ timeout: 10_000 });
  });

  test("13. validation: cannot send with empty body", async ({ page }) => {
    await injectAuth(page, TYLER);
    await clickSidebarTab(page, "Notifications");
    await page.waitForSelector('text="Send Notification"', { timeout: 10_000 });

    // Select a recipient first
    const searchInput = page.locator('input[placeholder="Search members…"]').first();
    await searchInput.click();
    await searchInput.fill("Tester");
    await page.waitForTimeout(600);
    await page.locator('button:has-text("Tester Test")').first().click({ timeout: 10_000 });

    // Leave body empty — send button should be disabled
    const sendBtn = page.locator('button:has-text("Send to 1 recipient")').first();
    await expect(sendBtn).toBeDisabled();
  });
});
