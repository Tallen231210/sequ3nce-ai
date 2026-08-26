// CLI bench for the engine — the SEED array from the reference HTML with
// expected values computed from its own math. Run: node engine.bench.mjs
// (reads the compiled TS via a quick transpile-free re-import trick: the
// engine is dependency-free, so we strip types with a regex good enough
// for this one file).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
let src = readFileSync(join(here, "engine.ts"), "utf8");
// strip TS-only syntax: interfaces, type aliases, annotations, as-const/casts
src = src
  .replace(/export interface [\s\S]*?\n\}/g, "")
  .replace(/export type .*?;\n/g, "")
  .replace(/ as const;/g, ";")
  .replace(/: (LedgerRow\[\]|LedgerRow|Rollup|CascadeField|number\[\]|number \| null|number|string)\b(\[\])?/g, "")
  .replace(/\(x\)/g, "(x)");
const mod = await import(
  "data:text/javascript;base64," + Buffer.from(src).toString("base64")
);

const SEED = [
  { rosterId: "1", name: "Erten", pod: "A", dials: 1216, connects: 119, sets: 34, booked: 67, showed: 42, closed: 0 },
  { rosterId: "2", name: "Mo", pod: "A", dials: 859, connects: 65, sets: 13, booked: 24, showed: 4, closed: 0 },
  { rosterId: "3", name: "Ethan", pod: "B", dials: 770, connects: 35, sets: 9, booked: 7, showed: 1, closed: 0 },
  { rosterId: "4", name: "Roane", pod: "B", dials: 729, connects: 19, sets: 9, booked: 9, showed: 3, closed: 0 },
  { rosterId: "5", name: "Israel", pod: "B", dials: 1076, connects: 55, sets: 15, booked: 6, showed: 2, closed: 0 },
  { rosterId: "6", name: "Noah", pod: "B", dials: 322, connects: 30, sets: 1, booked: 1, showed: 1, closed: 0 },
  { rosterId: "7", name: "Marcus", pod: "B", dials: 280, connects: 18, sets: 5, booked: 6, showed: 3, closed: 0 },
];

let fails = 0;
function eq(label, got, want, tol = 0.01) {
  const ok = typeof want === "number" ? Math.abs(got - want) < tol : got === want;
  if (!ok) { fails++; console.log(`FAIL ${label}: got ${got}, want ${want}`); }
  else console.log(`pass ${label}`);
}

// Rollup vs hand-computed totals from the HTML's SEED
const t = mod.rollup(SEED);
eq("team dials", t.dials, 5252);
eq("team connects", t.connects, 341);
eq("team sets", t.sets, 86);
eq("team booked", t.booked, 120);
eq("team showed", t.showed, 56);
eq("pickup %", t.pickup, (341 / 5252) * 100);
eq("connect→set %", t.c2s, (86 / 341) * 100);
eq("dials/set", t.dps, 5252 / 86);
eq("show %", t.show, (56 / 120) * 100);
eq("dials/show", t.dpsh, 5252 / 56);

// Cascade: Erten dials 1216→2000 at current rates
const erten = SEED[0];
const cascaded = mod.cascadeWith(erten, 0, mod.ratesOf(erten), 2000);
eq("cascade connects", cascaded.connects, 196);
eq("cascade sets", cascaded.sets, 56);
eq("cascade booked", cascaded.booked, 110);
eq("cascade showed", cascaded.showed, 69);
eq("cascade leaves closed", cascaded.closed, 0);

// Team pro-rata: doubling team dials keeps the sum exact
const doubled = mod.teamSetCount(SEED, 0, 10504);
eq("distribute sum exact", doubled.reduce((a, r) => a + r.dials, 0), 10504);

// distribute() with zero current total splits evenly
const zeros = SEED.map((r) => ({ ...r, closed: 0 }));
const dist = mod.distribute(zeros.slice(0, 4), "closed", 10);
eq("even split sum", dist.reduce((a, r) => a + r.closed, 0), 10);

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
