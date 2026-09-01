// CLI bench for the closer engine — the SEED array from the reference HTML
// (docs/superpowers/specs/2026-08-25-closer-scorecard-reference.html) with
// expected values from its own math. Run: node engine.bench.mjs
//
// Unlike the setter bench's regex type-strip, this transpiles engine.ts with
// the repo's own TypeScript — the closer engine's annotations are too rich
// for a regex to strip safely.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ts = require("typescript");
const src = readFileSync(join(here, "engine.ts"), "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);

// SEED copied verbatim from the reference HTML (ids → closerId strings).
const SEED = [
  { closerId: "1", name: "Closer 1", booked: 60, live: 36, closes: 7, gross: 74600, collected: 61000, fub: 14, fus: 9, p1: 8, p2: 20, p3: 8 },
  { closerId: "2", name: "Closer 2", booked: 58, live: 30, closes: 4, gross: 33200, collected: 24000, fub: 12, fus: 4, p1: 18, p2: 10, p3: 2 },
  { closerId: "3", name: "Closer 3", booked: 55, live: 35, closes: 6, gross: 58800, collected: 52000, fub: 11, fus: 7, p1: 6, p2: 22, p3: 7 },
  { closerId: "4", name: "Closer 4", booked: 52, live: 24, closes: 3, gross: 20400, collected: 13600, fub: 9, fus: 3, p1: 14, p2: 9, p3: 1 },
];
const CPC = 200, TARGET = 800, PRICES = [6800, 9800, 20000];

let fails = 0;
function eq(label, got, want, tol = 0.01) {
  const ok =
    typeof want === "number"
      ? typeof got === "number" && Math.abs(got - want) < tol
      : got === want;
  if (!ok) { fails++; console.log(`FAIL ${label}: got ${got}, want ${want}`); }
  else console.log(`pass ${label}`);
}

// ---- rollup: sums + derived, hand-computed from the SEED --------------------
const t = mod.roll(SEED, CPC);
eq("roll booked", t.booked, 225);
eq("roll live", t.live, 125);
eq("roll closes", t.closes, 20);
eq("roll gross", t.gross, 187000);
eq("roll collected", t.collected, 150600);
eq("roll fub/fus", `${t.fub}/${t.fus}`, "46/23");
eq("roll show %", t.show, 55.5556, 0.001);
eq("roll lc %", t.lc, 16);
eq("roll bc % (KPI)", t.bc, 8.8889, 0.001);
eq("roll aov", t.aov, 9350);
eq("roll coll %", t.coll, 80.5348, 0.001);
eq("roll cdpbc (keystone)", t.cdpbc, 669.3333, 0.001);
eq("roll gdpbc", t.gdpbc, 831.1111, 0.001);
eq("roll roas @ $200", t.roas, 3.3467, 0.001);
eq("roll fushow %", t.fushow, 50);
eq("roll no cpc → roas null", mod.roll(SEED, null).roas, null);

// ---- delta $ ---------------------------------------------------------------
eq("delta $ vs $800 target", mod.deltaDollars(TARGET, t), 29400, 0.5);
eq("delta $ null target", mod.deltaDollars(null, t), null);
eq("delta $ null cdpbc (no booked) → null, not 'at target'", mod.deltaDollars(TARGET, { cdpbc: null, booked: 0 }), null);

// ---- cascade: reference algorithm re-expressed, run against the port -------
// (verbatim ES5 port of the HTML's cascadeWith, as the independent oracle)
function refCascade(r, idx, rates, val) {
  const F = ["booked", "live", "closes", "gross", "collected"];
  const o = Object.assign({}, r);
  o[F[idx]] = Math.max(0, Math.round(val));
  for (let i = idx; i < 4; i++) o[F[i + 1]] = Math.round((+o[F[i]] || 0) * rates[i]);
  return o;
}
const rates1 = mod.ratesOf(SEED[0]);
const c1 = mod.cascadeWith(SEED[0], 0, rates1, 70);
const o1 = refCascade(SEED[0], 0, rates1, 70);
eq("cascade booked=70 live", c1.live, 42);
eq("cascade booked=70 closes", c1.closes, 8);
eq("cascade gross matches oracle", c1.gross, o1.gross);
eq("cascade collected matches oracle", c1.collected, o1.collected);
eq("cascade upstream untouched", c1.booked, 70);
eq("cascade carries fub through", c1.fub, 14);
eq("cascade carries p2 through", c1.p2, 20);

// ---- team edit: largest-remainder distribution -----------------------------
const teamed = mod.teamSetCount(SEED, 0, 250);
eq("teamSet booked split", teamed.map((r) => r.booked).join(","), "67,64,61,58");
eq("teamSet total", teamed.reduce((a, r) => a + r.booked, 0), 250);

// ---- what-if: closer 2's biggest lever is live close rate ------------------
const w = mod.whatIf(SEED);
eq("whatIf base = own collected", w[1].base, 24000, 1);
eq("whatIf pick for closer 2", w[1].pick && w[1].pick.key, "lc");
eq("whatIf lc gain", w[1].pick && w[1].pick.gain, 11000, 5);
eq("whatIf team best show", w[1].options[0].teamBest, 63.6364, 0.001);

// ---- tiers -----------------------------------------------------------------
const ts1 = mod.tierStats(SEED[0], PRICES);
eq("tier pitched", ts1.pitched, 36);
eq("tier avg", ts1.avgTier, 11400);
eq("tier downsell gap", ts1.downsellGap, -742.8571, 0.001);
eq("tier no pitches → nulls", mod.tierStats({ ...SEED[0], p1: 0, p2: 0, p3: 0 }, PRICES).avgTier, null);

// ---- formatters ------------------------------------------------------------
eq("fp", mod.fp(55.5556), "55.6%");
eq("money", mod.money(9350), "$9,350");
eq("fx", mod.fx(3.3467), "3.3x");
eq("null formats", `${mod.fp(null)}${mod.money(null)}${mod.fx(null)}${mod.fn(null)}`, "————");

if (fails > 0) { console.log(`\n${fails} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
