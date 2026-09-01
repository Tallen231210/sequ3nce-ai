# Closer Scorecard (E2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manager-facing Closer Scorecard sub-tab in the dashboard's Team Performance area — per-closer ledger with CDPBC/booked-close-rate KPIs, tier-pitch table, what-if panel, EOD filing visibility — fed by the existing three-layer daily data (override > entry > measured), extended with follow-up + tier-pitch fields, an AI follow-up title matcher, and a per-call "confirm strip" on the closer's EOD form.

**Architecture:** Mirror the setter scorecard exactly: a pure computation engine ported from the reference HTML with a node CLI bench, a Convex range query that resolves precedence field-by-field, `scorecardBaselines` reuse with a `closer_` key prefix, and a client-side whiteboard grid. All schema changes are additive. New Convex functions live in a NEW file (`closerScorecard.ts`); existing shared functions are extended only where the spec requires (entry/override field allowlists, the daily recount, `updateOwnCallFacts`).

**Tech Stack:** Next.js 16 / React 19 (apps/web), Convex ^1.30 (shared backend), Tailwind, no test framework — CLI benches (`node *.bench.mjs` + `npx convex run --prod <fn>`) and `npx tsc --noEmit` are the verification tools.

**Spec:** `docs/superpowers/specs/2026-08-25-closer-scorecard-design.md` (read it first — decisions there are locked) and `docs/superpowers/specs/2026-08-25-closer-scorecard-reference.html` (the math to port, ~line 140 onward).

## Global Constraints

- Schema changes are **additive only** — never remove or rename fields (CLAUDE.md).
- Convex is shared by 3 apps: add new functions; do not change existing function signatures. Extending an existing function's *return object* with new optional keys is allowed; changing args is not (exception: the `values` validator on `saveCloserDailyEntry` and allowlists, which the spec explicitly extends — optional fields only, old callers unaffected).
- After any Convex change: `npx convex codegen` (run from `apps/web/`), commit `convex/_generated/`, or Vercel fails the build.
- Every task ends with `cd apps/web && npx tsc --noEmit` clean. Final task also runs `npx next build` and `npx convex deploy --yes`.
- Files ≤ ~300 lines; split when bigger.
- Deploys go to prod `ideal-ram-982` (localhost frontend points there too). `npx convex run` benches use `--prod`.
- Git: work on branch `closer-scorecard` off `main`; commit per task; do NOT push other terminals' work — `git add` specific paths only, never `git add -A`.
- Manager gating for all new dashboard mutations: `resolveAuthUser` + `role === "admin" || role === "manager"` (copy `canEdit` from `apps/web/convex/closerPerformanceMutations.ts:51-53`).
- Closer-app endpoints: HTTP routes with `closerFromBody` session resolution + `closerPreflight` CORS registration (pattern at `apps/web/convex/http.ts:12495-12539`). The closer app has NO convex/react — all data via `apps/web/src/lib/closer/client.ts` functions using `convexFetch`.
- Provenance rule (standing E2 rule): never silently blend self-reported with measured; every scorecard cell/total says where it came from.
- Money caps: counts ≤ 1000 integers, cash ≤ 100_000_000 (`MAX_ENTRY_COUNT`/`MAX_ENTRY_CASH` in closerPerformanceMutations.ts:286-287).
- The dayKey is TEAM-LOCAL `YYYY-MM-DD` via `dayKeyInTz(ms, team.timezone || DEFAULT_TIMEZONE)` from `apps/web/convex/closerPerformance.ts:55`.

---

### Task 1: Additive schema fields + codegen

**Files:**
- Modify: `apps/web/convex/schema.ts` (four spots: `closerDailyStats` ~:3448, `closerDailyOverrides` ~:3490, `closerDailyEntries` ~:3545, `teams` closer-settings block ~:492-526)

**Interfaces:**
- Produces: optional fields `fuBooked`, `fuShown` on `closerDailyStats`; `fuBooked`, `fuShown`, `tier1Pitched`, `tier2Pitched`, `tier3Pitched` on both `closerDailyEntries` and `closerDailyOverrides`; `closerTierPrices: v.optional(v.array(v.number()))`, `closerCostPerBookedCall: v.optional(v.number())`, `closerTargetCdpbc: v.optional(v.number())` on `teams`. Also `factsConfirmedAt: v.optional(v.number())` on `calls`.

- [ ] **Step 1: Add the daily-table fields.** In `closerDailyStats` (find `recountedAt: v.number(),` inside it), insert above `recountedAt`:

```ts
    // Follow-ups measured from the meeting-title convention ("follow up" in
    // the title — see convex/lib/followUpTitle.ts). Absent until a team
    // adopts the convention; the closer's manual EOD fields cover the gap.
    fuBooked: v.optional(v.number()),
    fuShown: v.optional(v.number()),
```

In `closerDailyEntries` (above its `confirmedAt: v.number(),`):

```ts
    // Closer Scorecard manual fields (2026-09: follow-ups + tier pitches).
    fuBooked: v.optional(v.number()),
    fuShown: v.optional(v.number()),
    tier1Pitched: v.optional(v.number()),
    tier2Pitched: v.optional(v.number()),
    tier3Pitched: v.optional(v.number()),
```

In `closerDailyOverrides` (above its `updatedByClerkId`):

```ts
    fuBooked: v.optional(v.number()),
    fuShown: v.optional(v.number()),
    tier1Pitched: v.optional(v.number()),
    tier2Pitched: v.optional(v.number()),
    tier3Pitched: v.optional(v.number()),
```

- [ ] **Step 2: Add the team settings.** In the `teams` table, directly after `closerPrizeTarget: v.optional(v.number()),` (end of the Team Performance Sheet block, ~schema.ts:526), insert:

```ts
    // ---- Closer Scorecard (per-client custom tab; E2 first) ----
    // Package price per tier, lowest first, e.g. [6800, 9800, 20000].
    // Teams without this configured see no tier inputs anywhere.
    closerTierPrices: v.optional(v.array(v.number())),
    // What the team pays in ads per booked call — a typed setting, not
    // derived (no ad-spend feed; see docs/superpowers/specs design doc).
    closerCostPerBookedCall: v.optional(v.number()),
    // Zion's target collected-per-booked-call; drives performance delta $.
    closerTargetCdpbc: v.optional(v.number()),
```

- [ ] **Step 3: Add the per-call confirmation stamp.** In the `calls` table, directly after `outcomeSource: v.optional(v.string()),` (~schema.ts:1055), insert:

```ts
    // Set when the closer explicitly confirmed this call's figures on the
    // EOD confirm strip (or edited them, which implies confirmation).
    // Distinct from outcomeSource: an untouched AI call can still be
    // human-CONFIRMED without becoming closer-SOURCED.
    factsConfirmedAt: v.optional(v.number()),
```

- [ ] **Step 4: Codegen + typecheck**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx convex codegen && npx tsc --noEmit 2>&1 | grep -v "node_modules/" | head -20`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git checkout -b closer-scorecard
git add apps/web/convex/schema.ts apps/web/convex/_generated/
git commit -m "Closer Scorecard: additive schema fields (FU, tier pitches, team settings, call confirmation stamp)"
```

---

### Task 2: Follow-up title matcher (pure lib + CLI bench)

**Files:**
- Create: `apps/web/convex/lib/followUpTitle.ts`
- Create: `apps/web/convex/closerScorecard.ts` (starts life holding only the bench; grows in Task 8)

**Interfaces:**
- Produces: `isFollowUpTitle(title: string | undefined | null): boolean` — consumed by Task 3 (recount) and nothing else.
- Produces: `followUpTitleBench` internalQuery in `closerScorecard.ts`, run via `npx convex run --prod closerScorecard:followUpTitleBench '{}'`.

- [ ] **Step 1: Write the matcher** — `apps/web/convex/lib/followUpTitle.ts`:

```ts
/**
 * Follow-up call detection from the meeting title.
 *
 * Zion's convention (confirmed 2026-09-01): the words "follow up" appear in
 * the call title. We match the spelling variants anywhere in the title,
 * case-insensitively: "follow up", "follow-up", "followup". "FU" alone is
 * deliberately NOT matched — two letters collide with initials and the
 * setter-tag convention (see lib/setterTitleMatch.ts).
 *
 * Coexists with setter tags: "(er) Follow-up call — John x Ethan" is both
 * setter-attributed to Ethan AND a follow-up.
 */
export function isFollowUpTitle(title: string | undefined | null): boolean {
  if (!title) return false;
  return /follow[\s-]?up/i.test(title);
}
```

- [ ] **Step 2: Write the bench** — create `apps/web/convex/closerScorecard.ts`:

```ts
/**
 * Closer Scorecard — E2's manager-facing closer analogue of the setter
 * scorecard. Spec: docs/superpowers/specs/2026-08-25-closer-scorecard-design.md
 *
 * NOT to be confused with:
 *  - closerScorecardData.ts / closerScorecardSettings.ts — the daily
 *    Slack/Discord post for the Team Performance board (July 2026).
 *  - scorecard.ts — the SETTER weekly projection scorecard.
 */
import { internalQuery } from "./_generated/server";
import { isFollowUpTitle } from "./lib/followUpTitle";

/** CLI bench for the follow-up matcher (repo convention: unit tests are
 * internalQuery benches — npx convex run --prod closerScorecard:followUpTitleBench '{}'). */
export const followUpTitleBench = internalQuery({
  args: {},
  handler: async () => {
    const cases: Array<{ title: string; expect: boolean }> = [
      { title: "Follow up - John x Ethan", expect: true },
      { title: "(er) Follow-up call", expect: true },
      { title: "followup w/ John", expect: true },
      { title: "FOLLOW UP: payment", expect: true },
      { title: "John Follow    up", expect: false }, // double space is not a variant we claim... see below
      { title: "(er) John x Ethan", expect: false },
      { title: "FU John", expect: false },
      { title: "Fellowship onboarding", expect: false },
      { title: "", expect: false },
    ];
    const results = cases.map((c) => ({
      title: c.title,
      got: isFollowUpTitle(c.title),
      pass: isFollowUpTitle(c.title) === c.expect,
    }));
    return { allPass: results.every((r) => r.pass), results };
  },
});
```

Note on the fifth case: `/follow[\s-]?up/i` matches at most ONE separator char, so `"Follow    up"` (multiple spaces) does not match. If you decide multi-space should match, change the regex to `/follow[\s-]*up/i` AND flip that case's `expect` to `true` — but then `"followsup"`-style false positives stay impossible only because `\s` doesn't match letters, which is fine. Pick `[\s-]*` (generous, matches the "match generously" instruction in the spec) and set `expect: true`. Final regex: `/follow[\s-]*up/i`.

- [ ] **Step 3: Apply the final regex decision** — in `followUpTitle.ts` use `/follow[\s-]*up/i` and in the bench set the multi-space case to `expect: true`.

- [ ] **Step 4: Codegen, typecheck, deploy, run the bench**

Run: `cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx convex codegen && npx tsc --noEmit 2>&1 | grep -v node_modules | head -5 && npx convex deploy --yes && npx convex run --prod closerScorecard:followUpTitleBench '{}'`
Expected: `"allPass": true`.

- [ ] **Step 5: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/convex/lib/followUpTitle.ts apps/web/convex/closerScorecard.ts apps/web/convex/_generated/
git commit -m "Closer Scorecard: follow-up title matcher + CLI bench"
```

---

### Task 3: Measured FU layer in the daily recount

**Files:**
- Modify: `apps/web/convex/closerPerformance.ts` (`recountDayImpl`, ~:84-443)

**Interfaces:**
- Consumes: `isFollowUpTitle` from `./lib/followUpTitle` (Task 2).
- Produces: `closerDailyStats.fuBooked` / `fuShown` populated by every recount. Ships ON from day one — matches nothing until E2 titles calls with "follow up".

- [ ] **Step 1: Read the function.** Read `apps/web/convex/closerPerformance.ts:84-443` fully before editing. Key anchors: the per-closer accumulator map `byCloser` is created near the top with fields `{slots, booked, taken, offers, closes, cash, contractValue, missingOutcomes, ...}`; the completed-calls loop is at ~:129-158; the calendar-events grouped loop (`for (const [, copies] of copiesByUid)`) is at ~:256-300 where `booked += 1` happens; the persist block is ~:376-443.

- [ ] **Step 2: Extend the accumulator.** Where the per-closer row object literal is initialized (each field starting at 0), add `fuBooked: 0, fuShown: 0`.

- [ ] **Step 3: Count fuBooked + fuShown in the calendar loop.** Import at the top of the file:

```ts
import { isFollowUpTitle } from "./lib/followUpTitle";
```

Inside the `copiesByUid` loop, in the branch where a booking is attributed (`if (ownerId && byCloser.has(ownerId))` — right where `booked += 1` happens), add:

```ts
      if (isFollowUpTitle(ev.title)) {
        const row = byCloser.get(ownerId)!;
        row.fuBooked += 1;
        // "FU shown" derives from presence evidence on the recorded call
        // linked to this booking — prospectJoined is the honest signal
        // (schema.ts:922-925). No call or no evidence = not shown.
        const linkedCall = callsByEventId.get(String(ev._id));
        if (linkedCall && linkedCall.prospectJoined === true) {
          row.fuShown += 1;
        }
      }
```

`callsByEventId` does not exist yet. The completed-calls loop already iterates `calls` (fetched at ~:103-112); before the calendar loop, build the lookup from that same array:

```ts
  // callId lookup by calendar event, for FU show evidence.
  const callsByEventId = new Map<string, Doc<"calls">>();
  for (const call of calls) {
    if (call.calendarEventId) callsByEventId.set(String(call.calendarEventId), call);
  }
```

(`calendarEventId` is `calls` schema.ts:995. `Doc` is already imported in this file.)

- [ ] **Step 4: Persist the new fields.** In the persist block (~:376-443) where the patch/insert object is built with `slots/booked/taken/offers/closes/cash/contractValue`, add `fuBooked: row.fuBooked, fuShown: row.fuShown`. Also extend the "is the row empty" check if one exists (a row with only fuBooked > 0 must persist).

- [ ] **Step 5: Typecheck + deploy + live-verify on a real E2 day**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -v node_modules | head -5 && npx convex deploy --yes`

Then recount one recent E2 day (recount is an absolute recompute — safe, idempotent) and inspect:

```bash
npx convex run --prod closerPerformance:recountCloserDay '{"teamId":"js7ak2980wehyj0070ygsg6sms8cf84d","dayKey":"<yesterday YYYY-MM-DD>"}'
npx convex data closerDailyStats --prod --limit 5
```

Expected: rows carry `fuBooked: 0, fuShown: 0` (E2 hasn't adopted the titling yet — zero is the correct answer; the matcher bench from Task 2 is the positive test).

- [ ] **Step 6: Commit**

```bash
git add apps/web/convex/closerPerformance.ts
git commit -m "Closer Scorecard: recount measures fuBooked/fuShown from the follow-up title convention"
```

---

### Task 4: Entry/override plumbing for the five new fields

**Files:**
- Modify: `apps/web/convex/closerPerformanceMutations.ts` (`OVERRIDE_FIELDS` :22-24, `ENTRY_FIELDS` :281-283, `validateEntry` :289-302, `saveCloserDailyEntry` values validator :304-320)
- Modify: `apps/web/convex/closerSelfPerformance.ts` (`getSelfDailyEntries` :191-278 — new fields in `measured`/`reported`/`managerCorrected` + return `tierPrices`)

**Interfaces:**
- Consumes: schema fields from Task 1.
- Produces: `saveCloserDailyEntry` accepts `fuBooked/fuShown/tier1Pitched/tier2Pitched/tier3Pitched` in `values` (optional — old callers unaffected). `setDailyOverride` accepts the same five in its `field` arg. `getSelfDailyEntries` returns each row's new fields under the same `measured`/`reported`/`managerCorrected` records, plus a top-level `tierPrices: number[] | null`.

- [ ] **Step 1: Extend the allowlists + validators.** In `closerPerformanceMutations.ts`:

```ts
const OVERRIDE_FIELDS = [
  "slots", "booked", "taken", "offers", "closes", "cash",
  "fuBooked", "fuShown", "tier1Pitched", "tier2Pitched", "tier3Pitched",
] as const;
```

```ts
const ENTRY_FIELDS = [
  "slots", "booked", "taken", "offers", "closes", "cash", "contractValue",
  "fuBooked", "fuShown", "tier1Pitched", "tier2Pitched", "tier3Pitched",
] as const;
```

The five new fields are all counts: `validate()`/`validateEntry()` treat any non-cash field as an integer 0..1000 — confirm both do so via the existing `money`/field-name check (they branch on `field === "cash"`-style checks; new fields fall into the integer branch automatically since they're not named there). Add to `saveCloserDailyEntry`'s `values: v.object({...})` validator:

```ts
      fuBooked: v.optional(v.union(v.number(), v.null())),
      fuShown: v.optional(v.union(v.number(), v.null())),
      tier1Pitched: v.optional(v.union(v.number(), v.null())),
      tier2Pitched: v.optional(v.union(v.number(), v.null())),
      tier3Pitched: v.optional(v.union(v.number(), v.null())),
```

- [ ] **Step 2: Extend `getSelfDailyEntries`.** In `closerSelfPerformance.ts:191-278`, the row builder maps explicit field lists into `measured`, `reported`, `managerCorrected`. Add `fuBooked`/`fuShown` to the `measured` record (from `closerDailyStats`, default 0) and all five fields to `reported` (from the entry doc) and `managerCorrected` (from the override doc). Then, before the return, load the team once (it already loads the closer; get `teamId` from it) and include:

```ts
      tierPrices: team?.closerTierPrices ?? null,
```

in the top-level return object (alongside `monthKey, timezone, todayKey, rows`).

- [ ] **Step 3: Typecheck + deploy**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -v node_modules | head -5 && npx convex deploy --yes`

- [ ] **Step 4: Round-trip verify via CLI** — save an entry with the new fields for the Playwright/test closer on Tyler's team, read it back:

```bash
npx convex run --prod closerPerformanceMutations:saveCloserDailyEntry '{"closerId":"<a test closer id>","dayKey":"<today>","values":{"fuBooked":2,"tier1Pitched":1}}'
npx convex data closerDailyEntries --prod --limit 3
```

Expected: the row shows `fuBooked: 2, tier1Pitched: 1`. Then clear them back (`{"values":{"fuBooked":null,"tier1Pitched":null}}`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/convex/closerPerformanceMutations.ts apps/web/convex/closerSelfPerformance.ts
git commit -m "Closer Scorecard: entry/override plumbing for FU + tier pitch fields"
```

---

### Task 5: EOD form — "Follow-ups & pitches" section

**Files:**
- Modify: `apps/web/src/app/app/numbers/PerformanceDayForm.tsx` (151 lines — extend `FIELDS` handling with a second section)
- Modify: `apps/web/src/lib/closer/client.ts` (`DailyEntryRow` :2393-2401 unchanged in shape — `measured`/`reported` are `Record<string, ...>` so the new keys flow through; add `tierPrices` to the `getCloserDailyEntries` return type at :2432)
- Modify: `apps/web/src/app/app/numbers/NumbersView.tsx` (pass `tierPrices` down)

**Interfaces:**
- Consumes: `getCloserDailyEntries` now returns `tierPrices: number[] | null` (Task 4); `saveCloserDailyEntry` accepts the new keys (Task 4).
- Produces: `PerformanceDayForm` gains prop `tierPrices?: number[] | null`.

- [ ] **Step 1: Add the section fields.** In `PerformanceDayForm.tsx`, after the existing `FIELDS` const, add:

```ts
// Second section: what the AI can't measure yet. FU fields always show;
// tier inputs only when the team has closerTierPrices configured.
export const FU_FIELDS: readonly DayField[] = [
  { key: 'fuBooked', label: 'Follow-ups booked', hint: 'follow-up calls you scheduled' },
  { key: 'fuShown',  label: 'Follow-ups shown',  hint: 'follow-ups where they showed' },
];

export function tierFields(tierPrices: number[] | null | undefined): DayField[] {
  if (!tierPrices || tierPrices.length === 0) return [];
  return tierPrices.slice(0, 3).map((price, i) => ({
    key: `tier${i + 1}Pitched`,
    label: `Pitched @ $${price.toLocaleString()}`,
    hint: 'times you pitched this package',
  }));
}
```

- [ ] **Step 2: Render the section.** Add `tierPrices` to the component props. After the existing `grid grid-cols-4 gap-4` block of base FIELDS and before the submit button, render:

```tsx
      {(FU_FIELDS.length > 0) && (
        <div className="mt-4">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
            Follow-ups &amp; pitches
          </p>
          <div className={compact ? 'grid grid-cols-4 gap-3' : 'grid grid-cols-4 gap-4'}>
            {[...FU_FIELDS, ...tierFields(tierPrices)].map((f) => (
              /* identical input markup to the base FIELDS map — copy the
                 existing field JSX (label, input, manager-corrected amber
                 note, hint) verbatim, driven by the same `values` state */
              <FieldInput key={f.key} f={f} />
            ))}
          </div>
        </div>
      )}
```

To avoid duplicating the input JSX, first extract the existing per-field JSX in this file into a local `FieldInput({ f }: { f: DayField })` closure component inside `PerformanceDayForm` (it closes over `values`, `setValues`, `row`, `compact`) and use it for BOTH the base map and the new section. Keep the file under 300 lines — this refactor pays for itself.

- [ ] **Step 3: Extend state init + submit.** `initialValues(row)` and `submit()` iterate `FIELDS` — change both to iterate `[...FIELDS, ...FU_FIELDS, ...tierFields(tierPrices)]` so the new values hydrate from `row.reported`/`row.measured` (fuBooked/fuShown have a measured layer; tiers don't — `row.measured[key] ?? 0` handles it) and submit as numbers/nulls.

- [ ] **Step 4: Wire tierPrices through.** In `client.ts`, extend the `getCloserDailyEntries` return type with `tierPrices: number[] | null`. In `NumbersView.tsx`, keep it in state next to `rows` and pass `tierPrices={tierPrices}` into both `PerformanceDayForm` mounts (today + history detail if present).

- [ ] **Step 5: Typecheck + visual check**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -v node_modules | head -5`

Then `npm run dev`, sign into the closer app as the test closer (`/app/login`, magic-link code via `npx convex run --prod` — see `closerMagicLink.ts`), open Numbers: the "Follow-ups & pitches" section shows the two FU inputs (no tier inputs — Tyler's team has no `closerTierPrices` yet). Set `closerTierPrices` on Tyler's team via CLI (see Task 8 settings mutation, or `npx convex run --prod` a one-off patch), reload, confirm three labeled tier inputs appear. Enter values, submit, reload — values persist. Screenshot-review the section before declaring done.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/app/numbers/PerformanceDayForm.tsx apps/web/src/app/app/numbers/NumbersView.tsx apps/web/src/lib/closer/client.ts
git commit -m "Closer Scorecard: EOD form gains Follow-ups & pitches section"
```

---

### Task 6: Confirm-strip backend (calls to confirm, confirm-all, add-missed-call)

**Files:**
- Modify: `apps/web/convex/callFacts.ts` (240 lines — stamp `factsConfirmedAt` in `updateOwnCallFacts`; add `confirmOwnCallFacts` + `addManualCall` mutations + `getCallsToConfirm` internalQuery — if this pushes past ~300 lines, put the three new functions in a new `apps/web/convex/callConfirm.ts` instead; decide when you open the file)
- Modify: `apps/web/convex/http.ts` (three new closer routes + preflights, pattern at :12495-12539)
- Modify: `apps/web/src/lib/closer/client.ts` (three new client functions)

**Interfaces:**
- Produces (all consumed by Task 7's UI):
  - `getCallsToConfirm` internalQuery `{ closerId: v.id("closers") }` → `{ calls: ConfirmCall[] }` where `ConfirmCall = { _id, prospectName, startedAt, duration, outcome, cashCollected, contractValue, outcomeSource, factsConfirmedAt }` — completed calls from the last 3 days (catch-up window), oldest first, `.take(60)` cap.
  - `confirmOwnCallFacts` mutation `{ closerId: v.id("closers"), callId: v.id("calls") }` → `{ ok: true }` — sets `factsConfirmedAt: Date.now()` only; ownership-checked like `updateOwnCallFacts` (callFacts.ts:188).
  - `addManualCall` mutation `{ closerId: v.id("closers"), prospectName: v.string(), startedAt: v.number(), outcome: v.string(), cashCollected: v.optional(v.number()), contractValue: v.optional(v.number()) }` → `{ ok: true, callId }`.
  - Client fns: `getCallsToConfirm(closerId)`, `confirmCallFacts(closerId, callId)`, `addManualCall(closerId, data)`.

- [ ] **Step 1: `getCallsToConfirm`.** Use the `by_closer_and_startedAt` index (the `b2cPersonalGoals.ts:79` pattern):

```ts
const CONFIRM_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export const getCallsToConfirm = internalQuery({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const since = Date.now() - CONFIRM_WINDOW_MS;
    const rows = await ctx.db
      .query("calls")
      .withIndex("by_closer_and_startedAt", (q) =>
        q.eq("closerId", args.closerId).gte("startedAt", since),
      )
      .take(60);
    const calls = rows
      .filter((c) => c.status === "completed" && c.countsTowardStats !== false)
      .map((c) => ({
        _id: c._id,
        prospectName: c.prospectName ?? "Unknown prospect",
        startedAt: c.startedAt,
        duration: c.duration ?? null,
        outcome: c.outcome ?? null,
        cashCollected: c.cashCollected ?? null,
        contractValue: c.contractValue ?? null,
        outcomeSource: c.outcomeSource ?? null,
        factsConfirmedAt: c.factsConfirmedAt ?? null,
      }));
    return { calls };
  },
});
```

- [ ] **Step 2: `confirmOwnCallFacts`** — copy the ownership guard from `updateOwnCallFacts` (callFacts.ts:180-195: load call, `call.closerId === args.closerId` else throw), then `ctx.db.patch(args.callId, { factsConfirmedAt: Date.now() })`. No `syncCallStats` needed (no numbers changed), no recount.

- [ ] **Step 3: Stamp confirmation on edits.** In `updateOwnCallFacts` (callFacts.ts:180+), where the patch is applied, add `factsConfirmedAt: Date.now()` to the patch — an edit IS a confirmation.

- [ ] **Step 4: `addManualCall`.** Validation: `outcome` ∈ `["closed","follow_up","lost","no_show"]` (same list as calls.ts:930); `prospectName` trimmed 1..120 chars; `startedAt` within the last 7 days and not future; cash/contract ≥ 0, ≤ 100_000_000; load the closer, derive `teamId` from it (never trust the client). Insert:

```ts
    const callId = await ctx.db.insert("calls", {
      teamId: closer.teamId,
      closerId: args.closerId,
      prospectName: name,
      status: "completed",
      outcome: args.outcome,
      cashCollected: args.cashCollected ?? undefined,
      contractValue: args.contractValue ?? undefined,
      source: "manual",
      classifiedAs: "sales",
      classifiedBy: "closer",
      countsTowardStats: true,
      outcomeSource: "closer",
      factsConfirmedAt: now,
      startedAt: args.startedAt,
      completedAt: now,
      createdAt: args.startedAt, // recount buckets by createdAt (calls.ts:989-992)
    });
    await syncCallStats(ctx, callId);
    scheduleCloserRecount(ctx, closer.teamId, args.startedAt);
```

(Import `syncCallStats` from `./callStats` and `scheduleCloserRecount` from `./closerPerformanceSweep` — both already exported.) The recount then folds the manual call into the measured layer automatically — no parallel bookkeeping.

- [ ] **Step 5: HTTP routes.** In `http.ts`, mirror the `/saveCloserDailyEntry` block exactly (session via `closerFromBody`, never trust body `closerId`): `POST /getCallsToConfirm`, `POST /confirmCallFacts`, `POST /addManualCall`, each with `closerPreflight("/<path>")` registered.

- [ ] **Step 6: Client functions** in `client.ts` (copy the `saveCloserDailyEntry` wrapper shape at :2459-2478):

```ts
export interface ConfirmCall {
  _id: string; prospectName: string; startedAt: number; duration: number | null;
  outcome: string | null; cashCollected: number | null; contractValue: number | null;
  outcomeSource: string | null; factsConfirmedAt: number | null;
}
export async function getCallsToConfirm(closerId: string): Promise<{ calls: ConfirmCall[] }> { ... }
export async function confirmCallFacts(closerId: string, callId: string): Promise<{ success: boolean; error?: string }> { ... }
export async function addManualCall(closerId: string, data: { prospectName: string; startedAt: number; outcome: string; cashCollected?: number; contractValue?: number }): Promise<{ success: boolean; error?: string }> { ... }
```

- [ ] **Step 7: Codegen, typecheck, deploy, CLI round-trip**

Run codegen + tsc + deploy. Then: create a manual call for the test closer via `npx convex run --prod`, verify it appears in `getCallsToConfirm`, confirm it, verify `factsConfirmedAt` set, verify a recount counts it (closes/cash move on that dayKey), then delete the test row (`npx convex run` a one-off or leave it on the test team — test-team data is fine).

- [ ] **Step 8: Commit**

```bash
git add apps/web/convex/callFacts.ts apps/web/convex/callConfirm.ts apps/web/convex/http.ts apps/web/src/lib/closer/client.ts apps/web/convex/_generated/
git commit -m "Closer Scorecard: confirm-strip backend (calls to confirm, confirm-all, manual call entry)"
```

(Drop `callConfirm.ts` from the add if you kept everything in `callFacts.ts`.)

---

### Task 7: Confirm-strip UI on the Numbers tab

**Files:**
- Create: `apps/web/src/app/app/numbers/ConfirmStrip.tsx` (~220 lines)
- Modify: `apps/web/src/app/app/numbers/NumbersView.tsx` (mount it in the `today` section above the day form)

**Interfaces:**
- Consumes: `getCallsToConfirm` / `confirmCallFacts` / `addManualCall` from `client.ts` (Task 6); `CallFactsInlineEditor` (`apps/web/src/app/app/_components/CallFactsInlineEditor.tsx` — props at :35-43, already takes `callId, closerId, outcome, cashCollected, contractValue, outcomeSource, onSaved`).
- Produces: `<ConfirmStrip closerId={...} onDataChanged={() => void load()} />`.

- [ ] **Step 1: Build the component.** Structure (match the OutcomeQueue card idiom, `OutcomeQueue.tsx:80+`, and the closer-app tokens — `CARD`/`LABEL` from `PerformanceStats.tsx:18-19`):

- Wrapper: `rounded-lg border border-gray-200/60 bg-[#fafafa] p-4` with header row: `LABEL`-styled "Your recent calls — confirm the numbers" + a black `Confirm all` button (`px-3 py-1.5 text-[12px] font-semibold text-white bg-black rounded-md hover:bg-gray-800`) that loops `confirmCallFacts` over every unconfirmed row (sequentially, then one refetch).
- Per call row: date/time (`formatCallDate` pattern from `CallHistoryView.tsx:423-428`), prospect name, outcome badge (copy the `OutcomeBadge` map from `CallHistoryView.tsx:383-401`), cash + contract in `text-[13px]`, then either a green `✓ Confirmed` text (when `factsConfirmedAt`) or two actions: a `Confirm` text button and mounting `CallFactsInlineEditor` (its collapsed "Check these figures" link IS the edit affordance — pass `onSaved={refetch}`).
- Source hint: when `outcomeSource === "ai"`, a `text-[11px] text-gray-400` "AI-read" tag on the row — never silently blend.
- Footer: an `+ Add a call we missed` disclosure (text link idiom, `CallFactsInlineEditor.tsx:117-122`) opening a 4-field inline row: prospect name, outcome `<select>` (closed/follow_up/lost/no_show), cash, contract, with a date defaulting to today (`<input type="date">`, max today, min 7 days back) → `addManualCall` → refetch + `onDataChanged()`.
- Empty state: return `null` when zero calls in the window (self-hiding, like `OutcomeQueue.tsx:74`).
- All fetches through the Task 6 client fns in a `useEffect` + manual `refetch`; per-row busy state; inline red error text (no toasts exist in this app).

- [ ] **Step 2: Mount it.** In `NumbersView.tsx`, inside the `today` section render, above the `PerformanceDayForm` block:

```tsx
<ConfirmStrip closerId={closerId} onDataChanged={() => void load()} />
```

`onDataChanged` reloads daily entries because a confirmed edit or manual call changes the measured layer (after the ~5s recount debounce; the reload gets the pre-recount numbers, which is acceptable — the next visit shows the final ones).

- [ ] **Step 3: Typecheck + visual verify.** `npx tsc --noEmit` clean. In the dev app as the test closer: strip lists the last 3 days' completed calls; Confirm marks a row; editing a wrong cash via "Check these figures" saves and stamps confirmed; Add-a-missed-call creates a row that appears in Calls history too. Screenshot-review the strip (desktop width + narrow).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/app/numbers/ConfirmStrip.tsx apps/web/src/app/app/numbers/NumbersView.tsx
git commit -m "Closer Scorecard: per-call confirm strip on the Numbers tab"
```

---

### Task 8: Closer engine (pure lib) + bench

**Files:**
- Create: `apps/web/src/components/closer-scorecard/engine.ts` (~170 lines)
- Create: `apps/web/src/components/closer-scorecard/engine.bench.mjs`

**Interfaces:**
- Produces (consumed by Task 10's UI). ⚠️ Do NOT name any exported type `CloserScorecardRow` — `apps/web/convex/closerScorecardData.ts` already exports that name for the unrelated Slack daily post; ours is `CloserLedgerRow`:

```ts
export const FIELDS = ["booked", "live", "closes", "gross", "collected"] as const;
export type CascadeField = (typeof FIELDS)[number];
export interface CloserLedgerRow {
  closerId: string; name: string;
  booked: number; live: number; closes: number; gross: number; collected: number;
  fub: number; fus: number; p1: number; p2: number; p3: number;
}
export interface CloserRollup { /* sums + all derived, see roll() below */ }
export function pct(n: number, d: number): number | null;
export function rat(n: number, d: number): number | null;
export function ratesOf(r: CloserLedgerRow): number[];
export function cascadeWith(r: CloserLedgerRow, idx: number, rates: number[], val: number): CloserLedgerRow;
export function distribute(rows: CloserLedgerRow[], field: CascadeField, newTotal: number): CloserLedgerRow[];
export function teamSetCount(rows: CloserLedgerRow[], idx: number, newTotal: number): CloserLedgerRow[];
export function roll(rows: CloserLedgerRow[], cpc: number | null): CloserRollup;
export function whatIf(rows: CloserLedgerRow[]): WhatIfResult[];  // per-rep best-swap options
export function deltaDollars(target: number | null, r: CloserRollup | RowRollup): number | null; // (target - cdpbc) * booked
export function tierStats(r: CloserLedgerRow, prices: number[]): { pitched: number; avgTier: number | null; downsellGap: number | null };
export function fp(v: number | null): string; export function fr(v: number | null): string;
export function fn(v: number | null): string; export function money(v: number | null): string;
```

- [ ] **Step 1: Port the math.** Source of truth: `docs/superpowers/specs/2026-08-25-closer-scorecard-reference.html` script (~line 140-360). Port byte-faithfully:
  - `ratesOf`/`cascadeWith`/`distribute`/`teamSetCount` are IDENTICAL to `apps/web/src/components/scorecard/engine.ts:55-121` except over this FIELDS list, and here nothing is outside the cascade (all five fields cascade; `fub/fus/p1/p2/p3` are carried but never cascaded — copy them through unchanged in `cascadeWith`).
  - `roll(rows, cpc)` — sums all ten count fields, then: `show=pct(live,booked)`, `lc=pct(closes,live)`, `bc=pct(closes,booked)`, `aov=rat(gross,closes)`, `coll=pct(collected,gross)`, `cdpbc=rat(collected,booked)`, `gdpbc=rat(gross,booked)`, `roas = cpc && cpc>0 ? rat(collected, booked*cpc) : null`, `fushow=pct(fus,fub)`.
  - `whatIf(rows)` — from `renderDiag()` (reference ~:322-360): compute per-row rolls, take team bests (`best.show/lc/aov/coll` as maxima), then per rep `base = booked*s*l*a*c` and the four one-factor swaps; return `{ closerId, base, options: [{factor, value, gain}], pick }` where `pick` is the largest gain > 0.5.
  - `tierStats(r, prices)`: `pitched = p1+p2+p3`, `avgTier = pitched>0 ? (p1*prices[0]+p2*prices[1]+p3*prices[2])/pitched : null` (guard `prices.length`), `downsellGap = aovOfRow != null && avgTier != null ? aov - avgTier : null` — note the SIGN: spec table says `Downsell gap = AOV − avg tier pitched` (negative = closing below what's pitched).
  - Formatters copied from setter engine :147-158.

- [ ] **Step 2: Write the bench** — `engine.bench.mjs`, cloned from `apps/web/src/components/scorecard/engine.bench.mjs`. Two adaptations: (1) the TS-strip regex on the source line `.replace(/: (LedgerRow\[\]|LedgerRow|Rollup|CascadeField|number\[\]|number \| null|number|string)\b(\[\])?/g, "")` (bench.mjs:17) must have its alternation rewritten to THIS file's type names (`CloserLedgerRow`, `CloserRollup`, `CascadeField`, `WhatIfResult`) — a missed name silently leaves annotations in and the data-URL import throws; (2) assertions come from the reference HTML's SEED (4 closers — copy the SEED array verbatim from the reference script ~line 144-150). Assert at minimum: rollup sums; `cdpbc`/`bc`/`aov` values for the seeded team; `roas` with cpc=200; a `cascadeWith` on row 1 booked→+10 preserves upstream and rounds downstream by held rates; `teamSetCount` largest-remainder allocation; `whatIf` picks the documented best factor for one seeded rep; `tierStats` avg-tier + downsell gap for one rep with prices `[6800, 9800, 20000]`; `deltaDollars(800, ...)` for one under-target rep. Print `ALL PASS`, exit 1 on failure.

- [ ] **Step 3: Run it**

Run: `node /Users/tylerallen/Desktop/sequ3nce-ai/apps/web/src/components/closer-scorecard/engine.bench.mjs`
Expected: `ALL PASS`.

- [ ] **Step 4: Typecheck + commit**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v node_modules | head -5
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/src/components/closer-scorecard/
git commit -m "Closer Scorecard: pure engine ported from reference HTML + CLI bench"
```

---

### Task 9: Range query, baselines, settings (convex/closerScorecard.ts)

**Files:**
- Modify: `apps/web/convex/closerScorecard.ts` (from Task 2; final size ~280 lines — if larger, split the settings pair into `closerScorecardConfig2.ts`… no: name it `closerTierSettings.ts` to dodge the naming swamp)

**Interfaces:**
- Consumes: `resolveAuthUser` (from `./setterGhlOauth`), `dayKeyInTz`/`DEFAULT_TIMEZONE` (from `./closerPerformance`), `spanDayKeys`-style capping (copy the 92-day guard from `scorecard.ts:81-90` — import if exported, else copy with attribution comment), `baselineKey` logic (copy from `scorecard.ts:94-97`).
- Produces:

```ts
export const getRange = query({
  args: { clerkId: v.string(), weekStart: v.string(), rangeEnd: v.optional(v.string()) },
  // returns {
  //   weekStart, rangeEnd, canEdit: boolean, timezone: string,
  //   settings: { tierPrices: number[] | null, costPerBookedCall: number | null, targetCdpbc: number | null },
  //   rows: CloserRangeRow[],
  //   baseline: { rows: string | null, lockedAt: number } | null,
  // }
});
export const lockCloserBaseline = mutation({
  args: { clerkId: v.string(), weekStart: v.string(), rangeEnd: v.optional(v.string()), rows: v.optional(v.union(v.string(), v.null())) },
});
export const updateCloserScorecardSettings = mutation({
  args: { clerkId: v.string(), tierPrices: v.optional(v.union(v.array(v.number()), v.null())), costPerBookedCall: v.optional(v.union(v.number(), v.null())), targetCdpbc: v.optional(v.union(v.number(), v.null())) },
});
```

`CloserRangeRow` (a plain object, typed inline):

```ts
{
  closerId: string; name: string;
  // summed through precedence override > entry > measured, per FIELD per day:
  booked: number; live: number;      // live = "taken"
  closes: number; gross: number;     // gross = "contractValue"
  collected: number;                 // collected = "cash"
  fub: number; fus: number; p1: number; p2: number; p3: number;
  provenance: { manager: number; closer: number; measured: number }; // day-field resolutions by source
  filedDays: number; expectedDays: number; missedDayKeys: string[];
  callsCompleted: number; callsConfirmed: number;
}
```

- [ ] **Step 1: Write `getRange`.** Skeleton:

1. `resolveAuthUser(ctx, args.clerkId)` → team; `canEdit = role admin|manager`.
2. Validate day-key regex on both args; build inclusive `dayKeys` (92-day cap, throw ConvexError beyond).
3. Load active closers (`closers.by_team`, filter `status === "active"`), zero a row per closer.
4. Load `closerDailyStats`, `closerDailyEntries`, `closerDailyOverrides` for the span via `by_team_and_day` `.gte(start).lte(end)` on each table; bucket each by `` `${dayKey}|${closerId}` ``.
5. Per closer per day, resolve field-by-field with explicit precedence (do NOT modify `mergeDailyRows` — this is new code so the shared merge stays untouched):

```ts
const FIELD_MAP = [
  ["booked", "booked"], ["taken", "live"], ["closes", "closes"],
  ["contractValue", "gross"], ["cash", "collected"],
  ["fuBooked", "fub"], ["fuShown", "fus"],
  ["tier1Pitched", "p1"], ["tier2Pitched", "p2"], ["tier3Pitched", "p3"],
] as const;

for (const [src, dst] of FIELD_MAP) {
  const o = override?.[src]; const e = entry?.[src]; const m = stat?.[src];
  // contractValue is never overridable (closerDailyOverrides has no such
  // field) — o is undefined there by construction, no special case needed.
  const val = o ?? e ?? m ?? 0;
  row[dst] += val;
  if (val !== 0 || o !== undefined || e !== undefined) {
    if (o !== undefined) row.provenance.manager += 1;
    else if (e !== undefined) row.provenance.closer += 1;
    else if (m !== undefined) row.provenance.measured += 1;
  }
}
```

6. Filing visibility (mirror `eodNudge.ts:81-100` exactly): per closer per day, `expected` when `stat && (stat.booked > 0 || stat.taken > 0)`; `filed` when an entry doc exists; collect `missedDayKeys` where expected && !filed. Skip today's dayKey from "missed" (the day isn't over).
7. Confirmation rate: convert span to `{startMs, endMs}` via `getLocalDateRangeUtc(firstKey, tz)` start and `getLocalDateRangeUtc(lastKey, tz)` end; per closer, `calls.by_closer_and_startedAt` `.gte(startMs).lt(endMs)` `.take(500)`, filter `status === "completed" && countsTowardStats !== false`; `callsCompleted = count`, `callsConfirmed = count(factsConfirmedAt != null || outcomeSource === "closer" || outcomeSource === "manager")`.
8. Baseline: read `scorecardBaselines.by_team_and_week` with `weekKey = "closer_" + baselineKey(weekStart, rangeEnd)`.
9. Settings from the team doc.

- [ ] **Step 2: Write `lockCloserBaseline`.** Copy `scorecard.ts:lockBaseline` (:197-245) with three changes: key is `"closer_" + baselineKey(...)`; add the `canEdit` role check (the setter version lacks it — deliberate hardening, noted in the exploration); no `cdpbc` arg (closer settings live on the team doc, not the baseline).

- [ ] **Step 3: Write `updateCloserScorecardSettings`.** Sparse patch (the `closerScorecardSettings.ts:112` idiom): validate `tierPrices` = 1..3 positive numbers ≤ 1_000_000 ascending not required (Zion's call) — cap length 3, each 1..1_000_000; `costPerBookedCall` 0..100_000; `targetCdpbc` 0..1_000_000; `null` clears (patch `undefined`). Patch `teams`.

- [ ] **Step 4: Codegen + typecheck + deploy + CLI probe**

```bash
npx convex run --prod closerScorecard:getRange '{"clerkId":"<Tyler clerk id>","weekStart":"<last Saturday>"}'
```
Expected: rows for Tyler's team closers with zeros/real sums, `canEdit: true`, settings nulls. (getRange is a public query — run works with real args.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/convex/closerScorecard.ts apps/web/convex/_generated/
git commit -m "Closer Scorecard: getRange precedence query, baselines, team settings"
```

---

### Task 10: Scorecard UI — sub-tab in Team Performance

**Files:**
- Create: `apps/web/src/components/closer-scorecard/CloserScorecard.tsx` (~250 lines — state, edit-session refs, children wiring)
- Create: `apps/web/src/components/closer-scorecard/CloserLedgerTable.tsx` (~230 lines)
- Create: `apps/web/src/components/closer-scorecard/TiersTable.tsx` (~90 lines)
- Create: `apps/web/src/components/closer-scorecard/WhatIfPanel.tsx` (~110 lines)
- Create: `apps/web/src/components/closer-scorecard/SettingsRow.tsx` (~120 lines)
- Modify: `apps/web/src/app/dashboard/team-performance/page.tsx` (TABS + body + flag gate)

**Interfaces:**
- Consumes: engine (Task 8), `api.closerScorecard.{getRange,lockCloserBaseline,updateCloserScorecardSettings}` (Task 9), `api.scorecard.listScorecardWeeks` (existing, dual-auth — pass `{clerkId}`), `RangeControl`/`weekRange`/`ScorecardRange` from `@/components/scorecard/RangeControl`, `Delta` from `@/components/scorecard/Delta`, module CSS from `@/components/scorecard/scorecard.module.css` (import the setter's — same visual language, deliberate).
- Produces: `<CloserScorecardSection />` (self-contained: own queries via `useAuth`→clerkId like `ScorecardSection.tsx:20+`).

- [ ] **Step 1: `CloserScorecard.tsx`.** Mirror `apps/web/src/components/scorecard/Scorecard.tsx` structure with mode fixed to manager:
  - Props: `{ actualRows: CloserLedgerRow[], savedBaselineRows: CloserLedgerRow[] | null, settings: {tierPrices, costPerBookedCall, targetCdpbc}, extras: Map<string, {provenance, filedDays, expectedDays, missedDayKeys, callsCompleted, callsConfirmed}>, weekLabel: string, onLockBaseline: (rowsJson: string | null) => void }`.
  - State `rows`, `baseline`; reset effect keyed on `[weekLabel, JSON.stringify(actualRows), JSON.stringify(savedBaselineRows)]` (Scorecard.tsx:52-56).
  - **Copy the edit-session ref mechanic verbatim** (Scorecard.tsx:63-69): `editBase` ref captured `onFocus`, cleared `onBlur` — rates snapshot per edit session, never per keystroke (this was a live bug in the setter build; do not re-introduce it).
  - Handlers `cellEdit` (cascadeWith), `extraEdit(closerId, key, value)` for fub/fus/p1/p2/p3 (flat set, no cascade — like `closedEdit` at Scorecard.tsx:87), `teamEdit` (teamSetCount/distribute).
  - Lock/Revert/Reset buttons exactly as Scorecard.tsx:123-153 (Revert is local-only; Reset also calls `onLockBaseline(null)`).
  - Children: `<CloserLedgerTable>` → `<TiersTable>` (only when `settings.tierPrices`) → `<WhatIfPanel>`.

- [ ] **Step 2: `CloserLedgerTable.tsx`.** Clone the `LedgerTable.tsx` grid pattern (Cell component :18-48 with onFocus/onBlur wiring). Columns: Closer | Booked | Live | Closes | Gross $ | Collected $ | Show% | Live close% | **Booked close%** | AOV | Coll% | GDPBC | **CDPBC** | ROAS | FU b/s + FU show% | Delta $ | Filed. Derived cells from `roll([row])` + `deltaDollars(targetCdpbc, rowRoll)`; CDPBC cell colored `var(--green)`/`var(--red)` against target (reference HTML ~:378). Provenance + filing in the row: a muted chip after the name — `filed 4/5` with `title` listing `missedDayKeys` joined, red-tinted when any missed; a second muted chip `` `${callsConfirmed}/${callsCompleted} ✓` `` with `title="Calls confirmed by the closer"`. Totals row with team-editable count cells (`canEditTeam` always true here — manager-only mount). Wide table wraps in `overflow-x-auto`.

- [ ] **Step 3: `TiersTable.tsx`.** Per closer: three pitch-count cells (editable, flat), `Pitched`, `Avg tier pitched`, `AOV`, `Downsell gap` via `tierStats(row, tierPrices)`. Headers show the configured prices (`Pitched @ $6,800`...).

- [ ] **Step 4: `WhatIfPanel.tsx`.** Render `whatIf(rows)`: per rep one line — "At the team's best {factor}, {name} collects {money(value)} (+{money(gain)})" for the `pick`, with the three non-picked options in a muted expandable row. Header framing from the spec: "this gap is worth $X".

- [ ] **Step 5: `SettingsRow.tsx`.** Manager-only inline strip above the ledger (reference HTML header inputs `cpc`/`tgt`/`t1-3`): three tier price inputs + cost-per-booked-call + target CDPBC, hydrate-once + save-on-blur sparse patch via `updateCloserScorecardSettings` (the `TargetsSettings.tsx` Field idiom: number input, blur saves, empty → null). "saved ✓" inline state.

- [ ] **Step 6: Mount as a gated tab.** In `team-performance/page.tsx`:
  - `import { useTeam } from "@/hooks/useTeam";` — `const { team } = useTeam();`
  - `const hasCloserScorecard = ((team as any)?.betaFeatures ?? []).includes("closer_scorecard");`
  - TABS becomes a memo: base TABS plus, when flagged, `["scorecard", "Closer Scorecard"]` inserted after `["daily", "Daily numbers"]`.
  - Body: `tab === "scorecard" && <CloserScorecardSection />`. The section component owns its data: `listScorecardWeeks({clerkId})` for the week list, `ScorecardRange` state + `RangeControl` (the `ScorecardSection.tsx:20-72` wiring pattern, including `weekRange(currentWeek, true)` default and `rangeArgs` construction), `getRange({clerkId, ...rangeArgs})`, mutations for lock + settings. RangeControl has NO month preset (weeks + last14/last30 + custom) — that satisfies the spec's ranges; a month is a custom span; do not add a preset. RangeControl + scorecard.module.css use a hand-rolled light palette rather than dashboard tokens — this matches the existing precedent (`ScorecardSection` already mounts them inside the dashboard on setter-eods); reuse as-is, no token pass.
  - `PeriodNav` is NOT rendered for this tab (add `tab !== "scorecard"` beside the existing `tab !== "settings"` exclusion at page.tsx:128-141) — the scorecard has its own RangeControl.

- [ ] **Step 7: Typecheck + build + visual verify.** `npx tsc --noEmit` clean, `npx next build` clean. Flag Tyler's team (Task 11 shows the safe flag command), open Team Performance → Closer Scorecard: real rows for the range, edit a Booked cell and watch downstream cascade with held rates, Lock/Revert/Reset round-trip (reload persists baseline), settings row saves + tier table appears once prices set, what-if panel names a factor. Screenshot-review at 1440px and 1024px — wide table must scroll inside its container, not the page.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/closer-scorecard/ apps/web/src/app/dashboard/team-performance/page.tsx
git commit -m "Closer Scorecard: manager sub-tab in Team Performance (ledger, tiers, what-if, settings)"
```

---

### Task 11: Rollout — flags, deploy, E2 seeding, parity check

**Files:** none new (CLI + verification)

- [ ] **Step 1: Full verification gauntlet**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web
npx tsc --noEmit 2>&1 | grep -v node_modules | head -20
npx next build
npx convex deploy --yes
node src/components/closer-scorecard/engine.bench.mjs
npx convex run --prod closerScorecard:followUpTitleBench '{}'
```
All clean / ALL PASS before proceeding.

- [ ] **Step 2: Set beta flags — APPEND, never replace.** `admin:setBetaFeatures` replaces the whole array (admin.ts:167). Read current flags first:

```bash
npx convex data teams --prod --limit 50   # find E2 + Tyler's team, note existing betaFeatures
npx convex run --prod admin:setBetaFeatures '{"teamId":"js7ak2980wehyj0070ygsg6sms8cf84d","features":[<E2 existing flags verbatim>, "closer_scorecard"]}'
npx convex run --prod admin:setBetaFeatures '{"teamId":"<Tyler team id>","features":[<existing>, "closer_scorecard"]}'
```

E2's known flags as of 2026-08: `setter_eods`, `appointment_attendance`, `close_crm` — but READ, don't assume.

- [ ] **Step 3: Seed E2 settings** via the new mutation (as Tyler's admin through the UI, or CLI): tierPrices `[6800, 9800, 20000]`, costPerBookedCall `200`, targetCdpbc `800` — the spec's defaults from Zion's sheet, flagged to Tyler as "confirm with Zion".

- [ ] **Step 4: Parity check against Team Performance.** For one real E2 closer and one full week: scorecard `booked/live/closes/collected` must equal the Daily numbers grid's merged totals for the same days (same precedence, so any mismatch is a bug in getRange's resolution). Check the filing chip against `getEodNudgeData` for one day (`npx convex run --prod eodNudge:getEodNudgeData '{"teamId":"js7ak...","dayKey":"<day>"}'` — filed/expected counts must agree).

- [ ] **Step 5: Merge + push (surgical).**

```bash
git checkout main && git pull && git merge closer-scorecard
cd apps/web && npx tsc --noEmit 2>&1 | grep -v node_modules | head -5 && npx convex deploy --yes
cd .. && git push origin main
```

(`git branch --show-current` before pushing; push only this work.)

- [ ] **Step 6: Update memory + design doc status.** Mark `closer-scorecard-e2` memory SHIPPED with the commit hash, note what's live vs waiting (Zion confirming tier prices; team adopting the "follow up" titling; DailyGrid columns for the five new override fields deliberately deferred).

---

## Deliberate scope exclusions (do not "helpfully" add)

- No closer-facing scorecard mount, no readonly/sandbox modes (spec non-goal).
- No AI tier-pitch prefill (extraction exists; wire later if Zion asks).
- No DailyGrid columns for the five new fields — overrides are mutation-reachable but have no manager UI yet; fast-follow if Zion asks.
- No changes to `mergeDailyRows`, Team Performance board, or its precedence.
- No orange-calendar-color signal — title matching only (colorId sync unverified; never load-bearing per spec).
- No real-time post-call confirm nudges (spec defers).

## Self-review notes (already applied)

- Spec coverage: ledger + derived columns (T8-T10), tiers table (T8/T10), what-if (T8/T10), provenance marking (T10 chips + per-cell sources are in getRange provenance counts — cell-level source display lives in the EOD form's amber notes and DailyGrid, unchanged; the scorecard shows per-row provenance + confirmation chips per the 2026-08-31 additions), confirm strip (T6-T7), derive-totals (deliberately NOT auto-derived into the entry — the form still submits what the closer types; the strip drives accuracy of the measured layer instead, which the precedence already prefers when the closer types nothing — this is the honest version of "derive": fewer fields typed, measured fills the gap), add-missed-call (T6), catch-up window (T6 3-day window), % confirmed (T9 step 7 → T10 chip), filing visibility (T9 step 6 → T10 chip), FU convention (T2-T3), manual FU fields (T4-T5), tier settings (T9/T10), baselines (T9/T10), 92-day cap (T9), engine bench vs SEED (T8), FU bench (T2), precedence parity check (T11).
- Type consistency: `CloserLedgerRow` field names (`booked/live/closes/gross/collected/fub/fus/p1/p2/p3`) match between engine (T8), getRange FIELD_MAP dst names (T9), and UI (T10). Entry/override/schema field names (`fuBooked/fuShown/tier1Pitched/tier2Pitched/tier3Pitched`) consistent across T1/T4/T5/T9.
