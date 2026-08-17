// Proves Polar's graduated seat pricing produces the totals we intend to charge,
// against a throwaway product that is archived again before this script exits.
//
// Run: npx tsx docs/polar-tooling/pricing_probe.ts
// The token is read from ~/.polar-key and is never printed.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://api.polar.sh";

function token(): string {
  const raw = readFileSync(join(homedir(), ".polar-key"), "utf8");
  const match = raw.match(/polar_[A-Za-z0-9_-]+/);
  if (!match) throw new Error("No polar_ token found in ~/.polar-key");
  return match[0];
}

const TOKEN = token();

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return parsed;
}

// Overwatch's intended shape: $650 base, first seat free, $150 each after.
const BASE_CENTS = 65_000;
const EXTRA_SEAT_CENTS = 15_000;

// Expected totals, and the old shape they must match: $500 + $150 x seats.
const CASES = [1, 2, 3, 10].map((seats) => ({
  seats,
  expected: BASE_CENTS + Math.max(0, seats - 1) * EXTRA_SEAT_CENTS,
  oldShape: 50_000 + seats * 15_000,
}));

async function main() {
  let productId: string | undefined;
  let failures = 0;

  try {
    const product = await call("POST", "/v1/products/", {
      name: "__pricing probe — archived automatically, do not buy",
      recurring_interval: "month",
      prices: [
        { amount_type: "fixed", price_amount: BASE_CENTS },
        {
          amount_type: "seat_based",
          seat_tiers: {
            seat_tier_type: "graduated",
            tiers: [
              { min_seats: 1, max_seats: 1, price_per_seat: 0 },
              { min_seats: 2, max_seats: null, price_per_seat: EXTRA_SEAT_CENTS },
            ],
          },
        },
      ],
    });
    productId = product.id;
    console.log(`probe product ${productId} created`);

    for (const c of CASES) {
      const checkout = await call("POST", "/v1/checkouts/", {
        products: [productId],
        seats: c.seats,
        success_url: "https://sequ3nce.ai/subscribe?success=true",
      });
      const actual = checkout.total_amount ?? checkout.amount;
      const ok = actual === c.expected && c.expected === c.oldShape;
      if (!ok) failures++;
      console.log(
        `  ${ok ? "pass" : "FAIL"}  ${c.seats} seat(s): ` +
          `got $${(actual / 100).toFixed(2)}, ` +
          `intended $${(c.expected / 100).toFixed(2)}, ` +
          `old shape $${(c.oldShape / 100).toFixed(2)}`,
      );
    }
  } finally {
    // Archive even if a case threw. A live probe product in a real catalogue is
    // something a customer could buy. A failed archive is a failed run — it must
    // not be swallowed by an unhandled rejection, and it must not let the run
    // report ALL PASS while the product is still live.
    if (productId) {
      try {
        await call("PATCH", `/v1/products/${productId}`, { is_archived: true });
        const after = await call("GET", `/v1/products/${productId}`);
        if (after.is_archived) {
          console.log(`probe product ${productId} archived`);
        } else {
          failures++;
          console.log(
            `WARNING: probe product ${productId} is STILL LIVE — archive it by hand`,
          );
        }
      } catch (err) {
        failures++;
        console.log(
          `WARNING: probe product ${productId} archive check FAILED (${(err as Error).message}) — it may be STILL LIVE, archive it by hand`,
        );
      }
    }
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
