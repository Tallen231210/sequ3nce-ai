# Closer Scorecard — design

Zion's (E2) closer analogue of the setter scorecard, specced with Tyler
2026-08-25. Reference artifact:
`docs/superpowers/specs/2026-08-25-closer-scorecard-reference.html`.
Built generic, E2 first. Manager-facing ONLY — no closer-facing version
(Tyler, explicit).

## Decisions made with Tyler (do not re-litigate)

1. **AI-measured + manual override.** The five measurable base fields
   (booked, live/taken, closes, gross, collected) ride the EXISTING
   three-layer precedence: `closerDailyOverrides` (manager) >
   `closerDailyEntries` (closer) > `closerDailyStats` (measured). We do
   not build a parallel manual pipeline for numbers we already measure.
2. **Daily entry, extending the existing closer EOD form** (the Numbers
   tab's PerformanceDayForm). No new weekly form. Zion's views roll up
   with the standard range filters: day / week / month / custom dates
   (reuse `RangeControl`).
3. **Follow-up attribution:** meeting-title marker, convention PENDING
   Zion (Tyler asking; proposal "(fu)" token coexisting with setter
   initials — "(er)(fu) Prospect and Ethan"). The build must not block on
   it: manual FU fields ship in the EOD form as the fallback/override,
   and the AI title-matcher layer switches on when the convention is
   confirmed. Once a call is marked FU, "FU shown" derives free from the
   attendance system.
4. **Tier pitches are manual v1** (three counts on the daily form). The
   AI "price pitched" extraction exists and can prefill later — not v1.
5. Tier prices, cost per booked call, and target CDPBC are Zion-editable
   settings, persisted per team (defaults from his sheet: $6,800 /
   $9,800 / $20,000, $200 CPC, $800 target CDPBC).

## The ledger (from the reference HTML, in the house design system)

Per-closer rows over the selected range. Base fields (cascade-editable in
projections mode, like the setter engine): **Booked → Live → Closes →
Gross $ → Collected $**, plus **FU booked / FU shown** and per-tier
pitch counts. Derived columns:

| Metric | Formula | Note |
|---|---|---|
| Show rate | live ÷ booked | setter KPI, diagnostic here |
| Live close rate | closes ÷ live | diagnostic |
| **Booked close rate** | closes ÷ booked | **the KPI** |
| AOV | gross ÷ closes | |
| Collection rate | collected ÷ gross | |
| GDPBC | gross ÷ booked | |
| **CDPBC** | collected ÷ booked | **the keystone** |
| ROAS | CDPBC ÷ cost per booked call | |
| FU show rate | FU shown ÷ FU booked | the only show rate a closer owns |
| Performance delta $ | (target CDPBC − rep CDPBC) × booked | |
| Avg tier pitched | Σ(count × price) ÷ total pitched | tier table |
| Downsell gap | AOV − avg tier pitched | tier table |

Second table (tiers): per closer, the three pitch counts, avg tier
pitched, AOV, downsell gap.

What-if panel (from the reference): per rep, what their collected would
be at the team's best-in-class show rate / live-close / AOV / collection
rate — "this gap is worth $X" framing, computed client-side like the
rest of the whiteboard.

Modes: Zion's mount is `manager` (everything editable, Lock/Revert/Reset
baselines persisted per range via the scorecardBaselines pattern with a
`closer_` key prefix). No readonly/sandbox mounts in v1.

**Provenance marking:** every base cell shows its source the way Team
Performance does — measured / closer-reported / manager-set. Self-
reported vs measured is never blended silently (standing E2 rule).

## Data plumbing

**Schema (additive):**
- `closerDailyEntries` += `fuBooked`, `fuShown`, `tier1Pitched`,
  `tier2Pitched`, `tier3Pitched` (all optional numbers).
- `closerDailyStats` += `fuBooked`, `fuShown` (optional — the measured
  layer, populated only once the title convention is live).
- `closerDailyOverrides` += the same five (manager corrections).
- `teams` += `closerTierPrices` (optional array of numbers),
  `closerCostPerBookedCall` (optional number), `closerTargetCdpbc`
  (optional number).
- Baselines reuse `scorecardBaselines` with weekKey `closer_<rangeKey>`
  (no new table).

**Closer EOD form (Numbers tab / PerformanceDayForm):** five new inputs
grouped under a "Follow-ups & pitches" section — FU booked, FU shown,
and one count per configured tier (labels rendered from
`closerTierPrices`, e.g. "Pitched @ $6,800"). Teams without
`closerTierPrices` configured don't see tier inputs at all.

**Gross:** `closerDailyEntries.contractValue` already exists as the
manual layer; measured gross = `closerDailyStats.contractValue`.

**FU measured layer (when the convention lands):** the daily recount
that builds `closerDailyStats` gains a title scan — a call whose title
carries the FU marker counts `fuBooked` on the closer's day; if the
attendance/presence verdict says the prospect appeared, it also counts
`fuShown`. Marker parsing lives beside the setter matcher in
`lib/setterTitleMatch.ts`-style pure code with a CLI bench.

**Aggregation query:** `closerScorecard.getRange {clerkId, rangeStart,
rangeEnd}` — resolves each day per closer through the precedence
(override > entry > measured) field-by-field, sums the range, returns
rows + per-field provenance summary (counts of days by source) + the
team settings. Range capped at 92 days like the setter scorecard.

## Where it lives

A sub-tab inside the dashboard's Team Performance tab: existing content
under "Board" (or its current name), new "Closer Scorecard" sub-tab.
RangeControl on top. Manager-gated exactly as the rest of the dashboard.

## Non-goals (v1)

- No closer-facing scorecard, no sandbox mounts.
- No AI tier-pitch prefill (extraction exists; wire later if Zion wants).
- No FU auto-attribution until Zion confirms the title convention — the
  manual fields make the feature whole without it.
- No changes to the existing Team Performance board or its precedence.

## Verification

- Engine bench vs the reference HTML's SEED (rollups, derived columns,
  what-if bests, delta $ math) — same discipline as the setter engine.
- Precedence: a day with all three layers resolves override > entry >
  measured per FIELD (not per row); provenance counts match.
- Range parity: day/week/custom sums cross-checked against the Numbers
  tab and Team Performance for the same closer.
- FU marker bench (once convention confirmed): coexists with setter
  tags — "(er)(fu) X" attributes Ethan AND counts FU.
- Zion-side walkthrough: enter tier counts on a closer's day, see the
  scorecard move; edit tier prices, labels update everywhere.
