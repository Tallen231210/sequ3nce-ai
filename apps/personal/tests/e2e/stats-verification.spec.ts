import { test, expect, reloadApp } from "./fixtures";
import type { Page } from "@playwright/test";
import { execSync } from "node:child_process";
import path from "node:path";

const STORAGE_KEY = "sequ3nce_personal_info";

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

type UserFixture = typeof TYLER;

// Known-valid 1x1 transparent PNG — works with createImageBitmap (the compressor
// output is JPEG regardless of input format)
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function tinyImageBuffer(): Buffer {
  return Buffer.from(TINY_PNG_BASE64, "base64");
}

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
  try {
    await page.waitForSelector("text=Dashboard", { timeout: 30_000 });
  } catch (err) {
    const bodyText = await page.textContent("body").catch(() => "<unavailable>");
    const snippet = (bodyText || "").slice(0, 500);
    throw new Error(`injectAuth failed to reach Dashboard for ${user.name}. Body: ${snippet}`);
  }
}

async function clickSidebarTab(page: Page, label: string): Promise<void> {
  await page.waitForTimeout(400);
  const btn = page.locator(`nav button:has-text("${label}")`).first();
  await btn.waitFor({ state: "visible", timeout: 30_000 });
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ timeout: 10_000 });
  await page.waitForTimeout(600);
}

// Convex run lives in the web app workspace, which is where the Convex project is configured.
const CONVEX_WEB = path.resolve(__dirname, "../../../../apps/web");

function cleanupTesterState(): void {
  try {
    execSync(
      `npx convex run --prod b2cStatsVerification:adminCleanupUserVerificationData '${JSON.stringify(
        { callerId: TYLER.b2cUserId, targetUserId: TESTER.b2cUserId }
      )}'`,
      { cwd: CONVEX_WEB, stdio: "pipe" }
    );
  } catch (err) {
    console.warn("[test-setup] State cleanup failed (continuing anyway):", (err as Error).message);
  }
}

test.describe("Stats Verification — end-to-end", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    // Reset Tester's verification state to guarantee a clean run each time
    cleanupTesterState();
    // The founder-approval step patches isManuallyVerified on the tester's
    // PROFILE row — which only exists if one was ever saved. Fresh test
    // accounts have none, so seed it.
    await fetch("https://ideal-ram-982.convex.site/b2c/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: TESTER.b2cUserId,
        statsSource: "manual",
        manualStats: { cashCollected: 100000, closeRate: 25, callsCompleted: 100 },
      }),
    });
  });

  test("1. founder sees 'Verification Review' sidebar tab", async ({ page }) => {
    await injectAuth(page, TYLER);
    await page.waitForSelector(`text="Verification Review"`, { timeout: 10_000 });
  });

  test("2. non-founder does NOT see 'Verification Review' tab", async ({ page }) => {
    await injectAuth(page, TESTER);
    await page.waitForTimeout(600);
    const visible = await page
      .locator('nav >> text="Verification Review"')
      .first()
      .isVisible()
      .catch(() => false);
    expect(visible).toBeFalsy();
  });

  test("3. Profile → Manual shows verification-status block (submit button OR pending state)", async ({ page }) => {
    await injectAuth(page, TESTER);
    await clickSidebarTab(page, "Profile");

    // Scroll down and click the Manual stats toggle
    const manualBtn = page.locator('button:has-text("Manual")').first();
    await manualBtn.waitFor({ state: "visible", timeout: 10_000 });
    await manualBtn.click();

    // VerificationStatusBlock renders one of 3 states — all valid:
    //   - "Submit for verification" button (no prior request)
    //   - "Verification pending" (pending request exists from a prior run)
    //   - "Your stats have been verified by Sequ3nce." (already approved)
    // All three prove the block mounted; any of them is a pass.
    await page.waitForFunction(
      () => {
        const t = document.body.textContent ?? "";
        return (
          t.includes("Submit for verification") ||
          t.includes("Verification pending") ||
          t.includes("Your stats have been verified")
        );
      },
      { timeout: 15_000 }
    );
  });

  test("4. opening submission modal — fields + anti-fraud warning visible", async ({ page }) => {
    await injectAuth(page, TESTER);
    await clickSidebarTab(page, "Profile");
    await page.locator('button:has-text("Manual")').first().click();
    await page.locator('button:has-text("Submit for verification")').first().click();

    // Modal title — there are 2 matches (Profile button + modal H2), just assert count
    await expect(page.locator('text=Submit for verification')).toHaveCount(3, { timeout: 10_000 });
    // Modal-specific: placeholder inputs are unique to the modal
    await expect(page.locator('input[placeholder="50000"]').first()).toBeVisible();
    await expect(page.locator('input[placeholder="35"]').first()).toBeVisible();
    await expect(page.locator('input[placeholder="250"]').first()).toBeVisible();
    // Evidence fields (hint copy is unique to modal)
    await expect(page.locator('text=Upload 1-6 screenshots').first()).toBeVisible();
    await expect(page.locator('text=Close rate and call volume').first()).toBeVisible();
    // Anti-fraud warning
    await expect(page.locator('text=We verify every submission').first()).toBeVisible();
    // Submit button in modal footer should be disabled
    const submitBtn = page.locator('button:has-text("Submit for verification")').last();
    await expect(submitBtn).toBeDisabled();

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  test("5. user submits a verification request end-to-end", async ({ page }) => {
    await injectAuth(page, TESTER);
    await clickSidebarTab(page, "Profile");
    await page.locator('button:has-text("Manual")').first().click();
    await page.locator('button:has-text("Submit for verification")').first().click();

    // Fill claimed stats
    const cashInput = page.locator('input[placeholder="50000"]');
    await cashInput.fill("75000");
    const closeRateInput = page.locator('input[placeholder="35"]');
    await closeRateInput.fill("42");
    const callsInput = page.locator('input[placeholder="250"]');
    await callsInput.fill("310");

    // Upload a pay stub (set files on the modal's pay-stub input specifically —
    // there's also a ProfilePhotoUpload input on the Profile page behind the modal)
    const payStubInput = page.locator('[data-testid="evidence-paystubs-input"]');
    await payStubInput.setInputFiles([
      { name: "paystub1.png", mimeType: "image/png", buffer: tinyImageBuffer() },
    ]);
    // Wait for upload to complete — thumbnail image appears
    try {
      await page.waitForSelector('img[alt="Evidence 1"]', { timeout: 30_000 });
    } catch (err) {
      // Dump any upload error text for diagnosis
      const errorText = await page.locator('.text-red-600, .text-red-400').first().textContent().catch(() => null);
      const bodyText = await page.textContent('body').catch(() => '');
      await page.screenshot({ path: `/tmp/stats-upload-fail-${Date.now()}.png` }).catch(() => {});
      throw new Error(`Pay stub thumbnail never appeared. Error shown: ${errorText}. Body preview: ${(bodyText || '').slice(0, 300)}`);
    }

    // Optional context — target the modal's textarea specifically via its placeholder
    await page
      .locator('textarea[placeholder^="e.g. Last 3 months"]')
      .fill("E2E test — $75k over last 90 days at Agency X");

    // Submit
    const submitBtn = page.locator('button:has-text("Submit for verification")').last();
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
    await submitBtn.click();

    // Wait for the modal to close (meaning submit succeeded) — check for pending state
    await page.waitForSelector('text=Verification pending', { timeout: 20_000 });
  });

  test("6. double-submit blocked — Pending state replaces Submit button", async ({ page }) => {
    await injectAuth(page, TESTER);
    await clickSidebarTab(page, "Profile");
    await page.locator('button:has-text("Manual")').first().click();
    // Should show "Verification pending" not a clickable Submit button
    await page.waitForSelector('text=Verification pending', { timeout: 10_000 });
    const submitBtn = page.locator('button:has-text("Submit for verification")').first();
    await expect(submitBtn).toHaveCount(0);
  });

  test("7. founder sees pending request in Verification Review queue", async ({ page }) => {
    await injectAuth(page, TYLER);
    await clickSidebarTab(page, "Verification Review");
    await page.waitForSelector('text=Verification Review', { timeout: 10_000 });

    // Pending request should show Tester's name
    await expect(page.locator('button:has-text("Tester Test")').first()).toBeVisible({ timeout: 15_000 });
  });

  test("8. founder expands + approves the request", async ({ page }) => {
    await injectAuth(page, TYLER);
    await clickSidebarTab(page, "Verification Review");
    await page.waitForTimeout(800);

    // Click Tester's row to expand
    await page.locator('button:has-text("Tester Test")').first().click();
    await page.waitForTimeout(600);

    // Claimed stats visible
    await expect(page.locator('text=$75k').first()).toBeVisible();
    await expect(page.locator('text=42%').first()).toBeVisible();
    await expect(page.locator('text=310').first()).toBeVisible();

    // Context visible
    await expect(page.locator('text=E2E test — $75k').first()).toBeVisible();

    // Approve — use exact-match regex so we don't accidentally click the
    // lowercase "approved" tab filter button (has-text is substring-based)
    const approveBtn = page.locator('button', { hasText: /^Approve$/ }).first();
    await approveBtn.click();

    // After approval, the row should be removed from the Pending tab.
    // Wait up to 10s for the queue to refresh (list reloads on onActionComplete callback).
    await expect(page.locator('button:has-text("Tester Test")')).toHaveCount(0, { timeout: 10_000 });
  });

  test("9. tester's profile shows 'Verified by Sequ3nce' badge after approval", async ({ page }) => {
    await injectAuth(page, TESTER);
    await clickSidebarTab(page, "Profile");
    await page.locator('button:has-text("Manual")').first().click();
    // The VerificationStatusBlock renders this exact string when isManuallyVerified=true
    await expect(page.locator('text=Your stats have been verified by Sequ3nce').first()).toBeVisible({ timeout: 15_000 });
  });

  test("10. tester receives approval DM in Messages from Sequ3nce Team", async ({ page }) => {
    await injectAuth(page, TESTER);
    // Messages is a titlebar slide-out panel, not a sidebar tab
    await page.locator('button[title="Messages"]').first().click();
    await page.waitForSelector('text=Sequ3nce Team', { timeout: 20_000 });
    await page.locator('button:has-text("Sequ3nce Team")').first().click();
    await page.waitForTimeout(1200);
    await expect(page.locator('text=Your Sequ3nce stats have been verified').first()).toBeVisible({ timeout: 15_000 });
  });

  test("11. reject flow — tester resubmits, founder rejects, tester sees rejection DM", async ({ page }) => {
    // Reset state so Tester has no pending/approved request (starts fresh for this scenario)
    execSync(
      `npx convex run --prod b2cStatsVerification:adminCleanupUserVerificationData '${JSON.stringify(
        { callerId: TYLER.b2cUserId, targetUserId: TESTER.b2cUserId }
      )}'`,
      { cwd: CONVEX_WEB, stdio: "pipe" }
    );

    // Step A: Tester submits a new request
    await injectAuth(page, TESTER);
    await clickSidebarTab(page, "Profile");
    await page.locator('button:has-text("Manual")').first().click();
    await page.locator('button:has-text("Submit for verification")').first().click();
    await page.locator('input[placeholder="50000"]').fill("100000");
    await page.locator('input[placeholder="35"]').fill("50");
    await page.locator('input[placeholder="250"]').fill("400");
    await page
      .locator('[data-testid="evidence-paystubs-input"]')
      .setInputFiles([
        { name: "paystub-reject.png", mimeType: "image/png", buffer: tinyImageBuffer() },
      ]);
    await page.waitForSelector('img[alt="Evidence 1"]', { timeout: 30_000 });
    const submitBtn = page.locator('button:has-text("Submit for verification")').last();
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
    await submitBtn.click();
    await page.waitForSelector('text=Verification pending', { timeout: 20_000 });

    // Step B: founder rejects with a reason
    await injectAuth(page, TYLER);
    await clickSidebarTab(page, "Verification Review");
    await page.waitForTimeout(600);
    await page.locator('button:has-text("Tester Test")').first().click();
    await page.waitForTimeout(400);
    // Exact-match to avoid matching the lowercase "rejected" tab filter
    await page.locator('button', { hasText: /^Reject$/ }).first().click();
    const reasonTextarea = page.locator('textarea[placeholder*="Explain why"]');
    await reasonTextarea.fill("E2E reject test — pay stub doesn't match the claimed cash.");
    await page.locator('button:has-text("Reject + send reason")').first().click();
    // Row removed from Pending
    await expect(page.locator('button:has-text("Tester Test")')).toHaveCount(0, { timeout: 10_000 });

    // Step C: tester sees the rejection message in Sequ3nce Inbox thread
    await injectAuth(page, TESTER);
    await page.locator('button[title="Messages"]').first().click();
    await page.waitForSelector('text=Sequ3nce Team', { timeout: 20_000 });
    await page.locator('button:has-text("Sequ3nce Team")').first().click();
    await page.waitForTimeout(1200);
    await expect(
      page.locator("text=Your Sequ3nce stats verification submission couldn't be approved").first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=E2E reject test").first()).toBeVisible();
  });

  test("12. lightbox opens when founder clicks an evidence thumbnail", async ({ page }) => {
    // Tester already has a rejected request from test 11; need to submit a fresh pending
    // one so the founder queue has an entry with visible thumbnails.
    await injectAuth(page, TESTER);
    await clickSidebarTab(page, "Profile");
    await page.locator('button:has-text("Manual")').first().click();
    await page.locator('button:has-text("Submit for verification")').first().click();
    await page.locator('input[placeholder="50000"]').fill("33333");
    await page
      .locator('[data-testid="evidence-paystubs-input"]')
      .setInputFiles([
        { name: "paystub-lightbox.png", mimeType: "image/png", buffer: tinyImageBuffer() },
      ]);
    await page.waitForSelector('img[alt="Evidence 1"]', { timeout: 30_000 });
    await page.locator('button:has-text("Submit for verification")').last().click();
    await page.waitForSelector('text=Verification pending', { timeout: 20_000 });

    // Switch to founder → open the card → click the first thumbnail
    await injectAuth(page, TYLER);
    await clickSidebarTab(page, "Verification Review");
    await page.waitForTimeout(600);
    await page.locator('button:has-text("Tester Test")').first().click();
    await page.waitForTimeout(500);
    const firstStubThumb = page.locator('img[alt="Pay stub 1"]').first();
    await firstStubThumb.click();

    // Lightbox container has bg-black/80 and z-[60] — assert the Close button appears
    await expect(page.locator('button[aria-label="Close"]').first()).toBeVisible({ timeout: 5_000 });
    // Close via the X button
    await page.locator('button[aria-label="Close"]').first().click();
  });
});
