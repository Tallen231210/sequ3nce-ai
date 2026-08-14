# Polar — taking payments for Sequ3nce for Teams

## Why this exists

Stripe was built to sell the B2B product self-serve: sign up, pick a tier, pay,
land in the dashboard. That path no longer works. The signed-out branch of
`/subscribe` was deliberately removed, `pricesForTier` throws for Overview and
Oversight because their price IDs were never created, and the buy button is
disabled with "Plans aren't available to buy online just yet."

There are **zero active Stripe subscriptions**. All twelve are canceled —
Gianni, Boris, Chelsea, AICom, Zion, and the four $99 B2C ones. Every current
customer is comped and invoiced outside the software.

That makes this a clean start rather than a migration. No live subscription can
be corrupted by getting it wrong, nothing has to run in parallel, and no
customer has to be moved.

The goal is narrow: **a new B2B client can sign up, pay through Polar, and get
into the dashboard, with no involvement from Tyler.**

## What already exists

Built 2026-07-29 and deployed, never exercised:

| Piece | Where |
|---|---|
| Subscription → tier mapping, status mapping | `convex/polar.ts` |
| `applySubscription` — writes tier, seats, status, period end | `convex/polar.ts` |
| `linkPolarCustomer` | `convex/polar.ts` |
| `getTeamByPolarCustomer` | `convex/polar.ts` |
| Webhook endpoint + Standard Webhooks signature check | `convex/http.ts` ~12350 |
| `polarCustomerId`, `polarSubscriptionId`, `by_polar_customer` index | `convex/schema.ts` |
| `POLAR_WEBHOOK_SECRET` | Convex prod env |

In the Polar account (org `99ee9b9f-d7bb-465d-8e4b-ea750c80f655`, approved for
live payments): three products tagged `metadata.tier`, each with a fixed base
price and a seat-based price. Zero customers, zero subscriptions.

**Everything outbound is missing.** There is no way to send anyone to Polar: no
checkout, no portal, no seat sync, no tier change, and no `POLAR_ACCESS_TOKEN`.
All five places in the app that touch billing post to `/api/stripe/...`.

## Constraint discovered against the live API

Polar **cannot sell zero seats.** `POST /v1/checkouts/` with `seats: 0` is
rejected with "Input should be greater than or equal to 1", and the minimum is
derived from the price's first seat tier — `ProductPriceSeatTier.min_seats` has
a schema minimum of 1, so it cannot be configured lower.

Stripe's model — platform fee at checkout, seats appended as line items when
closers are added — is therefore not reproducible. This drove the pricing
decision below.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Scope | B2B tiers only | The $99 Personal app keeps its Stripe path; it has separate routes, a separate user table and its own release cycle. |
| Who can buy | Full self-serve | Tyler: "Theyre suppossed to sign up, pay and get into the dashboard." |
| Existing customers | Not migrated | Comped, invoiced outside the software on revenue-varying terms. Polar is for new business. |
| Seat floor | Fold the first closer into the base price | Polar can't do zero seats. Same revenue, one number to quote. |
| Adding a closer mid-month | Bills at next renewal | Tyler's call. `proration_behavior: "next_period"`. |
| Stripe | Left entirely alone | B2C depends on it. New routes sit alongside rather than replacing. |

## Pricing

The fixed base absorbs one closer, and the seat price becomes **graduated** so
the first seat is free and additional seats charge the per-closer rate.

| Tier | Base | Seat tier 1 (1 seat) | Seat tier 2 (2+) |
|---|---|---|---|
| Overview | $225 | $0 | $25 |
| Oversight | $400 | $0 | $50 |
| Overwatch | $650 | $0 | $150 |

Revenue is unchanged at every closer count. Overwatch with three closers is
$650 + 2 × $150 = $950; under the old shape it was $500 + 3 × $150 = $950. The
same identity holds for all three tiers at all counts ≥ 1.

`TIER_PRICING` in `src/lib/tiers.ts` becomes the new base figures and gains a
note that the base includes one closer. It feeds exactly two display sites —
`PlanChooser.tsx` and `_landing/PricingTiers.tsx` — so the copy change is
contained.

**This must be verified before the real products are touched.** A throwaway
product with the same graduated configuration, priced through
`POST /v1/checkouts/` at 1, 2, 3 and 10 seats, must produce the totals above. If
graduated tiering does not behave as documented, fall back to keeping the
current base and seat prices and presenting the combined figure — same money,
less elegant invoice — rather than shipping a pricing model that computes wrong.

## Architecture

New routes under `/api/polar/`, mirroring the Stripe ones the pages already
call. Not edits to the Stripe routes, for two reasons: the B2C app shares
`tiers.ts` and the Stripe helpers, so editing in place risks the one product
line that has paying history; and a rollback is changing five fetch URLs rather
than reverting a rewrite.

### `src/lib/polar.ts`

The Polar counterpart to `tiers.ts`, and deliberately much smaller. Polar has no
price-to-tier map to maintain — one subscription is one product, so the product
IS the plan.

- `productIdForTier(tier)` — asks Polar for the non-archived product whose
  `metadata.tier` matches, per-instance cached for 60s.
- `availableTiers()` — the tiers that actually have a product. Replaces
  `tierIsAvailable`, which checks whether an env var was set rather than
  whether the thing is sellable.
- `polarFetch(path, init)` — one place that attaches the token, sets the JSON
  headers, and turns a non-2xx into a thrown error carrying Polar's own message.
  Callers never see a raw response.

  This is load-bearing, not boilerplate. While probing the API during design, a
  `PATCH` that combined a valid field with an invalid one was rejected wholesale
  and the caller read the error body as a success with empty fields — so the
  product it was meant to archive stayed live and looked archived. Polar
  validates the entire request body atomically and says so in the response;
  anything that doesn't read that response reports a change that never happened.

Product IDs are resolved from Polar, not from env vars and not hardcoded. Three
UUIDs in source is what `convex/polar.ts` already rejected on the inbound side,
and env vars reintroduce the exact failure this replaces — a tier that looks
sellable because someone set a variable, and fails at checkout because the
product doesn't exist. A tier with no matching product cannot be bought and its
button does not render.

If Polar is unreachable, `availableTiers()` throws rather than returning an
empty list. An empty list renders as "no plans available", which is a lie during
an outage and would quietly stop all sales.

### Routes

Six of them. All authenticate with Clerk, resolve the team through
`api.billing.getTeamBilling`, and refuse to act without one — except
`available-tiers`, which is deliberately public.

**`POST /api/polar/create-checkout`** — body `{ tier }`.
- `products: [productIdForTier(tier)]`
- `external_customer_id: team._id` — our own id, so the webhook can find the
  team even if the customer-id write is missed
- `seats: Math.max(1, activeCloserCount)` — the floor is Polar's, not ours
- `customer_email` prefilled from Clerk
- `success_url: {origin}/subscribe?success=true`, `return_url` to `/subscribe`
- `allow_discount_codes: true`, matching Stripe's `allow_promotion_codes`
- `metadata: { clerkId, tier }` — informational; the tier acted on always comes
  from the product, so metadata can never disagree with what they paid for

Returns `{ url }`. The client redirects.

**`POST /api/polar/create-portal`** — `POST /v1/customer-sessions/` with
`external_customer_id: team._id`, returns `customer_portal_url`.

Using our own id rather than `polarCustomerId` matters: the portal keeps working
even if the customer-id write was missed, which is the same reasoning that put
`external_customer_id` on checkout. Polar returns a 404 for a team that has never
paid, which the route turns into a plain "you don't have a subscription yet"
rather than creating a customer that has bought nothing.

**`POST /api/polar/update-seats`** — body `{ seatCount }`.
- `PATCH /v1/subscriptions/{id}` with
  `{ seats: Math.max(1, seatCount), proration_behavior: "next_period" }`
- Then writes `seatCount` to Convex. A missing team here is a real error and is
  surfaced — unlike in the webhook, where an orphan must still ack 200.
- Removing every closer floors at 1 seat, which is free under the new pricing,
  so the team pays the base and nothing is charged for a seat they don't have.

**`POST /api/polar/change-tier`** — body `{ tier }`.
- `PATCH /v1/subscriptions/{id}` with `{ product_id, proration_behavior }`
- Keeps the downgrade confirmation that `featuresLostMovingTo` already drives.
  A customer who discovers after the fact that their bot stopped joining calls
  raises a chargeback, and they would be right to.

**`GET /api/polar/subscription-summary`** — reads the subscription from Polar and
returns tier, status, the line breakdown, and monthly total. No team subscription
means `hasSubscription: false` and an explicit null total rather than an invented
price — comped teams and pre-checkout teams both land here.

`isLegacyPricing` disappears. It exists to warn customers grandfathered onto
pre-tier Stripe prices that changing plan gives up their rate. Nobody is
grandfathered on Polar, and no one will be.

### Convex

`getTeamBilling` returns `polarCustomerId` and `polarSubscriptionId` alongside
the Stripe ones. Additive; the Stripe routes and the B2C app read the same query
and are unaffected.

Nothing else changes. `applySubscription` already protects
`productTierOverride`, which is what keeps every comped team safe.

### Signup

`/subscribe` gains a signed-out branch with `<SignUpButton mode="modal">` — the
same component `/join` already uses. There is no `/sign-up` route to build;
Clerk runs as a modal throughout the app. `useTeam()` already creates the user
and team in Convex on first load and flags self-serve creations, so team
provisioning needs nothing new.

`/api/polar/available-tiers` is readable when signed out. The Stripe version
returns 401 to a logged-out visitor and `PlanChooser` reads that as "no plans
exist" — a prospect would be told plans aren't available while they are. Pricing
is not a secret.

The `looksLikeAWrongTurn` banner stays exactly as it is. It exists because a
colleague signing in with the wrong address gets an auto-created team and reads
the pricing page as "your company's account has lapsed" — a misread that cost an
hour of live debugging on 2026-08-12.

### The comped-team redirect

`/subscribe` only redirects to the dashboard when `?success=true` is in the URL.
A comped manager with an active subscription and no checkout behind them sits on
the paywall forever — this is what happened to Zion on 2026-08-13. The redirect
condition drops the `wasSuccess` gate: an active or trialing subscription means
go to the dashboard, however they arrived.

## Files

**New:** `src/lib/polar.ts`, and `src/app/api/polar/{create-checkout,
create-portal,update-seats,change-tier,subscription-summary,available-tiers}/route.ts`.

**Changed:** `src/app/subscribe/page.tsx` (signup branch, Polar endpoint,
redirect fix), `src/app/subscribe/PlanChooser.tsx` and
`src/app/_landing/PricingTiers.tsx` (one price, includes a closer),
`src/app/dashboard/billing/page.tsx` and `plan-selector.tsx` (Polar endpoints),
`src/app/dashboard/team/page.tsx` (seat endpoint), `src/lib/tiers.ts`
(`TIER_PRICING`), `convex/billing.ts` (`getTeamBilling` returns Polar ids).

**Untouched:** every Stripe route, `convex/http.ts`'s Stripe webhook, the whole
B2C path, and `convex/polar.ts` unless testing proves a defect.

## Configuration

- `POLAR_ACCESS_TOKEN` in Vercel (the API routes are Next.js, not Convex). The
  token at `~/.polar-key` is an organization access token.

  **Scopes verified 2026-08-14**, so no route in this spec can fail on
  permissions: products read + **write** (a probe product was created and
  archived), subscriptions read + **write** (`PATCH` on a well-formed but
  non-existent subscription returns 404 Not Found, not 403 insufficient_scope),
  customers read, and checkout creation. `benefits` and `organizations` are NOT
  granted; nothing here needs them.

  Probing with an all-zeros UUID does not work — Polar rejects it as not
  version 4 and returns 422 before reaching the permission check. Use a
  well-formed v4 UUID to tell 403 from 404.
- The webhook in Polar must be configured for `subscription.created`,
  `subscription.updated`, `subscription.active`, `subscription.canceled`,
  `subscription.revoked` and `subscription.uncanceled`.

## Verification

1. **Pricing math** against a throwaway Polar product, at 1/2/3/10 seats, before
   any real product is edited.
2. **Webhook round trip** — a real checkout completed with a real card, then
   confirm the team's tier, seats, status and period end in Convex.
3. **The full path end to end**, on Tyler's own card: sign up as a stranger →
   pick a tier → pay → land in the dashboard → add a closer → confirm the seat
   change is booked for next period, not charged now → change tier → cancel via
   the portal → confirm access ends correctly.
4. **Comped teams unaffected** — ManyJobs, CreateFreedom and E2 Influencers still
   read as paid, still show their pinned tier, and nothing attempted to bill them.
5. **Signed-out pricing page** shows all three plans, not "get in touch".
6. `npx tsc --noEmit` and `npx next build` clean.

## Risks

- **A pricing model that computes wrong is worse than no pricing model.** The
  graduated seat behaviour is the one genuinely novel piece and is verified
  first, in isolation, with a fallback that gives up elegance rather than
  correctness.
- **The webhook has never received a real delivery.** It was written, corrected
  once for a signature-decoding bug that would have made Polar disable the
  endpoint after ten silent failures, and never exercised. Treat its first real
  event as unproven, not as tested code.
- **Polar disables an endpoint after 10 consecutive non-2xx responses.** The
  existing handler already acknowledges unrecognised events rather than failing
  them; anything added must keep that property.
- **Convex trusts a client-supplied `clerkId`.** Not introduced here and not
  fixed here, but every one of these routes resolves a team through it, so it
  stays on the list.
- **Two processors in the codebase.** Stripe for B2C, Polar for B2B, sharing
  `teams` fields and the `tiers.ts` feature map. Acceptable while B2C stays on
  Stripe; it becomes debt the moment someone tries to make one team use both.

## Explicitly out of scope

The $99 Personal app, migrating the comped teams, retiring any Stripe code,
annual plans, the untagged "Sequ3nce (3 month plan)" one-time product, and
seat *assignment* (Polar's invite-and-claim flow — we already know who a team's
closers are, so seats stay a number).
