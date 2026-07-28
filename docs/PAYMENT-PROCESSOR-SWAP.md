# Swapping the payment processor

Everything else for three-tier pricing is built. This is the only work left, and
it's blocked on the new processor's account and credentials.

Written now, while the Stripe integration is fresh, so the swap is a checklist
rather than an archaeology exercise.

---

## What the processor is actually responsible for

Only two things, and both matter more than they look:

1. **Taking the money** — checkout, seat quantities, plan changes, prorations.
2. **Being the source of truth for which plan a team is on.** The tier is
   *derived* from the price a subscription carries. Nothing else writes it. A
   team cannot be on Overwatch while paying for Overview, because there is only
   one fact and it lives at the processor.

Point 2 is the design decision the whole thing rests on. Whatever replaces
Stripe has to support: a subscription with **two line items** (a flat platform
fee, and a per-seat item with a quantity), the ability to **change the price on
an existing item**, and **webhooks** on subscription create/update/delete.

If the new processor can't do all three, tell me before the swap — the tier
model needs rethinking, not just re-plumbing.

---

## Files that touch the processor

Deliberately few. Everything processor-specific is in six files:

| File | What it does |
|---|---|
| `src/app/api/stripe/create-checkout/route.ts` | Starts a subscription for a chosen tier |
| `src/app/api/stripe/change-tier/route.ts` | Swaps both line items, with proration |
| `src/app/api/stripe/update-seats/route.ts` | Changes the seat quantity, at that tier's rate |
| `src/app/api/stripe/subscription-summary/route.ts` | Reads back what a team is really charged |
| `src/app/api/stripe/available-tiers/route.ts` | Which plans have prices configured |
| `src/app/api/webhooks/stripe/route.ts` | Receives changes, derives the tier, writes it |

Plus `src/app/api/stripe/create-portal/route.ts` (the hosted billing portal), if
the new processor has an equivalent.

**`src/lib/tiers.ts` is NOT processor-specific** and should not be rewritten. It
maps a price identifier to a tier and holds the feature matrix. Only the env var
names inside it mention Stripe.

---

## The order that avoids charging anyone twice

1. **Create the products and prices** in the new processor — three products,
   each with a platform price and a per-seat price. Six prices total.
2. **Add the IDs to env** under the existing names (`STRIPE_OVERVIEW_*` etc.).
   Renaming those is cosmetic and can wait; doing it during the swap adds a
   failure mode for no benefit.
3. **Migrate existing customers' subscriptions** to the new processor. This is
   the dangerous step and it is not a code change — it's a billing operation.
   Every current team is on legacy prices and must land on the equivalent new
   price, or they'll be re-quoted.
4. **Rewrite the six route files** against the new SDK.
5. **Point the webhook** at the new endpoint and verify signatures the new
   processor's way.
6. **Only then** remove the Stripe SDK.

---

## What must be true when it's done

- **Nobody's bill changed.** Snapshot every team's subscription items before,
  diff after. Any difference is a failure, not a rounding detail.
- **Grandfathered teams still resolve to Overwatch** and keep the rate they
  signed at. `classifyPrice` needs the legacy IDs mapped, exactly as it does now.
- An **unrecognised price leaves the tier untouched** and logs loudly. It must
  never fall through to a default — that silently strips a paying customer's
  access.
- **Upgrade and downgrade both prorate**, and a downgrade never deletes data.
- **Seat changes bill at the team's own tier**, not one global rate.
- A **pinned tier still wins** over whatever the processor says
  (`teams.productTierOverride`) — that's what comped and internal accounts rely
  on.

---

## Things that will bite

- **`teams.stripeCustomerId` and `stripeSubscriptionId` are named after
  Stripe.** They'll hold the new processor's ids. Renaming the fields is a
  schema migration touching billing, the webhook and several queries — worth
  doing eventually, not during the swap.
- **Comped teams have no subscription at all.** They're marked active with no
  customer id, so any migration that assumes a subscription will skip or break
  them. They rely on the tier override.
- **`isLegacyPrice` compares against `STRIPE_PLATFORM_PRICE_ID` and
  `STRIPE_SEAT_PRICE_ID`.** After a migration, "legacy" means the old
  processor's prices — decide whether that warning should survive the move.
- **The B2C side has its own Stripe integration** (`convex/b2cStripe.ts`,
  `b2cBilling.ts`, `/api/stripe/b2c-*`). It is separate and out of scope here,
  but it uses the same secret key — swapping the key breaks B2C billing unless
  both move together.

That last one is the one most likely to be missed.
