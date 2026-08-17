// Fixture tests for the pure parts of the tier-name parsing.
//
// Run: npx tsx docs/polar-tooling/tiers_fixtures.ts
// No network, no token. `parseTier` decides what a checkout charges, so its
// full input set is checked here rather than trusted on read.

import { parseTier } from "/Users/tylerallen/Desktop/sequ3nce-ai/apps/web/src/lib/tiers";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  pass  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? "  — " + detail : ""}`);
  }
}

console.log("\nparseTier — the three real tiers");
check("overview", parseTier("overview") === "overview");
check("oversight", parseTier("oversight") === "oversight");
check("overwatch", parseTier("overwatch") === "overwatch");

console.log("\nparseTier — everything else must be null, never a default");
check(
  "an unknown string is not a tier",
  parseTier("cheap") === null,
  "an unrecognised tier must be refused, not sold as the top plan",
);
check("an empty string is not a tier", parseTier("") === null);
check(
  "a legacy key is not a tier here",
  parseTier("full") === null,
  "legacy keys are for normaliseTier reading OUR stored data, not for validating client input",
);
check("null is not a tier", parseTier(null) === null);
check("undefined is not a tier", parseTier(undefined) === null);
check("a number is not a tier", parseTier(3) === null);
check("an object is not a tier", parseTier({ tier: "overwatch" }) === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
