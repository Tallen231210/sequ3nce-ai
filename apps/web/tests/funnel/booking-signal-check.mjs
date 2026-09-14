// Verifies how /start/book decides a booking happened.
//
// Why this exists: the first version of that page pattern-matched words like
// "booked" and "scheduled" in the calendar widget's postMessages. GHL actually
// sends "msgsndr-booking-complete" (read out of its shipped bundle), which that
// pattern did not match — so the funnel would have silently stalled on the
// booking step after a real booking. This check pins the behaviour.
//
// Not a Playwright spec yet: apps/web/playwright.config.ts routes unknown specs
// into the authenticated project and boots its own server on port 3000. Making
// this a spec means editing that shared config, which belongs in the change
// that actually ships the funnel.
//
// Run:  cd apps/web && npx next dev --webpack -p 3007
//       node tests/funnel/booking-signal-check.mjs
//       FUNNEL_BASE=http://localhost:3007 node tests/funnel/booking-signal-check.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.FUNNEL_BASE ?? "http://localhost:3007";
const BOOK = `${BASE}/start/book?p=%2B12015550123`;
const SLOT = "start=2026-09-15T21%3A30%3A00-04%3A00&end=2026-09-15T22%3A00%3A00-04%3A00";
const COMPLETE = `parent.postMessage(['msgsndr-booking-complete',{fingerprint:'fp-1',calendarId:'D8EJ1x5XjDS4biQOW5GO'}],'*');`;

// Exactly what the live widget posted while loading, picking a day, picking a
// time and reaching the contact form: 15 messages, all plumbing. None of it may
// advance the page. modify-parent-url carries the PARENT's own cleaned URL,
// which is what the widget really sends and what GHL's form_embed.js acts on.
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

// The widget is replaced by a stub so no real appointment is created. GHL guards
// the real submit with a bot challenge, so an automated end-to-end booking is
// not possible; a human has to make one to confirm the live event.
async function run({ widgetScript, redirectAfterMs = null, waitMs }) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, timezoneId: "America/New_York" });
  await page.route("**/widget/bookings/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "text/html",
      // Delayed so the page's listener is attached, as it always is in real use:
      // a booking takes the visitor tens of seconds.
      body: `<!doctype html><title>stub widget</title><body>stub<script>setTimeout(function(){${widgetScript}},2500);</script></body>`,
    }),
  );
  await page.goto(BOOK, { waitUntil: "domcontentloaded" });
  if (redirectAfterMs !== null) {
    // Stand in for GHL's post-booking redirect loading /start/thanks in the
    // iframe. Driven from the parent because an https-served stub cannot
    // navigate to an http dev origin; production is https on both sides.
    await page.evaluate(
      ({ delay, slot }) => {
        setTimeout(() => {
          const f = document.querySelector("iframe#cash-collectors-onboarding-cal_book");
          if (f) f.src = `/start/thanks?${slot}`;
        }, delay);
      },
      { delay: 2500 + redirectAfterMs, slot: SLOT },
    );
  }
  await page.waitForTimeout(waitMs);
  const url = page.url();
  await browser.close();
  return { onThanks: url.includes("/start/thanks"), hasSlot: url.includes("start=2026-09-15T21"), url };
}

const cases = [
  { name: "plumbing noise only, nobody booked", opts: { widgetScript: NOISE, waitMs: 9000 }, want: { onThanks: false, hasSlot: false } },
  { name: "completion event alone, no redirect configured", opts: { widgetScript: NOISE + COMPLETE, waitMs: 9000 }, want: { onThanks: true, hasSlot: false } },
  { name: "completion, then the redirect hands over the slot", opts: { widgetScript: NOISE + COMPLETE, redirectAfterMs: 400, waitMs: 12000 }, want: { onThanks: true, hasSlot: true } },
];

let failed = 0;
for (const c of cases) {
  const got = await run(c.opts);
  const ok = got.onThanks === c.want.onThanks && got.hasSlot === c.want.hasSlot;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}`);
  console.log(`      on thanks ${got.onThanks} (want ${c.want.onThanks}) · carries slot ${got.hasSlot} (want ${c.want.hasSlot})`);
  if (!ok) console.log(`      url: ${got.url}`);
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
