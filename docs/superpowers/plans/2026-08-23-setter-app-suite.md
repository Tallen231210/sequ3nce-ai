# Setter App Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Setters get a magic-link mini-app (EOD form, their set calls with recordings, team scorecard + personal projections sandbox); Zion gets an editable projections scorecard in his Setter EODs tab.

**Architecture:** New `/setter` route group in `apps/web` with its own session model (`setterSessions`, mirroring `closerMagicLink.ts`); additive Convex tables for matches/dismissals/baselines; one shared React scorecard engine mounted three ways with a permissions prop. All data flows through setter-scoped Convex functions that resolve identity from the session token — never a client-supplied rosterId.

**Tech Stack:** Next.js (apps/web), Convex (shared backend, prod `ideal-ram-982`), Resend (codes), Geist font (app shell), the ledger CSS from `docs/superpowers/specs/2026-08-23-setter-scorecard-reference.html` (scorecard).

## Global Constraints

- Schema changes are ADDITIVE ONLY (never remove/rename fields).
- Convex functions: add new, never modify existing B2B functions' behavior.
- New Convex files require `npx convex codegen` AND committing `convex/_generated/` (Vercel builds from origin/main and type-checks; stale committed types = failed deploy).
- Every phase ends: `npx tsc --noEmit` + `npx next build` clean, `npx convex deploy --yes`, verification runs listed in the task, surgical commit + push of ONLY this work, `git branch --show-current` must print `main` before any push.
- Verification is CLI-first (`npx convex run --prod …` bench functions), consistent with repo practice; browser click-testing is unreliable here.
- No decorative animation anywhere (standing rule). App shell = Geist/Vercel look; scorecard keeps the reference HTML's paper-ledger look.
- Labels: "Calls on the calendar", "Calls shown", "Calls closed", tab titled "Calls You've Set".
- Files stay under ~300 lines — split components/libs rather than growing monoliths.
- Setter identity resolution is by session token hash → `setterSessions` row → rosterId. Every setter query/mutation takes `sessionToken`, not rosterId.

---

## Phase 1 — accounts, app shell, richer EOD form

### Task 1: Schema additions

**Files:** Modify `apps/web/convex/schema.ts`

**Produces (verbatim):**
```ts
// setterRoster gains:
email: v.optional(v.string()),
pod: v.optional(v.string()),

// setterEodEntries gains:
callsOnCalendar: v.optional(v.number()),
callsShown: v.optional(v.number()),
callsClosed: v.optional(v.number()),

// new tables:
setterMagicCodes: defineTable({
  email: v.string(),            // lowercased
  rosterId: v.id("setterRoster"),
  codeHash: v.string(),         // sha256, constant-time compare
  createdAt: v.number(),
  expiresAt: v.number(),        // +15 min
  attempts: v.number(),         // lockout at 5
  usedAt: v.optional(v.number()),
}).index("by_email", ["email"]),

setterSessions: defineTable({
  rosterId: v.id("setterRoster"),
  teamId: v.id("teams"),
  tokenHash: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),        // +90 days
  lastSeenAt: v.number(),
}).index("by_token_hash", ["tokenHash"]).index("by_roster", ["rosterId"]),

setterCallMatches: defineTable({
  teamId: v.id("teams"),
  rosterId: v.id("setterRoster"),
  callId: v.id("calls"),
  token: v.string(),            // the "(e)" token that matched, lowercased
  matchedAt: v.number(),
}).index("by_roster", ["rosterId", "matchedAt"]).index("by_call", ["callId"]).index("by_team", ["teamId"]),

setterCallDismissals: defineTable({
  rosterId: v.id("setterRoster"),
  callId: v.id("calls"),
  createdAt: v.number(),
}).index("by_roster_and_call", ["rosterId", "callId"]),

scorecardBaselines: defineTable({
  teamId: v.id("teams"),
  weekKey: v.string(),          // Saturday-start date "YYYY-MM-DD"
  rows: v.string(),             // JSON snapshot of ledger rows at lock time
  cdpbc: v.optional(v.number()),
  lockedAt: v.number(),
}).index("by_team_and_week", ["teamId", "weekKey"]),
```

Steps: add fields/tables → `npx convex codegen` → `npx tsc --noEmit` → deploy → commit `schema.ts` + `_generated/`.

### Task 2: Setter magic-link auth (`convex/setterAuth.ts`, new file)

**Interfaces produced:**
- `requestSetterCode` (public action): `{email}` → `{sent: boolean, error?}`. Lowercase email, find ACTIVE roster row by email (scan `setterRoster` — table is small — matching `email`), generic failure copy "No setter account found for that email — ask your manager to add it" (B2B enumeration rule: say so plainly). CSPRNG 6-digit code, sha256 hash stored, Resend email from `Sequ3nce <noreply@noreply.sequ3nce.ai>`, 60s resend cooldown per email. Mirror `closerMagicLink.ts` mechanics exactly (read it first).
- `verifySetterCode` (public action): `{email, code}` → `{sessionToken?, error?}`. Constant-time hash compare, single-use (`usedAt`), 15-min expiry, attempts++ with lockout at 5. On success: create `setterSessions` row (CSPRNG 32-byte token, store hash, return raw token once).
- `resolveSetterSession` (internalQuery): `{sessionToken}` → `{rosterId, teamId, name, pod} | null`. Hash lookup, expiry check, roster row must still be `active` (deactivation kills live sessions). Patches `lastSeenAt` via a separate `touchSession` internalMutation called from actions, NOT from this query (queries can't write).
- `logoutSetter` (public mutation): `{sessionToken}` deletes the session row.

**Verification (CLI):** `npx convex run --prod setterAuth:requestSetterCode '{"email":"nobody@nowhere.com"}'` → clear no-account error. Full code flow tested with a temp roster row on Tyler's team (`js7457d9czge9s3bc310hmfhjh7xd2r4`), wrong-code ×5 → lockout, correct → token, `resolveSetterSession` roundtrip, deactivate row → resolve returns null. Delete temp row after.

### Task 3: Setter-scoped data functions (`convex/setterApp.ts`, new file)

**Interfaces produced (all take `sessionToken` and resolve via `resolveSetterSession`; null session → null/error):**
- `getSetterHome` (query): `{sessionToken}` → `{name, pod, teamName, filedToday: boolean, todayEntry?: {dials, pickUps, sets, newLeadsHit, followUps, callsOnCalendar?, callsShown?, callsClosed?}}`. Day key via team timezone (reuse `dayKeyInTz` from `closerPerformance.ts` — same helper the EOD board uses).
- `submitEod` (mutation): `{sessionToken, dials, pickUps, sets, newLeadsHit, followUps, callsOnCalendar, callsShown, callsClosed, note?}` — same validation as the existing token form (non-negative integers, pickUps ≤ dials, no cross-field rules on the new three) + resubmit-replaces-same-day (find `by_roster_and_day`, patch or insert). Reuse/extract the existing submit logic from `setterEod.ts` into a shared helper so the token form and the app CANNOT drift.

**Also in this task:** add the three new fields to the EXISTING tokenized form path (`setterEod.ts` submit + `/setter-eod/[token]` page UI) so data accrues from day one regardless of login adoption.

**Verification:** CLI submit via a temp session; resubmit same day replaces; `getEodBoard` (Zion's board) still renders old entries (new fields optional).

### Task 4: App shell + login + EOD tab (`src/app/setter/…`)

**Files:**
- `src/app/setter/layout.tsx` — Geist font, white, minimal chrome: wordmark, setter name, tab nav (EOD · Calls You've Set · Scorecard · Projections), sign-out. Session token in an HttpOnly cookie is impossible from static Next without a route handler — use a route handler `src/app/setter/api/session/route.ts` that sets/clears the cookie (`sequ3nce_setter_session`, HttpOnly, Secure, SameSite=Lax, 90d); client components read auth state via a `getSetterHome` fetch through a thin client that includes the cookie via a server-side proxy route OR (simpler, matching the closer app's established pattern) store the token in `localStorage` and pass it in query args — **follow whatever `src/lib/closer/client.ts` does for closer sessions; match it exactly** so the two apps share one security model.
- `src/app/setter/page.tsx` — login screen (email → code → in) OR redirect to `/setter/eod` when a session exists.
- `src/app/setter/eod/page.tsx` — the EOD form tab: today's status ("Filed ✓ at 6:42pm — edit and resubmit" vs "Not filed yet"), 8 numeric fields in Zion's language, note field, submit. Mobile-first — setters file from phones.
- `src/app/setter/_components/SetterShell.tsx`, `LoginCard.tsx`, `EodForm.tsx` (keep files small).

**Verification:** `npx next build` clean; manual flow on localhost against prod (localhost points at prod — memory): request code to a temp roster row with Tyler's email, log in, file an EOD, confirm on Zion's board query.

### Task 5: Slack reminder swap + token transition

**Files:** Modify `convex/setterEodNotifications.ts` (reminder block-builder only), `src/app/setter-eod/[token]/` page.

- Reminder message: names + filed-state per setter as today, but ONE link: `https://www.sequ3nce.ai/setter` ("Open the setter app"). Remove per-setter tokenized links from the blocks. Missing-report untouched.
- Tokenized form page: add the three new fields (done in Task 3); add a banner "Setter app is live — sign in with your email at sequ3nce.ai/setter". Add `setterEodTokenFormDisabledAfter` team field? NO — YAGNI: the transition is operational, not coded. After one week, rotate all tokens via existing CLI (`setterEod:hardDeleteSetter` is delete; rotation = patch new token) — write a tiny `setterEod:rotateAllTokens` internalMutation `{teamId}` for that day.
- **Verification:** `previewNotifications` shows the new copy with zero tokens in output; `sendTest` to Tyler's own team channel only (NOT E2's) unless Tyler approves a live E2 test.

**Phase 1 exit:** tsc + build + deploy clean; commit chain pushed from `main`; Zion can enter emails/pods (roster card gains those two inputs — fold into Task 4's PR on `RosterCard.tsx`); E2 setters can log in and file.

---

## Phase 2 — Calls You've Set

### Task 6: The matcher (`convex/lib/setterTitleMatch.ts`, new pure lib + bench)

**Produces:**
```ts
export function extractSetterToken(title: string | undefined | null): string | null {
  // Leading parenthesized 1–3 letter token: "(e) Tim and Karl" → "e",
  // "(Mo)Paul X Karl" → "mo", "(IY) Consult" → "iy". Case-insensitive,
  // tolerates spaces inside parens. Anything else → null.
  const m = /^\s*\(\s*([A-Za-z]{1,3})\s*\)/.exec(title ?? "");
  return m ? m[1].toLowerCase() : null;
}

export function matchToken(token: string, rosterNames: Array<{rosterId: string, firstName: string}>): string[] {
  // Primary: token is a case-insensitive prefix of a first name.
  // Fallback (overshoot): first letter of token matches first letter of name.
  // Returns rosterIds; empty when nothing matches.
  const t = token.toLowerCase();
  const prefix = rosterNames.filter(r => r.firstName.toLowerCase().startsWith(t));
  if (prefix.length > 0) return prefix.map(r => r.rosterId);
  return rosterNames.filter(r => r.firstName.toLowerCase().startsWith(t[0])).map(r => r.rosterId);
}
```
Plus `setterTitleMatchBench` internalQuery in a new `convex/setterCallMatching.ts` that runs a fixed case table and returns pass/fail per case — the repo's convention for unit-testing pure logic from the CLI.

**Bench cases (must all pass):** `("(e) Tim and Karl", [Erten, Ethan…]) → [Erten, Ethan]`; `"(Mo)Paul X Karl" → [Mo]`; `"(M) Fabian and Joseph" → [Marcus, Mo]`; `"(IY) Ai Implementation Consult" → [Israel]` (fallback); `"(N) Kris/Gresham" → [Noah]`; `"Canceled: (e) X" → null` (token not at start); `"Tim and Karl" → null`; `"(SOPH)" → null` (4 letters, no match — regex caps at 3).

### Task 7: Match persistence + hooks + backfill (`convex/setterCallMatching.ts`)

- `matchCallForTeam` (internalMutation): `{callId}` — load call; skip unless status `completed`, `classifiedAs !== "internal"`, team has active roster rows with the beta flag `setter_eods`; extract token from `call.prospectName ?? call.meetingTitle`-equivalent (the bot stores the calendar title in the call's prospectName for bot calls — read `meetingBot.ts`'s call-creation to confirm the exact field and use that); upsert `setterCallMatches` rows (idempotent: skip existing rosterId+callId pairs).
- Hook: schedule `matchCallForTeam` where calls flip to completed for bot calls — the same place `syncCallStats`/summary scheduling happens in `meetingBot.ts` (one `ctx.scheduler.runAfter(0, …)` line; do NOT modify existing behavior).
- `backfillMatches` (internalMutation): `{teamId, sinceDays}` — paginated walk (Convex cursor, 100/page, self-rescheduling — NEVER kick twice) over `by_team_and_date` completed calls, running the same upsert. Also `rematchForRoster` `{rosterId}` = backfill filtered to that name (new-setter case).
- **Verification:** bench passes; run `backfillMatches` for E2 60d; spot-check counts vs a manual grep of titles (`callSourceCensus`-style diagnostic addition `matchCensus {teamId}` returning per-setter match counts + unmatched-token list).

### Task 8: Setter call queries + dismissals (`convex/setterApp.ts` additions)

- `getMyCalls` (query): `{sessionToken}` → array of `{callId, dateMs, displayTitle (token stripped via regex from Task 6), closerName, durationSec, outcome}` — matches for my rosterId minus my dismissals, desc by call date, `take(200)`.
- `dismissCall` (mutation): `{sessionToken, callId}` — verify a match row exists for MY rosterId+callId (else reject), insert dismissal. `undismissCall` reverses it. Dismissed calls reachable through `getMyDismissedCalls` (query, same shape) so the UI can offer undo.
- `getMyCallDetail` (query): `{sessionToken, callId}` — verify match row for my rosterId (a setter can never load an arbitrary call), then return the same shape the closer detail uses: call fields + `callContent` (transcriptText, summary), ammo rows, `callAnalysis`, recording URL. Read `getCallWithContent` / the closer detail route in `http.ts` for the exact assembly and reuse its helpers.

### Task 9: Calls You've Set UI (`src/app/setter/calls/…`)

- `calls/page.tsx` — list per Task 8, outcome badges reusing the calls-page badge logic (incl. Internal/No-conversation rules), "Not my call" per row with instant-undo toast, "Dismissed (n)" collapsible section at the bottom.
- `calls/[callId]/page.tsx` — read-only call detail: video player (recordingUrl / externalShareUrl), tabs Overview (AI summary, ammo, post-call data INCLUDING outcome/cash — decision 4) / Analysis / Transcript. Build `SetterCallDetail.tsx` fresh, borrowing render subcomponents from `src/app/app/_components/CallDetail*` where they're pure display; NEVER import `CallFactsInlineEditor`, `CallClassificationBanner`, flag-for-review, or share-link controls.
- **Verification:** as a temp-session setter matched to a real E2 call (create the match row by hand, then delete): list renders, detail renders, dismiss hides, undo restores, direct-URL access to an unmatched callId → "not yours" screen. `tsc` + `build`.

**Phase 2 exit:** deploy + surgical push; run E2 backfill; tell Tyler the per-setter match counts so Zion can sanity-check one setter's list.

---

## Phase 3 — Scorecard

### Task 10: Weekly actuals query (`convex/scorecard.ts`, new file)

- `getScorecardWeek` (query): `{clerkId | sessionToken, weekStart: string}` — dual-auth: Zion via clerkId (manager check, same as `getEodBoard`), setter via sessionToken. Returns `{weekStart, rows: [{rosterId, name, pod, dials, connects, sets, booked, showed, closed}], baseline?: {rows, cdpbc, lockedAt}}`.
  - Aggregation: `setterEodEntries` `by_team_and_day` for the 7 dayKeys of the Sat–Sat week (weekStart = the Saturday, team-timezone dayKeys); per roster row sum `dials`, `pickUps`→connects, `sets`, `callsOnCalendar`→booked, `callsShown`→showed, `callsClosed`→closed. Active roster rows with no entries appear zeroed.
  - `listScorecardWeeks` (query): same auth → last 12 Saturdays with entry counts, for the week picker.
- `lockBaseline` (mutation): `{clerkId, weekStart, rows: string (JSON), cdpbc?}` — manager-only; upsert `scorecardBaselines` `by_team_and_week`. `clearBaseline` (mutation) removes it. Setter sessions calling these → rejected (verify in tests).
- **Verification:** CLI — aggregate a week of E2's real entries, cross-check one setter's totals against `getEodBoard` day sums; setter-session call to `lockBaseline` rejected.

### Task 11: The ledger engine (`src/components/scorecard/`)

Port the reference HTML (`docs/superpowers/specs/2026-08-23-setter-scorecard-reference.html`) to React with its math verbatim:
- `engine.ts` — pure functions lifted from the file's script: `ratesOf`, `cascadeWith`, `distribute`, `teamSetCount`, `rollup`, extended with `closed` (rollup sums it; `setToClose = pct(closed, sets)`). Fields array becomes `["dials","connects","sets","booked","showed"]` + closed handled OUTSIDE the cascade (closes don't cascade from shows — they're reported, not derived; editing closed only changes closed and the set→close rate).
- `Scorecard.tsx` — the component: props `{rows, baseline, mode: "manager" | "readonly" | "sandbox", ownRosterId?, cdpbc, onLockBaseline?, onCdpbcChange?}`.
  - `manager`: everything editable (per-cell cascade, team row pro-rata, rate drivers, add/remove rows, name edits), Lock/Revert/Reset buttons wired to the persistence callbacks.
  - `readonly`: no inputs anywhere — plain rendered values.
  - `sandbox`: inputs ONLY on the row where `rosterId === ownRosterId`; other rows + team row + rate drivers rendered read-only and visually dimmed (`opacity: .45`); Reset returns to actuals; no Lock. Team totals & funnel & CDPBC box recompute live from the edited own-row.
- `FunnelBars.tsx`, `LedgerTable.tsx`, `DriverPanel.tsx`, `CapacityCards.tsx` — split to keep each file <300 lines; CSS module reproducing the paper-ledger palette/typography from the reference file (scoped so it doesn't inherit the app shells' styling). Extra column: **Closed** + **Set→close** in the rates group. Honesty footnote verbatim-adapted: numbers are setter-reported via EOD forms; set→calendar and show are directional (different cohorts).
- **Verification:** an `engineBench` — a small script (`npx tsx src/components/scorecard/engine.bench.ts` or a plain node file) seeding the engine with the reference file's SEED array and asserting `rollup` produces pickup 7.6%… (compute expected values from the HTML in-browser once and hard-code them into the bench); cascade case: set Erten dials 1216→2000 → downstream fields equal `cascadeWith` outputs.

### Task 12: Three mounts

- **Zion:** new `ScorecardCard` section on `src/app/dashboard/setter-eods/page.tsx` (below the board): week picker, `mode="manager"`, Lock → `lockBaseline` with JSON rows + cdpbc; on load, baseline from `getScorecardWeek`. CDPBC input persists via lockBaseline's cdpbc (saving cdpbc without locking rows: `lockBaseline` accepts rows:null → patches cdpbc only — adjust signature: `rows: v.optional(v.string())`).
- **Setter Scorecard tab:** `src/app/setter/scorecard/page.tsx`, `mode="readonly"`, same week picker, cdpbc = Zion's persisted value.
- **Setter Projections tab:** `src/app/setter/projections/page.tsx`, `mode="sandbox"`, `ownRosterId` from session; banner: "Play with your own numbers — nothing here saves."
- **Verification:** manual walkthrough of all three mounts on localhost with a temp session + Tyler's manager login; sandbox editing another row is impossible (inputs absent, not just disabled — inspect DOM); reload sandbox → actuals; Zion lock → reload → baseline deltas persist.

**Phase 3 exit:** tsc/build/deploy; surgical push; memory + `e2-custom-setter-build.md` updated; walkthrough message to Tyler for Zion.

## Self-review notes (done)

- Spec coverage: decisions 1–8 map to Tasks 2/5, 5, 5, 9, 6, 11(sandbox), 10+12, 4+11. New EOD fields on BOTH forms (Task 3). Set-to-close (Tasks 10/11). Pods (Tasks 1/4/11). Backfill + roster-change rematch (Task 7). Deactivation kills sessions (Task 2).
- Type consistency: `sessionToken` arg name everywhere; ledger row shape `{rosterId, name, pod, dials, connects, sets, booked, showed, closed}` used in Tasks 10/11/12; weekStart = Saturday "YYYY-MM-DD" in 10/12.
- Known judgment calls the implementer may adjust with evidence: closer-session storage pattern (Task 4 defers to the closer app's existing mechanism); exact call-title field for the matcher (Task 7 says confirm in `meetingBot.ts` first).
