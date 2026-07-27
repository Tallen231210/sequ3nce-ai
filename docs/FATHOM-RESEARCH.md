# Fathom integration — research and viability

**Researched 2026-07-26 from Fathom's developer documentation.** Phase 1 is now built and running against production — see "What building it actually taught us" at the bottom, which corrects three things this document got wrong. Sources are `developers.fathom.ai` (full doc index at `/llms.txt`, machine-readable spec at `/api-reference/openapi.yaml`) and Fathom's help centre.

Marked throughout: **[confirmed]** from the docs, **[inferred]** reasoning from them, **[unknown]** needs Fathom or a live customer to answer.

---

## Verdict

**Viable.** Fathom has a real, documented API with the two things this needs: a way to be told when a meeting finishes, and a transcript with speaker names and timestamps. The architecture is webhook-driven rather than polling.

The one genuine constraint is a rate limit that makes historical backfill slow. Everything else is engineering.

---

## 1. Getting connected: two paths

### API key **[confirmed]**
The customer generates a key in their Fathom settings and pastes it to us. Sent as `X-Api-Key`, or as a bearer token. Simplest possible integration — no approval, no waiting.

### OAuth app **[confirmed]**
A proper "Connect Fathom" button. Requires registering an app with Fathom, who review and approve it before launch.

- One scope only: `public_api`
- Standard authorisation-code flow; token endpoint `https://api.fathom.ai/external/v1/oauth2/token`
- Returns `access_token` + `refresh_token`
- **A refresh token can only be used once** — each refresh issues a new one. Storing these correctly matters; lose the rotation and the customer silently disconnects.
- Rate limit on the token endpoint: 60 requests/minute per app

**Recommendation:** build against API keys first to prove the pipeline, then add OAuth for the polished flow. The data endpoints are the same either way, so OAuth becomes a front-door change rather than a rewrite.

---

## 2. Whose meetings can we see? — the question that decides everything

This looked like a blocker earlier. It isn't; it's a customer configuration question with a clear answer.

Fathom gives every user a **view access** level **[confirmed]**:

| Level | Sees |
|---|---|
| `own_meetings` | only their own recordings |
| `team` | their team's |
| `multiple_teams` | several teams' |
| `all_teams` | everything in the organisation |

A key or token inherits the view access of the user it belongs to **[inferred, strongly implied]**. So:

- **One connection can cover a whole sales team** — if it belongs to a user with `team` or `all_teams` access, and recordings are shared to teams rather than kept private.
- Otherwise each closer connects individually.

Both are Fathom-side settings the customer controls, not something we can force. **Support both.** The `/users` endpoint reports each user's view access (admin-only, 403 otherwise), so we can *detect* which world we're in rather than guess — worth doing on connect, and worth telling the customer plainly if their setup will only see one person's calls.

Note the help centre's narrower phrasing — *"your key can only access meetings you've recorded or that have been shared with you or your Team"* — is consistent with the above, and confirms sharing is the mechanism.

---

## 3. Architecture: webhooks, not polling

**[confirmed]** Fathom pushes new meeting content to a URL we register.

**Creating a webhook** takes:
- `destination_url`
- `triggered_for` — at least one of: `my_recordings`, `shared_external_recordings`, `my_shared_with_team_recordings`, **`shared_team_recordings` (Team plans only)**
- At least one of `include_transcript`, `include_summary`, `include_action_items`, `include_crm_matches`

`shared_team_recordings` is the important one: **a single webhook can receive the whole team's calls.**

**Security [confirmed]:** creation returns a `secret` (format `whsec_…`). Every delivery carries `webhook-id`, `webhook-timestamp` and `webhook-signature` headers, verified by HMAC-SHA256 over `${id}.${timestamp}.${body}`, base64, compared in constant time. This is the Standard Webhooks specification, so the verification is well-trodden. **We must verify** — an unverified webhook endpoint is an open door for anyone who learns the URL.

**Retry behaviour on delivery failure: [unknown]** — not documented. Assume we may miss deliveries and reconcile with a periodic `list meetings` sweep. That reconciliation is not optional; it's how the integration survives our own downtime.

---

## 4. What we actually get per meeting **[confirmed]**

- `recording_id`, `url`, `share_url`
- `title`, `meeting_title`, `meeting_type`
- `created_at`, `scheduled_start_time`/`end`, `recording_start_time`/`end` — duration is derived, there is no duration field
- `recorded_by` — **which closer this call belongs to**, the attribution we could never derive from calendars
- `calendar_invitees` — name, email, domain, and an external flag per person
- `calendar_invitees_domains_type` — `only_internal` or `one_or_more_external`
- `shared_with` — `no_teams` / `single_team` / `multiple_teams` / `all_teams`
- `transcript_language`
- `transcript` — array of `{ speaker: { display_name, matched_calendar_invitee_email }, text, timestamp "HH:MM:SS" }`
- `default_summary`, `action_items`, `highlights`, `crm_matches`

### This answers "sales call vs internal standup"
`calendar_invitees_domains_type: one_or_more_external` filters to meetings with an outsider present, and `meeting_type` filters further. That was one of the three open questions — **answered, no customer input needed.** Getting it wrong would have destroyed every close rate by counting internal meetings as calls.

### What we do NOT get **[confirmed]**
- **No audio or video file.** Only `share_url`, a Fathom-hosted page. Everything that plays, scrubs or clips media is out for this tier — as already accepted.
- OAuth apps cannot inline transcripts or summaries in the list call: *"Unavailable for OAuth connected apps (use /recordings instead)."* The dedicated `/recordings/{id}/transcript` and `/recordings/{id}/summary` endpoints are available instead, and webhooks can carry transcripts directly. **Not a blocker, but it shapes the code** — one call per recording rather than a bulk fetch.

---

## 5. Rate limits — the real constraint **[confirmed]**

| Request type | Limit |
|---|---|
| Standard | 60 per 60s |
| **Heavy** (recordings endpoints; meetings with summaries/transcripts) | **30 per 60s, reduced to 5 per 60s during high activity** |
| OAuth token endpoint | 60 per 60s per app |

Fathom states higher limits are not offered.

**Live traffic is fine** — webhooks push to us and cost no quota.

**Backfill is the problem.** Fetching history one transcript at a time, at a floor of 5 per minute, means a customer with 500 past calls could take **over an hour and a half**, and that is per customer. This needs a queue with backoff that respects 429s, and it needs to be honest in the UI: *"importing your history, this takes a while"* rather than a spinner that looks broken. It also argues for a **shallow default backfill** — 30 or 60 days — with deeper history as an opt-in.

---

## 6. Filters available on list meetings **[confirmed]**

`created_after`, `created_before`, `cursor`, `meeting_type`, `recorded_by[]` (emails), `teams[]`, `calendar_invitees_domains[]`, `calendar_invitees_domains_type`, and the four `include_*` flags. Cursor pagination via `next_cursor`.

Page size and any depth limit: **[unknown]** — the pagination page doesn't say. Determine empirically.

---

## 7. Open questions

**For Fathom** (a support email answers all three):
1. Can an **OAuth app create webhooks**? The spec shows no restriction and the docs are silent — everything hinges on this if we go OAuth-first. **[unknown]**
2. Which plan tier includes `shared_team_recordings`? The docs say "Team Plans only" without defining it. **[unknown]**
3. How long does OAuth app review take, and what do they require? **[unknown]**

**For a customer:**
4. What view access does their admin have, and are recordings shared to teams? Determines one connection vs many. We can detect this via `/users` once connected.

**For us:**
5. How far back to backfill by default, given the rate limit above.

---

## 8. What this means for building it as a separate product

Tyler's framing: this is **its own product with its own Stripe pricing**, not a feature toggle. That adds work beyond the integration:

- A new Stripe product and price, separate from the existing platform fee and per-seat model
- A tier concept on the team record (the `plan` field today only tracks subscription *status*, not which product they bought)
- Deciding what an existing customer sees if they buy this instead of, or as well as, the bot product
- Sign-up, billing and upgrade/downgrade paths for a customer who has never had the bot at all

None of that is Fathom-specific, and none of it is hard — but it is a second project sitting behind the first, and worth scoping separately rather than discovering mid-build.

---

## 9. Suggested build order

1. **Prove the pipeline** with an API key and one real Fathom account: connect → webhook → a call appears in Sequ3nce with its transcript and the right closer attached.
2. **Reconciliation sweep** so a missed webhook self-heals.
3. **Backfill** with a rate-limit-aware queue and honest progress.
4. **OAuth**, once Fathom approves the app — replaces the key-paste, changes nothing downstream.
5. **Productise**: Stripe, tiering, sign-up.

Step 1 is small and answers the only questions that could still sink this.


---

## 10. What building it actually taught us

Added 2026-07-26 after Phase 1 shipped. **Three things above are wrong.** Trust
this section over the research where they conflict.

### `calendar_invitees_domains_type` cannot be trusted — §4 was wrong

Section 4 claimed this field "answers sales call vs internal standup". It does
not. Checked against 27 real meetings on a live account:

- It reported **26 of 27** as having an external person present.
- All twelve impromptu meetings were flagged that way when the invitee list
  contained only the account owner.

The flag means "not in your Fathom workspace", which is a different question
from "not a colleague". Believing it would have counted every ad-hoc internal
call as a sales call and destroyed every close rate on the board — the exact
failure §4 claimed it prevented.

**What we do instead** (`convex/fathomClassify.ts`): compare everyone on the
call against the team roster we already hold. Emails decide where we have them.

### The invitee list is wrong, not just sparse

Worth stating separately because it changes the design. On impromptu meetings
Fathom lists only the account owner **even when other people attended** — the
transcripts for those same meetings carry three to six named speakers.

So the classifier falls back to who actually spoke. Names are weak identifiers
(real examples from one account include "jodip" and "Team Club"), so they only
rule a call OUT: every voice a colleague means internal; an unrecognised voice
means we ask rather than guess.

**The classifier is only as good as the roster.** Someone who joins calls and
isn't registered — a manager, a VA — reads as an outsider. That is the known
failure mode and the reason the closer-facing correction exists.

### There is no way to list your webhooks

`POST /webhooks`, `POST /webhooks/{id}`, `DELETE /webhooks/{id}` — no GET. The
id returned at creation is the only record that a webhook exists. Lose it and it
delivers to us forever with no way to find or remove it. So: store the id before
anything else can fail, and always delete the old one before creating a new one.

### Scopes are not additive the way they look

On a Team plan `my_recordings` **excludes** anything shared with a team. Asking
for it alone misses most of a sales team's calls. We request every scope and
narrow only if Fathom refuses, which is what makes both a personal account and a
company account work through one code path.

### Rate limits were less of a problem than §5 feared

Live traffic costs nothing, as expected — but `GET /meetings?include_transcript=true`
returns full transcripts inline for a page of meetings in a single request. Ten
meetings with transcripts up to 68,000 characters came back in one call. Backfill
still needs a queue, but the "one heavy request per recording" assumption that
made it look 90 minutes long does not apply to the list endpoint.

### Keeping calls out of the numbers

Not a Fathom fact, but the thing most likely to be got wrong by whoever picks
this up next. Roughly twenty queries aggregate the calls table and every one of
them narrows to `status === "completed"`. Unconfirmed calls therefore carry
`status: "unclassified"`, which excludes them everywhere without editing a
single query, and the closer's own history is widened to still show them.

`status` and `countsTowardStats` must never be set independently — they drifted
once already, leaving a call the closer had marked internal still counting.
Status is now always derived from the classification.

### Still not built

Backfill beyond the most recent page, the reconciliation sweep for missed
webhooks, OAuth, and everything in §8 (Stripe, tiering, upgrade/downgrade).
