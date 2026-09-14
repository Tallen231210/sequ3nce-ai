// Verifies how /start/book decides a booking happened, and that /start/thanks
// makes use of the booked slot when GHL's redirect supplies it.
//
// Why this exists: the first version of the booking step pattern-matched words
// like "booked" and "scheduled" in the widget's postMessages. GHL actually
// announces a completed appointment as "msgsndr-booking-complete" (read out of
// its shipped bundle, and confirmed by a live booking on 2026-09-14). That
// pattern did not match it, so the funnel would have stalled on the booking
// step after every booking, and nothing downstream would have been reached.
//
// How the two mechanisms really work, also from the bundle:
//  - The widget posts the completion event, then SYNCHRONOUSLY sets
//    window.top.location.href to the calendar's configured redirect URL. So a
//    configured redirect replaces the whole page by itself; our listener never
//    gets the chance to run, and the booked slot arrives as query params on
//    that URL.
//  - With no redirect configured, our listener is the only thing that advances
//    the visitor, and there is nothing to wait for.
//
// Not a Playwright spec yet: apps/web/playwright.config.ts routes unknown specs
// into the authenticated project and boots its own server on port 3000. Making
// this a spec means editing that shared config, which belongs in the change
// that actually ships the funnel.
//
// Run:  cd apps/web && npx next dev --webpack -p 3007
//       node tests/funnel/booking-signal-check.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.FUNNEL_BASE ?? "http://localhost:3007";
const BOOK = `${BASE}/start/book?p=%2B12015550123`;
const COMPLETE = `parent.postMessage(['msgsndr-booking-complete',{fingerprint:'fp-1',calendarId:'D8EJ1x5XjDS4biQOW5GO'}],'*');`;

// Exactly what the live widget posted while loading, picking a day, picking a
// time and reaching the contact form: 15 messages, all plumbing. None of it may
// advance the page. modify-parent-url carries the PARENT's own cleaned URL,
// which is what the widget really sends and what GHL's form_embed.js acts on —
// never feed that one a foreign URL in a test, it will navigate the page.
const NOISE = `
  parent.postMessage('[iFrameResizerChild]Ready','*');
  parent.postMessage('[iFrameSizer]cash-collectors-onboarding-cal_book:700:1120:init','*');
  parent.postMessage(['highlevel.setHeight',{height:800,id:'msgsndr-calendar'}],'*');
  parent.postMessage(['fetch-query-params','','mtQtVzTlUDoypTYDd19h'],'*');
  parent.postMessage(['fetch-sticky-contacts','mtQtVzTlUDoypTYDd19h'],'*');
  parent.postMessage(['set-sticky-contacts','embedded_iframe_x','x','{}',''],'*');
  parent.postMessage(['modify-parent-url','${BOOK}'],'*');
  parent.postMessage('[iFrameSizer]cash-collectors-onboarding-cal_book:805:670:mutationObserver','*');
`;

const browser = await chromium.launch({ headless: true });
let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (detail) console.log(`      ${detail}`);
};

// The widget is replaced by a stub, so no real appointment is created. GHL
// guards the real submit with a bot challenge, which is why an automated
// end-to-end booking is not possible; the live confirmation was done by hand.
async function bookPageWith(widgetScript, waitMs) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, timezoneId: "America/New_York" });
  await page.route("**/widget/bookings/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "text/html",
      // Delayed so the page's listener is attached, as it always is in real
      // use: a booking takes the visitor tens of seconds.
      body: `<!doctype html><title>stub widget</title><body>stub<script>setTimeout(function(){${widgetScript}},2000);</script></body>`,
    }),
  );
  await page.goto(BOOK, { waitUntil: "domcontentloaded" });
  const t0 = Date.now();
  let elapsed = null;
  page.on("framenavigated", (fr) => {
    if (fr === page.mainFrame() && fr.url().includes("/start/thanks") && elapsed === null) elapsed = Date.now() - t0 - 2000;
  });
  await page.waitForTimeout(waitMs);
  const url = page.url();
  await page.close();
  return { url, elapsed };
}

// 1. Ordinary widget chatter must never advance the visitor.
{
  const { url } = await bookPageWith(NOISE, 6000);
  check("plumbing noise alone does not advance", !url.includes("/start/thanks"), `url ${url.replace(BASE, "")}`);
}

// 2. The completion event advances, and does so immediately — no configured
//    redirect means there is nothing worth waiting for.
{
  const { url, elapsed } = await bookPageWith(NOISE + COMPLETE, 6000);
  check("completion event advances to thanks", url.includes("/start/thanks"), `url ${url.replace(BASE, "")}`);
  check("and advances promptly, not after a delay", elapsed !== null && elapsed < 1500, `took ~${elapsed}ms after the event`);
  check("phone is carried through", url.includes("p=%2B12015550123"));
}

// 3. When GHL's configured redirect supplies the slot on the URL, the thanks
//    page must put the real time into the add-to-calendar link, as UTC basic
//    format. Stripping punctuation off the raw ISO string ate the timezone
//    offset's minus sign and produced the wrong hour, which is what this guards.
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, timezoneId: "America/New_York" });
  const q = "start=2026-09-15T21%3A30%3A00-04%3A00&end=2026-09-15T22%3A00%3A00-04%3A00";
  await page.goto(`${BASE}/start/thanks?booked=1&p=%2B12015550123&${q}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const href = await page.getByRole("link", { name: /calendar/i }).first().getAttribute("href");
  const dates = decodeURIComponent((href.match(/dates=([^&]+)/) || [])[1] || "");
  // 21:30-22:00 Eastern on the 15th is 01:30-02:00 UTC on the 16th; the day rolls.
  check("booked slot becomes a correct UTC calendar link", dates === "20260916T013000Z/20260916T020000Z", `dates=${dates || "(none)"}`);
  await page.close();
}

// 4. No slot on the URL must still give a usable, untimed event rather than a
//    broken one.
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, timezoneId: "America/New_York" });
  await page.goto(`${BASE}/start/thanks?booked=1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const href = await page.getByRole("link", { name: /calendar/i }).first().getAttribute("href");
  const body = await page.locator("body").innerText();
  check("no slot means no dates param and no NaN", !/dates=|NaN/.test(href));
  check("and the page never prints the words 'your number'", !/your number/i.test(body));
  await page.close();
}

await browser.close();
console.log(`\n${failed === 0 ? "all checks passed" : failed + " check(s) failed"}`);
process.exit(failed ? 1 : 0);
