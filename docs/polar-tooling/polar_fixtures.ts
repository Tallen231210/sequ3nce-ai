// Fixture tests for the pure parts of the Polar client.
//
// Run: npx tsx docs/polar-tooling/polar_fixtures.ts
// No network, no token. The functions under test are pure by design so the
// parts that decide money can be checked without hitting a payment processor.

import {
  describePolarError,
  buildTierMap,
  tierOfProduct,
  type PolarProduct,
} from "/Users/tylerallen/Desktop/sequ3nce-ai/apps/web/src/lib/polar";

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

const product = (id: string, tier?: string, archived = false): PolarProduct => ({
  id,
  name: `product ${id}`,
  is_archived: archived,
  metadata: tier === undefined ? {} : { tier },
});

console.log("\ntierOfProduct");
check("reads the tier tag", tierOfProduct(product("a", "overwatch")) === "overwatch");
check("is case and space insensitive", tierOfProduct(product("a", "  Oversight ")) === "oversight");
check("untagged product has no tier", tierOfProduct(product("a")) === null);
check(
  "an unknown tag is not a tier",
  tierOfProduct(product("a", "enterprise")) === null,
  "an unrecognised tag must never resolve to a real tier",
);
check("a non-string tag is not a tier", tierOfProduct({ id: "a", metadata: { tier: 3 } }) === null);

console.log("\nbuildTierMap");
{
  const { byTier, ambiguous } = buildTierMap([
    product("p-overview", "overview"),
    product("p-oversight", "oversight"),
    product("p-overwatch", "overwatch"),
  ]);
  check("maps all three tiers", byTier.size === 3);
  check("maps to the right ids", byTier.get("overwatch") === "p-overwatch");
  check("nothing ambiguous", ambiguous.length === 0);
}
{
  const { byTier, ambiguous } = buildTierMap([
    product("p-1", "overwatch"),
    product("p-2", "overwatch"),
    product("p-ok", "overview"),
  ]);
  check(
    "a duplicated tier is refused, not guessed",
    !byTier.has("overwatch"),
    "selling one of two products tagged the same charges an arbitrary price",
  );
  check("the duplicate is reported", ambiguous.includes("overwatch"));
  check("other tiers still sellable", byTier.get("overview") === "p-ok");
}
{
  const { byTier } = buildTierMap([product("p-old", "overwatch", true)]);
  check("archived products are ignored", byTier.size === 0);
}
{
  const { byTier } = buildTierMap([product("p-untagged")]);
  check("untagged products are ignored", byTier.size === 0);
}

console.log("\ndescribePolarError");
check(
  "oauth-style error",
  describePolarError({ error: "insufficient_scope", error_description: "Higher privileges required." }, 403) ===
    "Polar 403: Higher privileges required.",
);
check(
  "validation error names the field",
  describePolarError(
    { error: "RequestValidationError", detail: [{ loc: ["body", "seats"], msg: "Input should be greater than or equal to 1" }] },
    422,
  ) === "Polar 422: seats: Input should be greater than or equal to 1",
);
check(
  "plain detail string",
  describePolarError({ error: "ResourceNotFound", detail: "Not found" }, 404) === "Polar 404: Not found",
);
check("unparseable body still describes the status", describePolarError(null, 500) === "Polar 500: unexpected response");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
