# Fathom integration — research and viability

**Researched 2026-07-26 from Fathom's developer documentation.** Nothing built. Sources are `developers.fathom.ai` (full doc index at `/llms.txt`, machine-readable spec at `/api-reference/openapi.yaml`) and Fathom's help centre.

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
