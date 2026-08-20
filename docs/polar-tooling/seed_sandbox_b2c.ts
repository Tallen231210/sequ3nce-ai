// Build the four Sequ3nce Personal (B2C) plan products in Polar's SANDBOX.
//
// Run: npx tsx docs/polar-tooling/seed_sandbox_b2c.ts
//
// Sandbox only, by construction — reads ~/.polar-sandbox-key and posts to
// sandbox-api.polar.sh (same guarantee as seed_sandbox.ts).
//
// Metadata is keyed `b2c_plan`, deliberately NOT `tier`: the B2B tier map
// (buildTierMap in src/lib/polar.ts) keys on metadata.tier, and a Personal
// product carrying that key would collide with the team plans. The B2C
// webhook branch recognises its products by `b2c_plan` presence alone.
//
// Idempotent: an existing product with a b2c_plan tag is left alone.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://sandbox-api.polar.sh";

const TOKEN = (() => {
  const raw = readFileSync(join(homedir(), ".polar-sandbox-key"), "utf8");
  const m = raw.match(/polar_[A-Za-z0-9_-]+/);
  if (!m) throw new Error("No polar_ token found in ~/.polar-sandbox-key");
  return m[0];
})();

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
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  }
  return text ? JSON.parse(text) : null;
}

// The blessed ladder (2026-08-19): $150/mo · $400/3mo · $600/6mo · $1000/yr.
// Charged as the TOTAL per billing period; the UI displays per-month.
// The 3-month's thin discount is deliberate — it's the decoy that makes the
// 6-month look brilliant on a sales call.
const PLANS = [
  { plan: "monthly", name: "Sequ3nce Personal — Monthly", amount: 15_000, interval: "month", count: 1 },
  { plan: "3month",  name: "Sequ3nce Personal — 3 Months", amount: 40_000, interval: "month", count: 3 },
  { plan: "6month",  name: "Sequ3nce Personal — 6 Months", amount: 60_000, interval: "month", count: 6 },
  { plan: "yearly",  name: "Sequ3nce Personal — Yearly",  amount: 100_000, interval: "year",  count: 1 },
];

async function main() {
  const existing = await call("GET", "/v1/products/?is_archived=false&limit=100");
  const byPlan = new Map<string, string>();
  for (const p of existing.items ?? []) {
    const t = p?.metadata?.b2c_plan;
    if (typeof t === "string") byPlan.set(t, p.id);
  }

  for (const t of PLANS) {
    if (byPlan.has(t.plan)) {
      console.log(`  skip  ${t.name} — already exists (${byPlan.get(t.plan)})`);
      continue;
    }
    const created = await call("POST", "/v1/products/", {
      name: t.name,
      description: "Sequ3nce Personal — call recording, AI analysis, community.",
      recurring_interval: t.interval,
      ...(t.count > 1 ? { recurring_interval_count: t.count } : {}),
      metadata: { b2c_plan: t.plan },
      prices: [{ amount_type: "fixed", price_amount: t.amount }],
    });
    const fixed = created.prices?.find((p: { amount_type: string }) => p.amount_type === "fixed");
    const ok =
      fixed?.price_amount === t.amount &&
      created.metadata?.b2c_plan === t.plan &&
      created.recurring_interval === t.interval &&
      (t.count === 1 || created.recurring_interval_count === t.count);
    console.log(`  ${ok ? "made" : "FAILED"}  ${t.name} ${created.id} $${t.amount / 100} every ${t.count} ${t.interval}(s)`);
    if (!ok) process.exitCode = 1;
  }

  console.log("\nVerifying what a customer would actually be quoted:");
  const after = await call("GET", "/v1/products/?is_archived=false&limit=100");
  for (const t of PLANS) {
    const product = (after.items ?? []).find(
      (p: { metadata?: { b2c_plan?: string } }) => p.metadata?.b2c_plan === t.plan,
    );
    if (!product) {
      console.log(`  FAILED  ${t.name} — no product carries b2c_plan="${t.plan}"`);
      process.exitCode = 1;
      continue;
    }
    const checkout = await call("POST", "/v1/checkouts/", {
      products: [product.id],
      success_url: "https://sequ3nce.ai/personal/activate?checkout_id={CHECKOUT_ID}",
    });
    const total = checkout.total_amount ?? checkout.amount;
    const ok = total === t.amount;
    if (!ok) process.exitCode = 1;
    console.log(`  ${ok ? "pass" : "FAIL"}  ${t.name}: $${(total / 100).toFixed(2)} (expected $${(t.amount / 100).toFixed(2)})`);
  }
}

void main();
