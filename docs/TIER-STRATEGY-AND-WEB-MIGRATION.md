# Tier Strategy & Web Migration

**Status:** Direction agreed, nothing built. Last updated 2026-07-26.

**Why this document exists.** We are about to make three large, connected changes. The work will span weeks and we will lose the thread of the conversation that produced it. Read this before starting any phase, and update it when a decision changes. It records *why* as well as *what*, because the why is what gets forgotten.

**Nothing in here is built yet.** Do not treat any section as describing existing behaviour.

---

## 1. Where we are today

One product. Managers use the web dashboard, closers install an Electron desktop app, and a meeting bot joins every call to record it. Pricing is a platform fee plus a per-closer seat.

**The problem we are solving:** closers don't reliably use the bot. Not because they dislike it — because it asks them to change how they start a meeting. They start calls from Google Calendar out of habit. Managers also forget to enforce it. Without enforcement, adoption drifts. And until the bot is used, the customer gets nothing, which is a brutal way to begin a relationship.

**The insight that drives everything below:** the problem was never *which* bot. It was that we required a new behaviour before delivering any value. Every design decision here should be tested against "does this require anyone to do something new?"

---

## 2. The three tiers

Names are placeholders. What matters is the shape.

### Tier 1 — Scoreboard (cheapest)

No call recording of any kind. Data comes from three places, two of which need nobody to do anything:

- **The closer's calendar** (already connected) — tells us a call was booked, with whom, when, how long
- **Their CRM** — GoHighLevel or Close, powering all of Setter Data
- **What closers type** — the daily numbers sheet and the post-call form

Sold as: really good tracking and visibility, working the day they sign up.

### Tier 2 — Bring your own recording

Tier 1 plus a connection to the recording tool they already use, starting with Fathom. Adds transcripts, AI summaries and analysis, talk ratio, and — the actual reason to upgrade — **the ability to check whether reported numbers are true.**

Sold as: high-coverage tracking for teams who want to know what's actually being said, without changing how they record.

### Tier 3 — Full (current product)

Tier 2 plus our own meeting bot. Adds listening to calls live, video review with timestamped comments, clips, and the playbook.

Sold as: everything, for teams who do a lot of call review.

### Pricing shape (indicative, not final)

| Tier | Platform / mo | Per closer / mo |
|---|---|---|
| 1 — Scoreboard | ~$300 | ~$30 |
| 2 — Bring your own | ~$500 | ~$50 |
| 3 — Full | ~$500 | ~$150 |

Margins on tiers 1 and 2 are near-total because the meeting bot is the main cost. **Tier 1 cannibalising tier 3 is an accepted outcome, not a risk to mitigate** — Tyler's call, made deliberately. Cheap tiers scale.

---

## 3. Build order

**Phase 1 — Desktop app becomes a web app.**
Everything else depends on it. Both new tiers involve closers who have no reason to install anything, and shipping a desktop app to a customer who isn't using our bot makes no sense.

**Phase 2 — Fathom integration.**
Proves the "bring your own recording" model with one provider before generalising.

**Phase 3 — Tiers and billing.**
Turning the above into sellable plans. Last, because you cannot price what you haven't built.

Zoom, and any other recording source, comes after all of this. Zoom requires an app that Zoom reviews and approves — a real project with a waiting period. Do not start it while anything above is unfinished.

---

## 4. How we build safely against production

**Decided 2026-07-26: we are NOT building a separate development environment.** This was considered and rejected. Testing everything twice — once in dev, once again in production — costs more time than it saves, and for this app testing is the expensive part. Do not reopen this without a new reason.

So: the backend is production, and the front end is tested locally before it is deployed. That is the operating model for all three phases.

### Why this is workable

**New front ends are invisible until deployed.** A page on a laptop doesn't exist for customers. And once deployed, the `betaFeatures` array on the team record hides it until we choose otherwise — the same mechanism already hiding the Setter Data tab.

**A new backend function that nothing calls is harmless.** This is the key point. The risk was never "deploying to production" — it is *changing* things in production. Adding is safe. Modifying is not.

### The rules

These matter more without a dev environment, not less.

1. **Add, never change.** New features get new functions. Do not modify functions that are running today. If something must behave differently, write a second version alongside and switch over deliberately.
2. **New database fields must be optional; new tables are free.** An optional field nothing reads is harmless. Removing or renaming an existing one breaks live customers — and the B2C app shares this database.
3. **Do not touch the path that creates calls from the bot.** The single riskiest area. When Fathom arrives, calls come from a second source: build it as a separate route into the same place. A bug in the Fathom path must not take down recording for everyone.
4. **Default every team to current behaviour.** When the tier field is added, every existing team is already on the full tier without anyone setting it. Nothing changes for anybody until deliberately changed.
5. **Gate every new front end behind `betaFeatures`** until it is ready to sell.
6. **Deploy backend additions freely, front ends deliberately.** The backend addition is inert until a UI calls it.

### The one narrow exception: billing

When Phase 3 arrives, build and test the payment flows against **Stripe test mode**. Not because of the environment question — because a mistake in billing charges real money, and that is not recoverable by fixing the code afterwards. This is a keys-and-config change for that phase only, not a dev environment.

Note `apps/web/.env.local` currently holds a live Stripe secret key. Be conscious of that during Phase 3.

### Timing note

As of 2026-07-26 two clients need to supply new card details before their accounts unlock, so there is a short window of very low real usage. Useful for the riskier early work — but it closes, and the rules above hold regardless.

---

## 5. Phase 1 — Desktop app becomes a web app

### What we already know works

The desktop app's screens run in an ordinary browser today. This was verified on 2026-07-26 by loading the real renderer in Chrome and driving the whole My Numbers section — submitting days, editing the grid, the leaderboard, the year view. It needed two things: a stand-in for the Electron bridge and a seeded login in browser storage. **The Team Performance feature has zero dependency on Electron.**

That is not proof the whole app is that easy. It is proof the hardest new feature isn't a problem.

### What genuinely needs Electron today

- **The ammo panel** — the floating window showing live quotes during a call. A browser tab cannot sit on top of Zoom. **Decision: remove it.** Tyler's assessment is it isn't used, and it's only meaningful on tier 3 anyway.
- **The post-call form overlay** — a popup window unique to the desktop app. On the web it becomes a page or an in-tab modal. Slightly less slick, no loss of function.
- Window sizing, tray behaviour, desktop notifications — all either irrelevant on web or replaceable with browser notifications.

### Everything that must be ported

The closer app's navigation today: Dashboard, Stats, My Numbers, Calls, Schedule, Role Play, Messages, Resources, Coaching, Settings, plus the Quick Bot button.

Notes:
- **Quick Bot** is tier 3 only. Hide it elsewhere.
- **Role Play** uses the microphone. Browsers can do this, but it needs checking early rather than late.
- **Messages** polls for live chat. Works on web, needs its polling reviewed.

### Auth — the decision to make up front

Closers authenticate natively today: email and password (and magic link) checked against the `closers` table. Managers authenticate through Clerk. After this phase both live in the same web app, so we need to decide how the two coexist — separate routes, separate sessions, or unify.

**Related, and worth fixing here:** after a closer logs in, the app is handed the closer's ID and every later request simply says "I am closer X." Nothing proves the request came from someone who logged in. This was demonstrated during testing — pasting an ID into browser storage granted full access with no password. Low practical risk today; it means a closer could technically submit numbers as a teammate. Building proper web logins is the natural moment to fix it, and doing it then is far cheaper than doing it as a separate project later. The manager dashboard has the same pattern with Clerk IDs and should be considered at the same time.

### Retiring the installed app

Existing closers have it installed and it auto-updates. Plan:
- Ship a final desktop version that tells users the app has moved and links to the web
- Do not silently break it — it will keep launching on people's machines for months
- Decide how long the old version keeps working
- Communicate to managers before closers notice

---

## 6. Phase 2 — Fathom

### What Fathom gives us (verified 2026-07-26 from their docs)

Per meeting: who recorded it (name and email), all calendar invitees with emails and an internal/external flag, scheduled and actual start/end times, the meeting title, the meeting type, and a link to watch it on Fathom. Plus the **full transcript with speaker names and a timestamp on every line**, their AI summary, action items, and highlights.

Webhooks push new meeting content as soon as it's ready, so we don't poll. Filters exist for date range, meeting type, recorder email, and invitee domains including internal-vs-external.

Rate limit: 60 requests per minute across all of an account's keys, with no higher tier offered. Not a constraint at our scale, especially using webhooks.

**What Fathom does not give us: the audio or video file.** Only a link to their player. This is the source of most of what breaks.

**Plan requirement:** Fathom's own pricing page lists the Public API as a general feature and their quickstart states no plan requirement. A claim that it needs Enterprise came from a competitor's blog and appears to be wrong. However, the "one connection sees the whole team" scenario depends on team-wide recording sharing, which sits on their paid Team plan (~$15–19/user). Companies using Fathom seriously for a sales team are likely already there.

### World A and World B — build for both

A Fathom API key only sees meetings that person recorded, or meetings shared to their team. Fathom states explicitly that an admin's key does not reach other users' unshared meetings.

- **World A** — the company shares all recordings team-wide, one connection from a manager covers everyone, nobody else does anything.
- **World B** — each closer connects their own Fathom account once.

**Decision: support both.** Which applies depends on how the customer has Fathom configured, and we won't get to choose. This means the connection record must be able to belong to *either* a team or an individual closer, and the system must cope with a mix — some closers covered by the team connection, others connected individually.

Fathom supports a proper "connect your account" flow for integrations, so World B should be one button rather than copying and pasting keys.

### Edge cases that will bite

- **Filtering out non-sales meetings.** Fathom records everything, including internal standups. If those become "calls," close rates collapse and the product looks broken. Use the external-attendee filter and meeting types. Get this right on day one — a customer's first impression is the numbers.
- **Matching Fathom users to our closers.** Done by email from `recorded_by`. Emails will not always match. Needs a manual mapping screen — we solved a similar problem with setter-to-closer matching in Setter Data; reuse that thinking.
- **Double counting.** A tier 3 team might also use Fathom. Two sources for one call must not become two calls. Every call record needs to record where it came from, with a rule for which source wins.
- **Backfill on connect.** Do we pull history? How far back? This affects the first-impression experience and the rate limit.
- **Disconnection and expired keys.** Learn from the GoHighLevel work: transient failures must not permanently mark a connection broken, and the system should recover on its own rather than showing a false alarm banner forever.
- **Duplicate prospects.** Matching Fathom invitees to existing prospect records.
- **Timezones.** Fathom gives timestamps; every daily rollup we have is timezone-sensitive.

### Data model changes

- Calls need a **source** — bot, Fathom, manual, or calendar-derived
- The recording link needs to be understood as *an external page*, not a file we host. Anything that currently assumes it can play or cut the media must check first.
- All schema changes additive only. The B2C app shares this backend.

---

## 7. Phase 3 — Tiers and billing

### What exists today

Teams have `plan` (a status string like active/cancelled/trialing), `subscriptionStatus`, `stripeCustomerId`, `stripeSubscriptionId`, `seatCount`, and a `betaFeatures` array used for staged rollout. There is **no concept of a product tier.** That has to be added.

### What needs building

- A **tier field** on the team, and one single place in the code that answers "what tier is this team on and what may they see." Feature checks scattered across the codebase will drift.
- **Three Stripe products/prices**, each with a platform fee and a per-seat component.
- **Upgrade and downgrade**, including part-way through a billing period, with proration.
- **Grandfathering existing customers.** They are on today's pricing. Decide whether they move, and make sure nothing about the migration disturbs their billing.
- **Seat counting rules.** Does an inactive closer occupy a seat? What happens when a closer is removed mid-month?
- **Trials** per tier.
- **Comped teams** — already handled by setting status active without a Stripe subscription. Make sure that still works when a tier is required.
- **Past-due handling** — we have hit this with a real customer. Confirm what a past-due team on each tier can still see.
- **Stripe webhooks** must handle plan changes, not just payment status.

### Downgrade — the question to settle early

A team drops from tier 3 to tier 1. They have a year of recordings, transcripts and call reviews. What happens?

Recommended: **existing data stays visible, read-only; no new data of that kind is collected.** Deleting a customer's history because they downgraded is the sort of thing that ends a relationship. But it means every tier check must distinguish "can they see old data" from "do we collect new data," and that distinction has to be in the design from the start rather than retrofitted.

---

## 8. What each tier gets

| Feature | T1 Scoreboard | T2 Bring your own | T3 Full |
|---|---|---|---|
| Team Performance / daily numbers | Yes | Yes | Yes |
| Setter Data (GHL / Close) | Yes | Yes | Yes |
| Analytics tab | Yes | Yes | Yes |
| Closer Stats | Yes (no talk ratio) | Yes | Yes |
| Schedule & capacity | Yes | Yes | Yes |
| Goals, prizes, leaderboard, daily Slack post | Yes | Yes | Yes |
| Ad spend, ROI, Hyros | Yes | Yes | Yes |
| Recruiting / profiles | Yes (no verified talk ratio) | Yes | Yes |
| Transcripts | No | Yes | Yes |
| AI summaries, deep analysis, chapters | No | Yes | Yes |
| Talk time / talk ratio | No | Yes | Yes |
| **Cross-check on reported numbers** | **No** | Yes | Yes |
| Watch the recording | No | Link out to Fathom | In-app |
| Call Reviews (timestamped comments) | No | No | Yes |
| Highlights / clips | No | Text quotes only | Video clips |
| Playbook | No | No | Yes |
| Live Calls (listen in) | No | No | Yes |
| Ammo panel | Removed entirely | Removed | Removed |

### Two important notes on this table

**The Analytics tab survives everywhere.** This was checked in the code and was a surprise. Everything about objections — which objection loses the most money, which get overcome — reads from `primaryObjection` and `objectionsOvercome`, which the **closer types into the post-call form**. None of it comes from the recording or from AI. It depends on form completion, which is a problem we have on every tier equally.

**All three AI functions take plain text.** None touch audio. Feed them a Fathom transcript instead of our own and summaries, deep analysis and chapters work identically.

### What tier 1 actually gives up

Not just transcripts. **The cross-check.** Everything built in the Team Performance work rests on "the closer reports a number and we can see whether it matches what we measured" — that's what the grey and black figures in the grid mean. On tier 1 there is no second opinion anywhere in the system. Self-reported top to bottom.

That is acceptable and deliberate. But it changes the promise from *"we tell you what actually happened"* to *"we make your reporting effortless and visible"*, and it invites the objection "why not a spreadsheet?" The answer — calendar and CRM data arriving automatically, plus the whole setter side — is a good one, but it needs to be ready.

**This is also the upgrade trigger for tier 2.** Nobody buys transcripts. They upgrade because they currently trust their closers' numbers and would rather know.

---

## 9. Features to hide, degrade, or remove

Work through this list explicitly during Phase 3. Hiding a tab is better than showing an empty one.

- **Live Calls** — hide on tiers 1 and 2. Nothing to fall back to.
- **Call Reviews** — hide on tiers 1 and 2. On tier 2 the recording lives on Fathom, so timestamped comments and scrubbing aren't possible.
- **Playbook** — tier 3 only, it's built on video.
- **Highlights** — tier 2 keeps them as transcript quotes, loses video clips.
- **Share links** — currently refuse to be created when there is no recording. Tier 2 needs to share Fathom's link instead, which means **Fathom controls who can view it, not us.** Consider what that means for the compliance-style links where we deliberately redact the transcript. Tier 1 could still share a redacted transcript with no video at all.
- **Ammo panel** — deleted, all tiers.
- **Quick Bot** — tier 3 only.
- **Recordings tab** — tier 3, or repurposed as a list linking out on tier 2.

---

## 10. Decisions already made

Do not reopen these without a reason.

- Existing functionality is **not removed**. This adds options; tier 3 remains the current product.
- The desktop app goes away; closers move to the web.
- The ammo panel is removed outright.
- Linking out to Fathom to watch a call is acceptable; losing in-app review on tier 2 is acceptable.
- Losing the Live Calls tab on tiers 1 and 2 is acceptable — managers like it but rarely use it.
- Both World A and World B must be supported.
- Cheap tiers cannibalising expensive ones is acceptable; margins make it worthwhile.
- Fathom first. Zoom later, if at all.
- **No separate development environment.** Backend is production; front ends are tested locally and gated behind `betaFeatures` once deployed. See section 4 for the rules that keep this safe. Considered and rejected 2026-07-26 — testing everything twice costs more than it saves.
- Section 12 (how closers report their day) is agreed, including both risks it flags and the reward-before-ask rule.
- **Fix the "trusted ID" auth weakness during Phase 1** (decided 2026-07-26). Doing it while the login code is already open is far cheaper than a separate project later. Closes open question 7.
- **The web version must look like a web app, not a ported desktop app.** Especially the login screen. Do not copy desktop chrome, window-sized layouts or desktop-native affordances across. This is a design requirement, not a nice-to-have — these tiers are sold on the experience being effortless.

---

## 11. Open questions

Answer these before or during the phase they belong to.

**Before Phase 2:**
1. How is Fathom actually configured at a real customer — World A or World B? Worth checking with one customer rather than guessing.
2. How far back should we backfill on first connect?
3. Which meetings count as sales calls, precisely? Get the rule from a customer, not from us.

**Before Phase 3:**
4. Do existing customers move to the new pricing, or stay on the old?
5. On downgrade, is read-only access to historical recordings the right call?
6. Does an inactive closer occupy a paid seat?

**Whenever:**
7. ~~Fix the "trusted ID" weakness now or later?~~ **Answered: fix it in Phase 1.**
8. ~~Does the post-call form survive?~~ **Answered — see section 12.**

---

## 12. How closers report their day (agreed 2026-07-26)

Replaces the old post-call form. Resolves the "one daily report vs one form per call" tension by making them the same screen.

### Ask about calls, derive the totals

Today the daily sheet asks a closer for their totals — taken, offers, closes. That makes them count their own day: annoying, and unreliable because people misremember.

Instead, show **today's calls as a list** and ask what happened to each. The totals then compute themselves. One interaction yields both the aggregate numbers and the per-call detail, for less work than today.

Where the call list comes from: the closer's **calendar** on tier 1, **Fathom** on tier 2, the **bot** on tier 3. This is what makes per-call reporting possible on a tier with no recording at all.

### The interaction

Each call is a row. Questions reveal progressively, so only what is relevant gets asked:

- Did they show? → no-show ends the row in one tap
- Showed → did you make an offer?
- Offer → did it close?
- Closed → cash collected, contract value
- Not closed → **what got in the way** (this is the objection field the entire Analytics tab runs on)

Most rows are two or three taps. A whole day should take well under a minute, with no arithmetic anywhere.

**Objections are only asked on calls that did not close** — typically a minority. That is the whole reason this is cheaper than the current per-call form.

### Immediate vs end-of-day: not a choice

It is one screen — today's calls, some filled in, some not. Fill a row straight after a call at 10am, or do the lot at 6pm. Same list either way. **Do not build two things.**

### Must get right

- **Calls not on the calendar.** Rescheduled, ad-hoc, or a prospect who rang instead. There must be an obvious "add a call" option, or closers hit a wall on day two and stop trusting it.
- **Recall accuracy.** Asking at 6pm about a 9am call gives fuzzier answers, objections especially. Accepted trade: near-complete roughly-right data beats ~50% precise data, which is what the current form actually achieves.

### The UX principle for the lower tiers

On tier 3 a closer gets something back — transcripts, coaching, reviews. **On tier 1 they get nothing.** They are typing numbers into their manager's dashboard. That is the real reason data entry dies everywhere it has been tried.

So the screen must pay them back: their own stats, their rank, progress to goal, what they have earned. All of it already exists — leaderboard, pace card, prize, funnel.

**Show it first.** Opening the page should show how they are doing *before* asking for anything. Reward, then ask — not a form with their stats hidden behind a tab.

This is the highest-leverage UX decision on the lower tiers and it costs nothing, because the pieces are built.

---

## 13. Phase 1 work plan — desktop app becomes a web app

Audited 2026-07-26. This is the executable plan; sections 1–12 are the reasoning behind it.

### What the audit found

**Only three files in the entire renderer touch Electron.** Everything else — all 24 views, including the 1,081-line `CoachingView`, the 704-line `ActiveCallView`, `StatsView`, `CallHistoryView`, `PostCallQuestionnaire` — is ordinary React talking over HTTPS to `convex.site`. This is a much better starting position than expected.

| File | Bridge calls | What it needs |
|---|---|---|
| `src/renderer/App.tsx` | 18 | schedule ×6, training ×3, chat ×3, `app.setWindowSize` ×2, ammo ×2, `app.getVersion`, `app.getPlatform` |
| `src/renderer/views/MeetingBotHub.tsx` | 8 | `chat.onUnreadCountChanged`, `chat.getUnreadCount`, `bot.callStarted`, `bot.callEnded`, `bot.openQuestionnaire` ×3, `ammo.toggle` |
| `src/renderer/views/SettingsView.tsx` | 1 | `diagnostics.collect` |

**The app is six windows, not one.** `src/index.ts` creates: `mainWindow`, `ammoTrackerWindow`, `postCallWindow`, `roleplayWindow`, `scheduleWindow`, `trainingWindow`. Each has its own renderer entry point (`ammo-tracker-renderer.ts`, `post-call-renderer.ts`, `roleplay-renderer.ts`, `schedule-renderer.ts`, `training-renderer.ts`). **On the web each becomes a route or an in-app modal.** This is the real shape of the migration — not "port a page", but "collapse six windows into one app".

**Clerk will not get in the way.** `apps/web/src/middleware.ts` only protects `/dashboard`, `/team`, `/billing`, `/settings`, `/calls`. A new closer route outside those paths is unprotected by default, which is what we want since closers use native auth. **Do not put the closer app under `/settings` or `/calls`** — those are already Clerk-protected and would bounce closers to a manager login.

### Recommended shape

Put the closer app in `apps/web` as a new route group under a fresh prefix (`/closer` or `/app`). It shares the Convex client, the components and the deploy. A separate Next.js app would duplicate all three for no benefit.

### Progress (2026-07-26)

**Phase 1 is functionally complete.** Steps 1–7 done and deployed. `/app` is live behind the `closerWebApp` beta
flag, with real session auth. Eleven routes serving live data: Dashboard, My
Numbers, Stats, Calls, Schedule, Messages, Coaching, Resources, Settings, plus
the live call view and calendar setup. No `window.electron` references and no
`dark:` variants remain anywhere in it. The whole of `convex.ts` was ported (75 functions, no Electron
coupling), which carried the Convex concurrency circuit-breaker across intact.

**Role Play** is ported but not linked — Tyler's call, it never gets used, and
omitting it defers the browser-microphone question entirely.

**Still open:**
- **Closer onboarding is desktop-only and now actively wrong for Windows.**
  The welcome email (`convex/closerMagicLink.ts`, ~line 236) is built entirely
  around the installed app: the primary button is a `sequ3nce://` deep link
  that opens the desktop app, the first-time email's step one is "download",
  and the code-entry fallback reads *"Open Sequ3nce on the computer where you
  use it"*. A Windows closer is currently emailed instructions to install an
  app that does not exist for them. Needs revamping to offer a choice — Mac
  users pick either, Windows users go straight to the web. Decision needed on
  how to present it: choice in the email, or detect the platform.
- **Nobody has opened the web app on Windows.** Tyler has no Windows machine.
  It is plain Next.js with no platform-specific code, so the risk is low, but
  it is untested and Windows is the main reason this exists. Cover it by
  asking a Windows customer during the first rollout.
- ~~The post-call questionnaire~~ **DONE.** Ported as-is and rendered as a
  dialog over the call list, addressable via `?questionnaire=<callId>`.
  Section 12's end-of-day redesign applies to the **lower tiers**, not to this
  port — this milestone is parity with the desktop app.
- ~~The bot lifecycle~~ **DONE.** A live call is a banner in the shell plus a
  `/app/live` route; Quick Bot is in the sidebar; calendar onboarding is at
  `/app/setup`. The watched call is persisted, so a mid-call refresh still ends
  with the post-call form — the desktop's main process used to remember that
  and a browser tab cannot.
- ~~Converting the remaining routes to session auth~~ **34 of them done**
  (5 + 29). Everything the closer client POSTs now resolves identity from the
  session. Still open: GET routes that pass identity in the query string, and
  updating the desktop client to send a token so the fallback can go.

### The steps

**Step 1 — Scaffold and shell.** New route group. Port `App.tsx` and `MeetingBotHub.tsx` as the shell and navigation, with the bridge calls removed rather than stubbed. Nothing else yet. Deploy it — it is unreachable without a link and gated by `betaFeatures`.

**Step 2 — Closer auth on the web.** They log in against the `closers` table today (email/password, plus magic link), which already works over HTTP. Decide here whether to fix the "trusted ID" weakness (see section 5) — doing it now is far cheaper than later, and this is the only moment the auth code is open.

**Step 3 — Port the views.** Roughly in this order, since it front-loads the things closers use daily: `DashboardView`, `PerformanceView` (+ its five files — already verified working in a browser), `StatsView`, `CallHistoryView` + `CallDetailSheet` + its tabs, `ResourcesView`, `MessagesView`, `SettingsView`, `CoachingView`, `RolePlayView`. These need no Electron work; the job is routing and layout.

**Step 4 — Collapse the five secondary windows.**
- `postCallWindow` → in-app route or modal. Note section 12 changes what this *is*; do not port the old questionnaire verbatim without checking that first.
- `scheduleWindow` → route (takes closer email + team ID, previously passed over the bridge)
- `trainingWindow` → route (takes closer ID)
- `roleplayWindow` → route. **Check microphone permissions in the browser early** — this is the one with unknown risk.
- `ammoTrackerWindow` → **delete entirely.** Decided; see section 10.

**Step 5 — Replace the bridge capabilities.** About ten distinct things:
- `chat.startPolling` / `getUnreadCount` / `onUnreadCountChanged` → poll or subscribe from React
- `bot.callStarted` / `callEnded` / `openQuestionnaire` → tier 3 only; in-app state instead of window messages
- `schedule.*`, `training.*` → route parameters
- `app.getVersion` / `getPlatform` → build constant and browser detection
- `app.setWindowSize`, `ammo.*` → delete
- `diagnostics.collect` → browser-side equivalent, or drop it

**Step 6 — Verify.** The renderer runs in a browser today (see [[team-performance-sheet]] memory for the harness), so every view can be exercised before release. Test as a real closer on a real team.

**Step 7 — Offer the web app alongside the desktop app.** Decided 2026-07-26: **the desktop app is NOT being retired.** The web version is an additional option — for closers who prefer a browser, and for **Windows users, who have no desktop app at all today.** That is the immediate win: a whole platform goes from unsupported to supported.

Consequence for auth: the `closerId` fallback in `convex/closerSession.ts` cannot simply be deleted on a retirement date, because the desktop app keeps running indefinitely. To require sessions everywhere, the desktop client needs updating to store and send a session token too — the backend already issues one on every login, including from the desktop, so that is a client-side change only.

### Do not forget

- `Quick Bot` and the whole bot lifecycle are tier 3 only — hide, don't delete.
- Desktop notifications become browser notifications, which need permission and behave differently.
- The B2C Personal app is a **separate Electron app** and is not in scope. It shares the Convex backend, so schema changes stay additive.
