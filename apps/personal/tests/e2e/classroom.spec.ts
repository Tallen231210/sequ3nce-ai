import { expect, type Page } from "@playwright/test";
import { test, reloadApp } from "./fixtures";

/**
 * Coach Classrooms E2E — real Electron against production Convex, using the
 * dedicated invisible classroom test rig (test coach + test student, both
 * isTestAccount so nothing leaks to real users; test viewers can see test
 * coaches by design).
 */

const STORAGE_KEY = "sequ3nce_personal_info";

const COACH = {
  email: "classroom-test-coach@sequ3nce.ai",
  name: "Test Coach",
  closerId: "jd7d08cdvbhb47y6hgyrq9r47s8dj63r",
  teamId: "js7ddwqc2mf17mb3b1phycny358dja2a",
  b2cUserId: "nh73bgj91gpddewcg8he8zscyx8dkrq9",
};

const STUDENT = {
  email: "classroom-test-student@sequ3nce.ai",
  name: "Test Student",
  closerId: "jd7fa6ct95pe12dn3b73r5qnzs8dkck2",
  teamId: "js78hxatmwwcsya748n83p1dwh8dk1f6",
  b2cUserId: "nh76z47at12fa0qyw785exdcfn8dkev6",
};

async function seedSession(page: Page, user: typeof COACH): Promise<void> {
  await page.evaluate(
    ({ key, u }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          closerId: u.closerId,
          teamId: u.teamId,
          name: u.name,
          email: u.email,
          status: "active",
          onboardingCompleted: true,
          subscriptionStatus: "active",
          b2cUserId: u.b2cUserId,
        }),
      );
    },
    { key: STORAGE_KEY, u: user },
  );
  await reloadApp(page);
}

async function openClassroom(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Community" }).first().click();
  await page.getByRole("button", { name: "Classroom" }).click();
}

test.describe("Coach Classrooms", () => {
  test("coach sees classroom with manage strip, modules, and replay actions", async ({ page }) => {
    await seedSession(page, COACH);
    await openClassroom(page);

    // Header card: name, coach chip, member count
    await expect(page.getByRole("heading", { name: "Test Coach" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Coach", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/member(s)? in this classroom/)).toBeVisible();

    // Existing module from the CLI gauntlet shows in the grid (assert BEFORE
    // opening the manage strip — its <select> holds an invisible <option>
    // with the same text that would win .first())
    await expect(page.getByText("Objection Handling Deep Dives").first()).toBeVisible();

    // Replays shelf with coach curation actions
    await expect(page.getByText("Test Classroom Call").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Share with all users" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to module" }).first()).toBeVisible();

    // Manage strip present and expandable
    await page.getByText("Manage your classroom").click();
    await expect(page.getByPlaceholder(/Module title/)).toBeVisible();
    await expect(page.getByPlaceholder(/Video link/)).toBeVisible();

    await page.screenshot({ path: "test-results/classroom-coach.png", fullPage: false });
  });

  test("student sees content but no manage strip or coach actions", async ({ page }) => {
    await seedSession(page, STUDENT);
    await openClassroom(page);

    await expect(page.getByRole("heading", { name: "Test Coach" })).toBeVisible({ timeout: 15_000 });
    // Student is already a member (joined during backend gauntlet) — no Join button
    await expect(page.getByRole("button", { name: "Join classroom" })).toHaveCount(0);
    // Member view: module visible, replays visible
    await expect(page.getByText("Objection Handling Deep Dives").first()).toBeVisible();
    await expect(page.getByText("Test Classroom Call").first()).toBeVisible();
    // No coach controls
    await expect(page.getByText("Manage your classroom")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Share with all users" })).toHaveCount(0);

    await page.screenshot({ path: "test-results/classroom-student.png", fullPage: false });
  });

  test("module opens to lesson list", async ({ page }) => {
    await seedSession(page, STUDENT);
    await openClassroom(page);
    await page.getByText("Objection Handling Deep Dives").first().click();
    await expect(page.getByText("Back to classroom")).toBeVisible();
    // Lessons from the gauntlet: manual lesson + promoted replay
    await expect(page.getByText("Opening the call")).toBeVisible();
    await page.screenshot({ path: "test-results/classroom-lessons.png", fullPage: false });
  });
});
