import {
  test,
  expect,
  resetToAuthenticated,
  reloadApp,
  TEST_USER,
} from "./fixtures";
import { consolidateDuplicateJobs } from "../../src/freehire-dedupe";

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
          || key?.startsWith("sequ3nce:dev-interview-sessions:")
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

  test("returns a filled, consolidated page and advances the upstream cursor", async ({ page }) => {
    const firstPage = await page.evaluate(() => window.electron.freeHire.search({
      lane: "sales",
      limit: 24,
      offset: 0,
    }));

    expect(firstPage.jobs.length).toBeGreaterThanOrEqual(24);
    expect(firstPage.nextOffset).toBeGreaterThan(0);
    expect(firstPage.jobs.every((job) => job.sources.length > 0)).toBe(true);
    expect(consolidateDuplicateJobs(firstPage.jobs)).toHaveLength(firstPage.jobs.length);

    const secondPage = await page.evaluate((offset) => window.electron.freeHire.search({
      lane: "sales",
      limit: 24,
      offset,
    }), firstPage.nextOffset ?? 24);
    expect(secondPage.nextOffset).toBeGreaterThan(firstPage.nextOffset ?? 0);
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

  test("opens the development interview room and completes the preview flow", async ({ page }) => {
    await page.getByTestId("freehire-job-card").first().getByTestId("open-job").click();
    await page.getByTestId("practice-interview").click();

    const room = page.getByTestId("interview-practice-room");
    await expect(room).toBeVisible();
    await expect(room.getByText("Set up your interview room")).toBeVisible();
    await expect(room.getByText("Development preview")).toBeVisible();
    await expect(room.getByTestId("sequ3nce-interviewer")).toBeVisible();
    await expect(room.getByTestId("interview-self-view")).toBeVisible();
    await expect(room.getByTestId("unlock-interview-devices")).toHaveText("Choose devices");
    await expect(room.getByRole("combobox", { name: "Interview Camera" })).toBeDisabled();
    await expect(room.getByRole("combobox", { name: "Interview Microphone" })).toBeDisabled();

    await room.getByRole("button", { name: /Guided answer practice/ }).click();
    await room.getByRole("button", { name: "Sales role-play" }).click();
    await room.getByRole("button", { name: "10 min" }).click();
    await room.getByTestId("enter-interview").click();
    await expect(room.getByText("Sales role-play").first()).toBeVisible();
    await expect(room.getByTestId("sequ3nce-interviewer")).toBeVisible();
    await expect(room.getByTestId("interview-self-view")).toBeVisible();
    const initialQuestion = await room.getByTestId("interview-current-question").textContent();

    await room.getByRole("button", { name: "Pause interview" }).click();
    await expect(room.getByText("Interview paused", { exact: true })).toBeVisible();
    await room.getByTestId("resume-interview").click();
    await expect(room.getByText("Interview paused", { exact: true })).toHaveCount(0);

    await room.getByTestId("preview-next-question").click();
    await expect(room.getByTestId("interview-current-question")).not.toHaveText(initialQuestion ?? "", { timeout: 5_000 });

    await room.getByRole("button", { name: "End interview" }).click();
    await room.getByTestId("confirm-end-interview").click();
    await expect(page.getByTestId("interview-report")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Your interview debrief")).toBeVisible();
    await expect(page.getByText("What the interview is testing")).toBeVisible();
    await expect(page.getByText("Preview score")).toBeVisible();
    await expect(page.getByTestId("interview-readiness-summary").getByText("0/4")).toBeVisible();
    await expect(page.getByTestId("interview-answer-review").getByText("No responses to review yet")).toBeVisible();
    await expect(page.getByTestId("interview-attempt-history").getByText("Current attempt")).toBeVisible();
    await page.setViewportSize({ width: 780, height: 760 });
    const reportOverflow = await page.getByTestId("interview-report").evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(reportOverflow.scroll).toBeLessThanOrEqual(reportOverflow.client + 1);

    await page.getByRole("button", { name: "Back to job" }).click();
    await expect(room).toHaveCount(0);
    await expect(page.getByTestId("freehire-job-board")).toBeVisible();

    await page.getByTestId("practice-interview").click();
    await expect(page.getByTestId("interview-session-history")).toBeVisible();
    await expect(page.getByText("Private to this account")).toBeVisible();
  });

  test("recovers an unfinished interview only for its signed-in Personal user", async ({ page }) => {
    const card = page.getByTestId("freehire-job-card").first();
    const jobId = await card.getAttribute("data-job-id");
    if (!jobId) throw new Error("Interview recovery test requires a stable job id");

    await card.getByTestId("open-job").click();
    await page.getByTestId("practice-interview").click();
    await page.getByRole("button", { name: /Guided answer practice/ }).click();
    await page.getByTestId("enter-interview").click();
    await expect(page.getByTestId("interview-current-question")).toBeVisible();
    await page.waitForTimeout(1_100);

    await reloadApp(page);
    await openJobBoard(page);
    await page.locator(`[data-job-id="${jobId}"]`).getByTestId("open-job").click();
    await page.getByTestId("practice-interview").click();
    await expect(page.getByTestId("interview-resume-card")).toBeVisible();

    await page.evaluate(({ key }) => {
      const current = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...current, b2cUserId: "isolated-interview-user" }));
    }, { key: SESSION_KEY });
    await reloadApp(page);
    await openJobBoard(page);
    await page.locator(`[data-job-id="${jobId}"]`).getByTestId("open-job").click();
    await page.getByTestId("practice-interview").click();
    await expect(page.getByTestId("interview-resume-card")).toHaveCount(0);
  });

  test("records, plays back, retries, and evaluates a local microphone answer", async ({ page }) => {
    const jobCard = page.getByTestId("freehire-job-card").first();
    const jobId = await jobCard.getAttribute("data-job-id");
    if (!jobId) throw new Error("Interview report test requires a stable job id");
    await page.evaluate(({ key, roleId }) => {
      localStorage.setItem(key, JSON.stringify({
        draft: null,
        history: [{
          id: "prior-attempt",
          jobId: roleId,
          jobTitle: "Prior role attempt",
          company: "Prior company",
          format: "guided",
          mode: "hiring-manager",
          difficulty: "standard",
          elapsedSeconds: 180,
          answeredQuestions: 4,
          totalQuestions: 4,
          score: 55,
          completedAt: Date.now() - 86_400_000,
        }],
      }));
    }, { key: `sequ3nce:dev-interview-sessions:${TEST_USER.b2cUserId}`, roleId: jobId });
    await jobCard.getByTestId("open-job").click();
    await page.getByTestId("practice-interview").click();

    await page.evaluate(() => {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      gain.gain.value = 0.00001;
      oscillator.connect(gain).connect(destination);
      oscillator.start();
      Reflect.set(window, "__interviewTestAudio", { context, oscillator });
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => new MediaStream(destination.stream.getAudioTracks().map((track) => track.clone())),
      });
      Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
        configurable: true,
        value: async () => [{ deviceId: "test-mic", groupId: "test", kind: "audioinput", label: "Test microphone", toJSON: () => ({}) }],
      });
    });

    const room = page.getByTestId("interview-practice-room");
    await room.getByRole("button", { name: "Turn on microphone", exact: true }).click();
    await expect(room.getByRole("button", { name: "Microphone on", exact: true })).toBeVisible();
    await room.getByRole("button", { name: /Guided answer practice/ }).click();
    await room.getByTestId("enter-interview").click();
    await room.getByTestId("record-answer").click();
    await expect(room.getByTestId("stop-answer-recording")).toBeVisible();
    await page.waitForTimeout(750);
    await room.getByTestId("stop-answer-recording").click();
    await expect(room.getByTestId("answer-playback")).toBeVisible({ timeout: 5_000 });
    await expect(room.getByText("Mock transcript", { exact: true })).toBeVisible();

    await room.getByRole("button", { name: "Try again" }).click();
    await expect(room.getByTestId("answer-playback")).toHaveCount(0);
    await room.getByTestId("record-answer").click();
    await page.waitForTimeout(750);
    await room.getByTestId("stop-answer-recording").click();
    await expect(room.getByTestId("answer-playback")).toBeVisible({ timeout: 5_000 });

    await room.getByRole("button", { name: "End interview" }).click();
    await room.getByTestId("confirm-end-interview").click();
    const report = page.getByTestId("interview-report");
    await expect(report).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("interview-readiness-summary").getByText("1/4")).toBeVisible();
    await expect(page.getByTestId("interview-score").getByText(/\d+/)).toBeVisible();
    await expect(page.getByTestId("interview-readiness-summary").getByText("+10 pts")).toBeVisible();
    await expect(page.getByTestId("interview-answer-review").getByRole("button", { name: "Review answer 1" })).toBeVisible();
    await expect(page.getByText("Stronger opening")).toBeVisible();
    await expect(page.getByTestId("interview-practice-plan")).toBeVisible();
    await expect(page.getByTestId("interview-attempt-history").getByText("Yesterday")).toBeVisible();
  });

  test("runs a hands-free live mock turn with local speech and microphone capture", async ({ page }) => {
    await page.getByTestId("freehire-job-card").first().getByTestId("open-job").click();
    await page.getByTestId("practice-interview").click();

    await page.evaluate(() => {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      gain.gain.value = 0.35;
      oscillator.connect(gain).connect(destination);
      oscillator.start();
      Reflect.set(window, "__interviewTestAudio", { context, oscillator, gain });
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => new MediaStream(destination.stream.getAudioTracks().map((track) => track.clone())),
      });
      Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
        configurable: true,
        value: async () => [{ deviceId: "test-mic", groupId: "test", kind: "audioinput", label: "Test microphone", toJSON: () => ({}) }],
      });
      class FakeUtterance {
        text: string;
        rate = 1;
        pitch = 1;
        voice: SpeechSynthesisVoice | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) { this.text = text; }
      }
      Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          cancel: () => undefined,
          getVoices: () => [],
          speak: (utterance: FakeUtterance) => window.setTimeout(() => utterance.onend?.(), 30),
        },
      });
    });

    const room = page.getByTestId("interview-practice-room");
    await expect(room.getByRole("button", { name: /Live mock interview/ })).toBeVisible();
    await expect(room.getByTestId("enter-interview")).toBeDisabled();
    await room.getByRole("button", { name: "Turn on microphone", exact: true }).click();
    await expect(room.getByRole("button", { name: "Microphone on", exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const audio = Reflect.get(window, "__interviewTestAudio") as { context: AudioContext };
      await audio.context.resume();
    });
    await expect(room.getByTestId("enter-interview")).toHaveText(/Start live interview/);
    await room.getByTestId("enter-interview").click();

    await expect(room.getByTestId("live-conversation-panel")).toBeVisible();
    await expect(room.getByTestId("finish-live-response")).toBeVisible({ timeout: 5_000 });
    const waveform = room.getByTestId("live-delivery-waveform");
    const waveformBefore = await waveform.boundingBox();
    expect(waveformBefore?.height).toBe(12);
    const firstQuestion = await room.getByTestId("interview-current-question").textContent();
    await page.waitForTimeout(1_000);
    await page.evaluate(() => {
      const audio = Reflect.get(window, "__interviewTestAudio") as { gain: GainNode };
      audio.gain.gain.value = 0;
    });
    await page.waitForTimeout(2_200);
    await expect(room.getByTestId("finish-live-response")).toBeVisible();
    await page.evaluate(() => {
      const audio = Reflect.get(window, "__interviewTestAudio") as { gain: GainNode };
      audio.gain.gain.value = 0.35;
    });
    await page.waitForTimeout(900);
    const waveformDuring = await waveform.boundingBox();
    expect(waveformDuring?.height).toBe(waveformBefore?.height);
    await page.evaluate(() => {
      const audio = Reflect.get(window, "__interviewTestAudio") as { gain: GainNode };
      audio.gain.gain.value = 0;
    });
    await expect(room.getByTestId("live-transcript").getByText("You", { exact: true })).toBeVisible({ timeout: 9_000 });
    await expect(room.getByTestId("interview-current-question")).not.toHaveText(firstQuestion ?? "", { timeout: 5_000 });
    await expect(room.getByTestId("finish-live-response")).toBeVisible({ timeout: 5_000 });
    await expect(room.getByTestId("live-transcript").getByText(/Mock transcript generated/)).toHaveCount(0);
    await page.setViewportSize({ width: 620, height: 720 });
    const overflow = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
    await expect(room.getByTestId("live-conversation-panel")).toBeVisible();
    await room.getByRole("button", { name: "End interview" }).click();
    await room.getByTestId("confirm-end-interview").click();
    await expect(page.getByTestId("interview-report")).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId("interview-readiness-summary").getByText("2/4")).toBeVisible();
  });

  test("keeps the interview room responsive at narrow and wide sizes", async ({ page }) => {
    await page.getByTestId("freehire-job-card").first().getByTestId("open-job").click();
    await page.getByTestId("practice-interview").click();

    for (const viewport of [{ width: 620, height: 720 }, { width: 1600, height: 1000 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
      await expect(page.getByTestId("interview-practice-room")).toBeVisible();
    }
  });

  test("follows the Personal app light and dark theme", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("sequ3nce_personal_theme", "light"));
    await reloadApp(page);
    await openJobBoard(page);
    await page.getByTestId("freehire-job-card").first().getByTestId("open-job").click();
    await page.getByTestId("practice-interview").click();

    const lightRoom = page.getByTestId("interview-practice-room");
    await expect(lightRoom).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);
    await expect.poll(() => lightRoom.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
    await lightRoom.getByRole("button", { name: /Guided answer practice/ }).click();
    await lightRoom.getByTestId("enter-interview").click();
    await expect.poll(() => lightRoom.getByTestId("interview-call-surface").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
    await lightRoom.getByRole("button", { name: "End interview" }).click();
    await lightRoom.getByTestId("confirm-end-interview").click();
    await expect(lightRoom.getByTestId("interview-report")).toBeVisible({ timeout: 5_000 });
    await expect.poll(() => lightRoom.getByTestId("interview-readiness-summary").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");

    await page.evaluate(() => localStorage.setItem("sequ3nce_personal_theme", "dark"));
    await reloadApp(page);
    await openJobBoard(page);
    await page.getByTestId("freehire-job-card").first().getByTestId("open-job").click();
    await page.getByTestId("practice-interview").click();

    const darkRoom = page.getByTestId("interview-practice-room");
    await expect(darkRoom).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    await expect.poll(() => darkRoom.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgb(255, 255, 255)");
    await darkRoom.getByRole("button", { name: /Guided answer practice/ }).click();
    await darkRoom.getByTestId("enter-interview").click();
    await expect.poll(() => darkRoom.getByTestId("interview-call-surface").evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgb(255, 255, 255)");
    await darkRoom.getByRole("button", { name: "End interview" }).click();
    await darkRoom.getByTestId("confirm-end-interview").click();
    await expect(darkRoom.getByTestId("interview-report")).toBeVisible({ timeout: 5_000 });
    await expect.poll(() => darkRoom.getByTestId("interview-readiness-summary").evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgb(255, 255, 255)");
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
      let detail = null;
      for (const job of highPay.jobs.filter((item) => !item.id.startsWith("sequ3nce:"))) {
        try {
          detail = await window.electron.freeHire.getJob(job.id);
          break;
        } catch {
          // Upstream listings can expire between search and detail requests.
        }
      }
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
