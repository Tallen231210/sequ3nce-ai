# Setter Data rebuild — verification tooling

Kept in the repo because it was written under a session scratchpad that
disappears, and re-deriving it costs more than storing it.

## snapshot_setter.sh / verify_no_regression.sh

Captures every setter-data query for both live teams and diffs a later run
against it. Used throughout the rebuild to prove the two live teams' numbers
didn't move while the engine was being replaced underneath them.

It knows three classes of drift that are NOT regressions, each found the hard
way:

- **now-relative queries** — the scorecard's window slides with the clock;
  a rate moved 2.7477 → 2.7504 across two runs three minutes apart
- **enrichment correcting `dateAdded`** — a lead can leave a fixed historical
  window days after the fact
- **speed-to-lead never settling** — a lead that arrived three weeks ago and
  gets its first dial today changes the average for a window already closed

Run it against unchanged code first. A harness that only ever passes proves
nothing; this one was validated by corrupting a baseline value and confirming
it caught a single dial-count changing from 244 to 245.

## metric_fixtures.ts

47 fixture tests over the pure metric modules. No test framework is installed,
so it runs with `npx tsx` and adds no dependency:

    npx tsx docs/setter-data-tooling/metric_fixtures.ts

Covers the four metric shapes, the power-dialer case (1.3% attribution), an
automated welcome text not being allowed to stop a dial-speed clock, business
hours, the roster, and gating. Ends with a determinism check.

There is also a mutation check in the history: three claims that are FALSE
about the real implementation, all correctly rejected. Worth repeating if the
suite is ever substantially rewritten.
