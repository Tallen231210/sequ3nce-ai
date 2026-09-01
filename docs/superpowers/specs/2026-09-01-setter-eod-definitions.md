# Setter EOD metric definitions — agreed 2026-09-01

Agreed with Tyler (Zion confirming) after the setter-scorecard show-rate
investigation: percentages exceeded 100% because "calls on the calendar" was
interpreted three different ways across E2's setters (lifetime onCal/sets
ratios ranged 0.50–1.54) and "calls shown" was absorbing follow-up shows
that no setter ever put on a calendar. Full analysis in the session that
produced this doc; the raw evidence was Marcus (1 on calendar, 2 shown →
133%) and Sophie (6 sets, 12 on calendar in one day).

All metrics are "today only" unless stated. Hints live on both EOD forms
(`src/app/setter-eod/[token]/page.tsx` and `src/app/setter/eod/page.tsx`);
validation in `convex/setterEodShared.ts`.

| # | Field | Definition |
|---|-------|------------|
| 1 | Dials | Phone call attempts made today — every attempt counts, incl. no-answers and voicemails. |
| 2 | Pick ups | Dials where a human answered and you spoke. Cannot exceed dials (validated). |
| 3 | Sets | New sales calls you booked today — prospect committed and a time was locked in. |
| 4 | New leads hit | Brand-new leads contacted for the first time today. |
| 5 | Follow ups | Existing leads you re-contacted today. |
| 6 | Calls on the calendar | First-consult appointments **from your sets** that were **scheduled to happen today** (whenever you set them). NOT your upcoming pipeline; NOT "today's sets that stuck". |
| 7 | Calls shown | **Of those (#6)**, how many the prospect showed to. Follow-ups and second calls never count — those are the closers' numbers. Cannot exceed #6 (validated). |
| 8 | Calls closed | **Deals from your sets that closed today** — including closes that happened on a closer's follow-up call (the set was yours, so the close is too). CAN exceed #7 — a follow-up close on a one-show day is honest. Deliberately NOT validated against #7. |
| 9 | Cash collected ($) | Cash collected today from your sets' deals — including later installments on deals that closed earlier. Money counts the day it lands. Whole dollars, validated 0–100M. |

**Revised same day (Zion's ask, Tyler's call):** #8 was originally "of
today's shows, how many closed" with a closed≤shown guard. Zion wanted
cash-per-set; Tyler's ruling — "if cash is collected, then that means
there was a close. It was just a close on a follow-up" — turned #8 and #9
into **deal-outcome metrics that follow the set, not the meeting**. Shows
track appointments (setter-owned, first consults only); closes and cash
track deals (attributed to the setter who set them, whenever they pay).
The guard came out the same day it went in, with the rationale in a
comment in `setterEodShared.ts`.

## Consequences

- **Show rate (shown ÷ on-calendar) is now a real, same-cohort rate** and
  stays on the setter scorecard.
- The setter scorecard gained **Cash** (self-reported, summed from #9) and
  **$/set** (cash ÷ sets) columns — all three mounts (manager, readonly,
  sandbox). set→close can read >100% for the same follow-up-close reason;
  that's honest, not a bug.
- This self-reported cash is a SEPARATE number from the measured
  cash-per-set probe (`_probeFollowUp:cashPerSetter`), which reads
  AI-extracted call outcomes and currently misses follow-up closes. Never
  blend the two on one surface without labeling provenance.
- The old "set→calendar" stick-rate reading is retired — the scorecard gate
  is relabelled "set→sched" and marked directional (this week's sets land on
  later weeks' calendars).
- Entries filed before 2026-09-01 predate these definitions; historical
  weeks can still show odd ratios and are left as-is (footer says so).
- "Second call" counts as a follow-up in the closer-side title matcher
  (`convex/lib/followUpTitle.ts`) — Zion confirmed; E2 titled follow-ups
  "Second Call:" before the "follow up" convention.
- Untagged meetings (no setter token) are automatic bookings — no setter
  involved, by design (Tyler, 2026-09-01).
