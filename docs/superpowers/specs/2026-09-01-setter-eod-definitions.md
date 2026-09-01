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
| 8 | Calls closed | Of today's shows, how many closed. Cannot exceed #7 (validated). |

## Consequences

- **Show rate (shown ÷ on-calendar) is now a real, same-cohort rate** and
  stays on the setter scorecard.
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
