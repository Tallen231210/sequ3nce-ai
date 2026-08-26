# Setter App Suite — design

Requested by Zion (E2 Influencers), specced with Tyler 2026-08-23. Built
generic — any team with setters gets it — but E2 is the first and only
intended user for now (beta flag `setter_eods` gates the manager surface
already; the setter app follows the same gate).

## Goal

Give setters their own small, beautiful app (magic-link login) containing:
their EOD form (with new metrics), the calls they set (watchable), and the
team scorecard (read-only + a personal projections sandbox). Give Zion an
editable scorecard in his Setter EODs tab for projections and meetings.

## Decisions made with Tyler (do not re-litigate)

1. **Auth = email magic-link**, mirroring `closerMagicLink.ts` (6-digit code
   via Resend, same expiry/lockout/CSPRNG). NOT tokenized links, NOT PINs —
   recordings sit behind this login, and the old per-setter links were
   bearer credentials posted into a shared Slack channel.
2. **Slack reminder loses the per-setter secret links** — same message
   shape (names, filed state) with ONE generic app URL. Missing-report
   unchanged.
3. **Old tokenized `/setter-eod/[token]` links keep working for the EOD
   form ONLY during a one-week transition**, then are retired.
4. **Call view = everything the closer sees, read-only.** Video, AI
   summary, ammo, analysis, transcript, outcome. No editing of any kind —
   the closer's facts editor, classification controls, flag-for-review and
   share-link minting are all absent.
5. **Matching overshoots on purpose.** Zion: better to show a call that
   isn't theirs (they dismiss it) than hide one that is (they can't
   recover it).
6. **Scorecard visibility: whole team, in every mount.** The sandbox
   restricts EDITING to the setter's own row; it never restricts seeing.
7. **Scorecard persistence:** Zion's locked baseline + CDPBC persist per
   week. Everything else is a whiteboard — reload returns to actuals.
   Setter sandbox saves nothing.
8. **Aesthetics:** the setter app is Vercel-styled (Geist font, white,
   crisp borders, motion only as interaction feedback — no decorative
   animation, standing rule). The scorecard keeps its OWN paper-ledger
   aesthetic from Zion's HTML, in all three mounts.

## Phase 1 — accounts, app shell, richer EOD form

**Schema (additive only):**
- `setterRoster` += `email` (optional string), `pod` (optional string).
- `setterEodEntries` += `callsOnCalendar`, `callsShown`, `callsClosed`
  (all optional numbers — old entries simply lack them).
- New `setterSessions` table: rosterId, teamId, tokenHash, createdAt,
  expiresAt (90 days), lastSeenAt. Indexed by tokenHash.
- New `setterMagicCodes` table mirroring the closer one (codeHash, email,
  rosterId, expiry, attempts).

**Auth flow:** `/setter` login screen → email → 6-digit code → session
cookie. Email must match an active roster row on some team; inactive
rows can't log in and live sessions die when a setter is deactivated.
Resolution is by email across teams (an email on two teams picks the
active row; genuinely ambiguous duplicates are a support case, not a UI).

**Roster card (Zion's tab):** each row gains Email and Pod inputs.

**EOD form:** moves into the app as the first tab. Existing five fields +
three new ones, labeled in Zion's language: "Calls on the calendar",
"Calls shown", "Calls closed". Validation: non-negative integers,
pickups ≤ dials (existing rule); no cross-field rules between the new
fields — "shown" can legitimately exceed "on calendar" filed the same day
(different cohorts; the scorecard footnote says so).
Resubmit-replaces-same-day behavior unchanged. The tokenized public form
gets the same three fields on day one (data starts accruing immediately).

**Slack reminder:** per-setter links replaced by the app URL. Copy shifts
from "fill out your EOD" links to one "Open the setter app" link.

## Phase 2 — Calls You've Set

**Matcher.** For each completed, non-internal call on the team (source:
bot/app calls with a recording), take the meeting title and extract a
leading parenthesized token: `^\(\s*([A-Za-z]{1,3})\s*\)`. Case-
insensitive. Real E2 examples: "(e) Tim and Karl", "(Mo)Paul X Karl",
"(N) Ai Implementation: Kris/Gresham", "(IY) Ai Implementation Consult".

Match against ACTIVE roster first names:
- Primary: token is a case-insensitive PREFIX of a first name
  ("Mo" → Mo; "E" → Erten AND Ethan R — both see it).
- Fallback (overshoot): if no prefix match, match on first letter alone
  ("IY" → Israel). If still nothing, the call matches nobody.

Matches are stored (`setterCallMatches`: rosterId, callId, teamId, token,
matchedAt) by a hook on call completion plus a 60-day backfill at launch.
Roster changes (new setter added) re-run the backfill for that name.

**Dismissal.** "Not my call" writes a per-setter dismissal
(`setterCallDismissals`: rosterId, callId). It hides the call from THAT
setter only; the other candidate still sees it. Undo supported (an
invisible suppression rule someone forgot is how afternoons get wasted).

**The tab.** Reverse-chronological list — date, prospect/title (initials
token stripped for display), closer name, duration, outcome badge. Open →
full read-only call detail (decision 4). Data comes through new
setter-scoped Convex queries that verify the session's rosterId matches
the requested call's match row — a setter can never load an arbitrary
callId.

## Phase 3 — Scorecard (one engine, three mounts)

**Engine.** React port of Zion's HTML with its math intact: five funnel
stages (Dials → Connects → Sets → On calendar → Showed), cascade-downstream
edits (upstream never moves), pro-rata team edits, rate drivers (pickup,
connect→set, set→calendar, show), pod grouping with pod subtotals, capacity
check (working days, cadence, 150-dials/day color line), CDPBC revenue box,
baseline deltas (▲/▼), Lock/Revert/Reset buttons. Plus ONE extension the
HTML lacks but Zion asked for: a **Closed** column and **set→close** rate,
fed by the new `callsClosed` field.

**Actuals.** Sat–Sat weekly aggregation of `setterEodEntries` per roster
row, with a week picker (current + past weeks). Mapping: dials→dials,
connects→pickUps, sets→sets, on-calendar→callsOnCalendar,
showed→callsShown, closed→callsClosed. Setters with no entries that week
appear as zero rows (absence is information).

**Mounts and permissions:**

| Mount | Sees | Edits | Persists |
|---|---|---|---|
| Zion — Setter EODs tab | whole team | everything | locked baseline + CDPBC, per week (`scorecardBaselines` table); scenario itself is whiteboard |
| Setter app — Scorecard tab | whole team | nothing | — |
| Setter app — Projections tab | whole team | own row only (others dimmed; team row + rate drivers disabled) | nothing |

Setter sandbox edits cascade their own row and flow into team totals and
the CDPBC box live — "my improvement is worth +$X to the team's week" is
the point. CDPBC value in the setter mounts reads Zion's persisted value,
read-only.

**Honesty footnote** (carried from the HTML, consistent with the
self-reported-vs-measured labeling rule): numbers are setter-reported via
EOD forms; set→calendar and show are directional because those columns
come from a different cohort than the week's sets.

## Non-goals

- No writeback of matches to setter stats/attribution (the closer
  attribution-dropdown is a separate, pending project).
- No CRM cross-check of EOD numbers (later, per the original EOD design).
- No changes to closer app, manager mode, or B2C.
- No Discord variant of the reminder change beyond what exists.

## Security notes

- Recordings are only reachable behind a magic-link session whose roster
  row matches the call's match row.
- Old bearer tokens stop granting anything beyond the EOD form
  immediately, and everything after the transition week.
- Session cookies HttpOnly; codes single-use, 15-min expiry, lockout after
  5 attempts (all inherited from the closer implementation).

## Verification

- Unit-test the matcher against the real observed title shapes: "(e) X",
  "(E) X", "(Mo)X", "(M) X", "(IY) X", no-parens titles, "Canceled:" noise.
- Erten/Ethan ambiguity: one call appears in both lists; dismissal by one
  leaves the other's intact.
- Auth: wrong code lockout, expired code, deactivated setter's session
  dies, email on no roster row → clear "no account" message (B2B rule:
  say so plainly).
- Scorecard math parity: seed the engine with the HTML's SEED data and
  assert the same rollups/rates the file produces; verify cascade and
  pro-rata behavior match.
- Permissions: setter session cannot call Zion-only mutations (baseline
  lock, CDPBC save); read-only mount renders no inputs.
- E2 end-to-end: Zion enters emails, a setter logs in on a phone, files an
  EOD with the new fields, sees their calls, plays the sandbox.
