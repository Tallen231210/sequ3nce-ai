# Setter Data — Implementation Plan

**Status:** Draft v1 — pending review
**Target:** B2B web dashboard (`apps/web/`)
**Scope:** New tab + GHL Marketplace App + complete metric/notification pipeline
**Estimated effort:** 3–4 weeks of focused build

---

## 1. Goal

Give B2B sales managers a dedicated dashboard tab — **"Setter Data"** — that ingests data from their GoHighLevel sub-account via a Sequ3nce-owned GHL Marketplace App and surfaces:

- Lead-level activity (speed-to-lead, dials, SMS status, connection state)
- Setter-level performance (per-rep funnel: dials → connect → appointment → show)
- Pipeline-level visibility (stage history, source attribution, working-hours patterns)
- Slack/Discord reports (daily scorecard, optional real-time untouched-lead alerts)

The tab also absorbs the existing (never-functional) Disposition Sync feature so customers have a single GHL connection that powers both directions of integration.

### Success criteria

- A manager can install the GHL Marketplace App in one click from the Setter Data tab.
- Within 30 seconds of a lead entering GHL, that lead is visible in the Sequ3nce dashboard.
- Speed-to-lead is computed from GHL's own timestamps (accurate, not polling-bound).
- Per-setter funnel and show rate are visible without leaving the tab.
- Daily scorecard reaches the configured Slack/Discord channel at the configured time.
- No customer needs to paste an API key.

### Non-goals (v1)

- SMS template-level reply rates (Tier 3, deferred).
- Call-recording playback inside the dashboard (Tier 3, deferred).
- Task / follow-up tracking (Tier 3, deferred).
- Public Marketplace listing (private install only until ≥5 agencies).
- Migrating the legacy `team.ghlApiKey` flow (left in place; the new app is parallel).

---

## 2. Architecture overview

```
┌──────────────────────────────────────────────────────────────┐
│                    GoHighLevel (customer side)               │
│  ┌────────────┐    OAuth    ┌──────────────┐                 │
│  │ Sub-account│──install──▶│ Marketplace  │                  │
│  │ (location) │             │ App (ours)   │                 │
│  └────────────┘◀──webhooks──└──────────────┘                 │
└──────────────────────────────────────────────────────────────┘
                  │ POST /webhooks/ghl-marketplace
                  ▼
┌──────────────────────────────────────────────────────────────┐
│                   apps/web (Convex + Next.js)                │
│                                                              │
│  Next.js route ──┐                                           │
│  /api/ghl-mkt/   │  exchanges code for tokens                │
│  oauth/callback  │                                           │
│                  ▼                                           │
│  Convex action ─────▶ setterGhlInstallations table          │
│  setterGhlOauth.ts          (encrypted access + refresh)     │
│                                                              │
│  Convex httpAction ──▶ Ed25519 verify ──▶ scheduler.runAfter│
│  POST /webhooks/ghl-marketplace             (fast-ack)       │
│                                              │               │
│                                              ▼               │
│  Mutation router (internal)                                  │
│  • Contact.Create        → setterLeads upsert                │
│  • OutboundMessage(call) → setterLeadEvents + lead patch     │
│  • InboundMessage(SMS)   → setterLeadEvents + lead patch     │
│  • Appointment.Create    → setterAppointments insert         │
│  • Appointment.Update    → setterAppointments patch          │
│  • Opportunity.*         → setterOpportunities + transitions │
│  • INSTALL / UNINSTALL   → setterGhlInstallations            │
│                                                              │
│  Cron jobs (crons.ts)                                        │
│  • Hourly: reconciliation backfill (REST)                    │
│  • Daily 9am team-tz: scorecard generation + notify          │
│  • Every 2min: untouched-lead alert sweep                    │
│                                                              │
│  Queries (read path)                                         │
│  setterData.ts ──▶ /dashboard/setter-data UI                 │
└──────────────────────────────────────────────────────────────┘
```

**Three data flows:**

1. **Webhook-driven (real-time):** GHL fires events → we verify Ed25519 → fast-ack 200 → schedule internal mutation. This is the primary path for new data.
2. **REST backfill (initial sync + reconciliation):** When a customer first installs, we paginate through their contacts/conversations/appointments/opportunities to seed the database. An hourly cron repeats a delta backfill so any missed webhook is caught.
3. **Scheduled reports (push out):** Daily scorecard, untouched-lead alerts. Reuses the existing `slackNotifications` dedup pattern.

---

## 3. GHL Marketplace App setup

### 3.1 What we register on GHL's developer console

| Setting | Value |
|---|---|
| App type | Marketplace App |
| Distribution | Private (≤5 agencies) — Security Review later |
| Target user | Sub-account (location-level install) |
| Bulk install | No |
| OAuth redirect URL | `https://sequ3nce.ai/api/ghl-marketplace/oauth/callback` |
| Webhook URL | `https://<convex-prod>.convex.site/webhooks/ghl-marketplace` |
| Webhook events | `Contact.Create`, `Contact.Update`, `OutboundMessage`, `InboundMessage`, `Appointment.Create`, `Appointment.Update`, `Opportunity.Create`, `Opportunity.Update`, `Opportunity.StatusChanged`, `INSTALL`, `UNINSTALL` |
| Scopes | `contacts.readonly`, `conversations.readonly`, `conversations/message.readonly`, `calendars.readonly`, `calendars/events.readonly`, `opportunities.readonly`, `users.readonly`, `locations.readonly`, plus `contacts.write` (for disposition sync) |

### 3.2 Environment variables

Add to Vercel + Convex:

```
GHL_CLIENT_ID                  = <from GHL dev console>
GHL_CLIENT_SECRET              = <from GHL dev console>  (Convex only, not exposed)
GHL_WEBHOOK_PUBLIC_KEY         = <Ed25519 public key from GHL>
NEXT_PUBLIC_GHL_CLIENT_ID      = same as GHL_CLIENT_ID  (used by install button)
NEXT_PUBLIC_GHL_REDIRECT_URI   = https://sequ3nce.ai/api/ghl-marketplace/oauth/callback
```

### 3.3 OAuth install URL construction

Mirror the Slack precedent (`apps/web/src/app/dashboard/settings/page.tsx:~1325`):

```ts
const ghlAuthUrl = new URL("https://marketplace.gohighlevel.com/oauth/chooselocation");
ghlAuthUrl.searchParams.set("response_type", "code");
ghlAuthUrl.searchParams.set("client_id", process.env.NEXT_PUBLIC_GHL_CLIENT_ID!);
ghlAuthUrl.searchParams.set("redirect_uri", process.env.NEXT_PUBLIC_GHL_REDIRECT_URI!);
ghlAuthUrl.searchParams.set("scope", SCOPES.join(" "));
ghlAuthUrl.searchParams.set("state", team._id); // teamId, recovered at callback
```

State = `teamId` (same pattern as Slack). The callback handler uses this to associate tokens with the right team without needing the user to be logged in mid-flow (they redirect from GHL → us → back to dashboard).

---

## 4. Data model — Convex schema additions

All new tables follow the codebase conventions:
- camelCase table names (matching newer B2B tables like `calendarEvents`).
- `v.optional` on every field that can be empty post-creation.
- Indexes named `by_<field>` or `by_<field1>_and_<field2>`.
- Timestamps stored as `v.number()` (Unix ms).
- Additive only — no edits to existing tables except adding optional fields to `teams`.

### 4.1 `setterGhlInstallations` — OAuth tokens per team

```ts
setterGhlInstallations: defineTable({
  teamId: v.id("teams"),
  // GHL identifiers
  locationId: v.string(),         // sub-account ID
  locationName: v.optional(v.string()),
  companyId: v.optional(v.string()),
  // OAuth tokens (encrypted via lib/encrypt.ts — same as ghlApiKey)
  accessToken: v.string(),         // encrypted
  refreshToken: v.string(),        // encrypted
  expiresAt: v.number(),           // Unix ms — when the access token expires
  // Scopes granted by user (to detect re-install with different scopes)
  scopes: v.array(v.string()),
  // Lifecycle
  installedAt: v.number(),
  lastRefreshedAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  status: v.union(
    v.literal("active"),
    v.literal("error"),
    v.literal("uninstalled")
  ),
  errorMessage: v.optional(v.string()),
  errorAt: v.optional(v.number()),
  // Two-phase backfill progress tracking. Fast phase (last 90 days) runs
  // synchronously on install. Deep phase extends backward month-by-month
  // up to 12 months total via a background cron — gives new customers a
  // year of historical context within 24-48h of install without blocking
  // the initial install experience.
  fastBackfillCompletedAt: v.optional(v.number()),
  deepBackfillLastCompletedMonth: v.optional(v.number()),  // 0 = unstarted, 3 = months 0-3 (90d) done, 12 = full year done
  deepBackfillCompletedAt: v.optional(v.number()),
  deepBackfillError: v.optional(v.string()),
})
  .index("by_team", ["teamId"])
  .index("by_location", ["locationId"])
  .index("by_team_and_status", ["teamId", "status"])
  .index("by_deepBackfillCompletedAt", ["deepBackfillCompletedAt"])  // for the extender cron to find pending work
```

### 4.2 `setterReps` — synced GHL users (sub-account members)

```ts
setterReps: defineTable({
  teamId: v.id("teams"),
  ghlUserId: v.string(),
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  ghlRole: v.optional(v.string()),
  isActive: v.boolean(),           // false if removed from GHL after sync
  lastSeenInSyncAt: v.number(),    // for staleness detection
})
  .index("by_team", ["teamId"])
  .index("by_team_and_ghlUserId", ["teamId", "ghlUserId"])
```

### 4.3 `setterLeads` — synced GHL contacts

```ts
setterLeads: defineTable({
  teamId: v.id("teams"),
  ghlContactId: v.string(),
  // Identity
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  // GHL metadata
  dateAdded: v.number(),           // Unix ms — from GHL, NOT our receipt time
  source: v.optional(v.string()),
  sourceDetail: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  assignedToGhlUserId: v.optional(v.string()),
  assignedToName: v.optional(v.string()),
  // Computed snapshots (rebuilt from setterLeadEvents on change)
  dialCount: v.number(),
  firstDialAt: v.optional(v.number()),
  lastDialAt: v.optional(v.number()),
  smsOutboundCount: v.number(),
  smsInboundCount: v.number(),
  smsStatus: v.union(
    v.literal("none"),
    v.literal("sent"),       // outbound sent, no inbound yet
    v.literal("replied")     // inbound after outbound
  ),
  isConnected: v.boolean(),        // any call >= connection threshold seconds
  connectedAt: v.optional(v.number()),
  connectedCallDurationSec: v.optional(v.number()),
  appointmentCount: v.number(),    // via setterAppointments
  showedCount: v.number(),
  noShowCount: v.number(),
  // Bookkeeping
  lastActivityAt: v.optional(v.number()),
  lastSyncedAt: v.number(),
})
  .index("by_team", ["teamId"])
  .index("by_team_and_assigned", ["teamId", "assignedToGhlUserId"])
  .index("by_team_and_connected", ["teamId", "isConnected"])
  .index("by_team_and_dateAdded", ["teamId", "dateAdded"])
  .index("by_team_and_ghlContactId", ["teamId", "ghlContactId"])
  .index("by_team_and_lastActivity", ["teamId", "lastActivityAt"])
```

**Rationale for snapshot fields alongside the event log:** v1 dashboard reads are dominated by table queries ("show me all unconnected leads") and aggregate stats ("avg speed to lead"). Recomputing from events on every read would be expensive. Snapshots are the read model; events are the source of truth. On every event-driven change, the mutation that inserts the event also patches the snapshot fields on the lead.

### 4.4 `setterLeadEvents` — append-only event log (Tier 2)

```ts
setterLeadEvents: defineTable({
  teamId: v.id("teams"),
  ghlContactId: v.string(),
  setterLeadId: v.optional(v.id("setterLeads")),  // denormalized for speed; null until lead row exists
  eventType: v.union(
    v.literal("dial_outbound"),
    v.literal("call_inbound"),
    v.literal("sms_outbound"),
    v.literal("sms_inbound"),
    v.literal("connected"),                       // first call >= threshold
    v.literal("appointment_booked"),
    v.literal("appointment_status_change"),
    v.literal("opportunity_stage_change"),
    v.literal("contact_assigned")
  ),
  occurredAt: v.number(),                          // GHL timestamp, NOT our receipt
  ghlUserId: v.optional(v.string()),               // who performed the action (setter)
  // Polymorphic detail bag — small, indexed by type
  details: v.optional(v.any()),                    // e.g., { callDurationSec, fromStageId, toStageId, status, messageId, conversationId }
  // Idempotency: GHL message/event id where applicable
  ghlEventKey: v.optional(v.string()),             // unique key for dedup
})
  .index("by_team_and_contact", ["teamId", "ghlContactId"])
  .index("by_team_and_type_and_time", ["teamId", "eventType", "occurredAt"])
  .index("by_team_and_setter_and_time", ["teamId", "ghlUserId", "occurredAt"])
  .index("by_ghlEventKey", ["ghlEventKey"])        // idempotency lookup
```

### 4.5 `setterAppointments` — bookings + show rate (Tier 1)

```ts
setterAppointments: defineTable({
  teamId: v.id("teams"),
  ghlAppointmentId: v.string(),
  ghlContactId: v.string(),
  ghlCalendarId: v.optional(v.string()),
  bookedByGhlUserId: v.optional(v.string()),       // setter
  assignedToGhlUserId: v.optional(v.string()),     // who runs the call (closer in GHL terms)
  startTime: v.number(),
  endTime: v.optional(v.number()),
  // GHL appointment statuses — verbatim
  status: v.union(
    v.literal("Confirmed"),
    v.literal("Showed"),
    v.literal("No Show"),
    v.literal("Cancelled"),
    v.literal("Invalid"),
    v.literal("Unconfirmed")
  ),
  bookedAt: v.number(),
  lastUpdatedAt: v.number(),
})
  .index("by_team", ["teamId"])
  .index("by_team_and_setter", ["teamId", "bookedByGhlUserId"])
  .index("by_team_and_status", ["teamId", "status"])
  .index("by_team_and_contact", ["teamId", "ghlContactId"])
  .index("by_team_and_startTime", ["teamId", "startTime"])
```

### 4.6 `setterOpportunities` — pipeline opportunities (Tier 2)

```ts
setterOpportunities: defineTable({
  teamId: v.id("teams"),
  ghlOpportunityId: v.string(),
  ghlContactId: v.string(),
  ghlPipelineId: v.string(),
  ghlStageId: v.string(),
  status: v.string(),              // open / won / lost / abandoned
  monetaryValue: v.optional(v.number()),
  assignedToGhlUserId: v.optional(v.string()),
  source: v.optional(v.string()),
  dateAdded: v.number(),
  lastUpdatedAt: v.number(),
})
  .index("by_team", ["teamId"])
  .index("by_team_and_pipeline", ["teamId", "ghlPipelineId"])
  .index("by_team_and_setter", ["teamId", "assignedToGhlUserId"])
  .index("by_team_and_contact", ["teamId", "ghlContactId"])
  .index("by_team_and_stage", ["teamId", "ghlStageId"])
```

### 4.7 `setterStageTransitions` — append-only stage history (Tier 2)

GHL doesn't expose a stage-history endpoint, so we build our own from `Opportunity.Update` webhooks.

```ts
setterStageTransitions: defineTable({
  teamId: v.id("teams"),
  ghlOpportunityId: v.string(),
  ghlContactId: v.string(),
  fromStageId: v.optional(v.string()),         // null on creation
  toStageId: v.string(),
  ghlPipelineId: v.string(),
  transitionedAt: v.number(),
  durationInPreviousStageSec: v.optional(v.number()),
  triggeredByGhlUserId: v.optional(v.string()),
})
  .index("by_team_and_opportunity", ["teamId", "ghlOpportunityId"])
  .index("by_team_and_pipeline_and_to_stage_and_time", ["teamId", "ghlPipelineId", "toStageId", "transitionedAt"])
```

### 4.8 `setterPipelines` — cached pipeline metadata

Pipeline names + stages change rarely; cache via REST sync.

```ts
setterPipelines: defineTable({
  teamId: v.id("teams"),
  ghlPipelineId: v.string(),
  name: v.string(),
  stages: v.array(v.object({
    ghlStageId: v.string(),
    name: v.string(),
    position: v.number(),
  })),
  lastSyncedAt: v.number(),
})
  .index("by_team", ["teamId"])
  .index("by_team_and_pipelineId", ["teamId", "ghlPipelineId"])
```

### 4.9 `setterWebhookEvents` — raw audit log (debug + replay)

For the first 30 days post-launch we keep raw payloads to replay on bugs.

```ts
setterWebhookEvents: defineTable({
  teamId: v.optional(v.id("teams")),    // null if we couldn't resolve before processing
  locationId: v.string(),
  ghlEventId: v.optional(v.string()),
  receivedAt: v.number(),
  eventType: v.string(),
  signatureValid: v.boolean(),
  processed: v.boolean(),
  processingError: v.optional(v.string()),
  processingDurationMs: v.optional(v.number()),
  payload: v.any(),                      // full body
})
  .index("by_received_at", ["receivedAt"])
  .index("by_team_and_received_at", ["teamId", "receivedAt"])
  .index("by_processed", ["processed"])
```

A daily cron prunes rows older than 30 days.

### 4.10 Additions to existing `teams` table

Additive only:

```ts
// Inside teams table:
setterDataEnabled: v.optional(v.boolean()),                    // master toggle
setterConnectionThresholdSec: v.optional(v.number()),          // default 60
setterDailyScorecardEnabled: v.optional(v.boolean()),
setterDailyScorecardChannel: v.optional(v.string()),           // "slack" or "discord"
setterDailyScorecardSlackChannelId: v.optional(v.string()),    // resolved slack channel id
setterDailyScorecardDiscordWebhookUrl: v.optional(v.string()),
setterDailyScorecardHourLocal: v.optional(v.number()),         // 0–23
setterUntouchedAlertEnabled: v.optional(v.boolean()),
setterUntouchedAlertThresholdMinutes: v.optional(v.number()),  // default 5
setterUntouchedAlertChannel: v.optional(v.string()),
setterUntouchedAlertSlackChannelId: v.optional(v.string()),
setterUntouchedAlertDiscordWebhookUrl: v.optional(v.string()),
setterDispositionSyncEnabled: v.optional(v.boolean()),         // the rebuilt old feature
```

### 4.11 Additions to `slackNotifications` (existing dedup table)

Add three new types to the union (no schema change required since `type` is `v.string()`, just enforced in code):

- `"setter_daily_scorecard"` — keyed by `teamId + YYYY-MM-DD`
- `"setter_untouched_alert"` — keyed by `teamId + ghlContactId + date-bucket-15min`
- `"setter_speed_to_lead_summary"` — keyed by `teamId + YYYY-MM-DD-HH` (hourly summaries if enabled)

The dedup key column on the existing table is `callId`; we'll repurpose it as `dedupKey: v.optional(v.string())` (additive optional field) and use it for setter-related notifications. This avoids creating a parallel dedup table.

---

## 5. OAuth flow & token management

### 5.1 Connect (install) flow

1. Manager clicks **"Connect GoHighLevel"** in Settings tab.
2. Frontend redirects to `https://marketplace.gohighlevel.com/oauth/chooselocation?...&state=<teamId>`.
3. User picks a location and approves scopes.
4. GHL redirects back to `https://sequ3nce.ai/api/ghl-marketplace/oauth/callback?code=X&state=<teamId>&locationId=Y&companyId=Z`.
5. Next.js route handler validates `state` is a valid teamId, then calls Convex action `setterGhlOauth.exchangeCodeForTokens`.
6. The action POSTs to `https://services.leadconnectorhq.com/oauth/token` with `client_id`, `client_secret`, `code`, `grant_type=authorization_code`, `user_type=Location`.
7. Response: `access_token`, `refresh_token`, `expires_in`, `userType`, `companyId`, `locationId`.
8. Action encrypts tokens, upserts row in `setterGhlInstallations` (key on teamId — one install per team; replacing tokens on re-install).
9. Action schedules `setterGhlSync.initialBackfill` via `ctx.scheduler.runAfter(0, ...)`.
10. Action returns success → route handler redirects to `/dashboard/setter-data?connected=1`.

### 5.2 Token refresh

Access tokens expire in 24h. Strategy:

- **Lazy refresh on 401:** every fetch wrapper checks for 401, calls `setterGhlOauth.refreshAccessToken`, retries once. Same pattern as `apps/web/convex/ghlActions.ts:31-45`.
- **Proactive refresh in cron:** an hourly cron scans for installations with `expiresAt < now + 1h` and refreshes pre-emptively. Avoids in-flight failures.
- **Update `lastRefreshedAt`** every time, so we can detect stuck refresh chains.

```ts
// Pseudo-signature
internal.setterGhlOauth.refreshAccessToken({ installationId })
  → POSTs grant_type=refresh_token
  → on success: patch installation { accessToken, refreshToken, expiresAt, lastRefreshedAt }
  → on failure: patch installation { status: "error", errorMessage, errorAt }
                + post one-time alert to org admin
```

### 5.3 Disconnect flow

1. Manager clicks **"Disconnect"** in Settings.
2. Mutation deletes the `setterGhlInstallations` row.
3. We do **not** delete `setterLeads`, `setterReps`, etc. — preserve historical data so reports remain valid; mark with `setterDataEnabled = false` flag at the team level.
4. Optionally: POST to GHL `/oauth/uninstall` to invalidate the token server-side. Currently undocumented but worth attempting.
5. UI flips back to "not connected" state.

### 5.4 UNINSTALL webhook

If the customer uninstalls from GHL's side, we receive an `UNINSTALL` event. Same handling as manual disconnect (delete installation row, preserve data).

---

## 6. Webhook handler

### 6.1 Route

Following the Recall.ai precedent (`http.ts:3328-3330`):

```ts
http.route({
  path: "/webhooks/ghl-marketplace",
  method: "POST",
  handler: httpAction(async (ctx, request) => { ... }),
});
```

### 6.2 Signature verification (Ed25519)

GHL signs webhook bodies with Ed25519. The signature is in `X-GHL-Signature`. We verify using GHL's published public key (env var `GHL_WEBHOOK_PUBLIC_KEY`). Must run **before** parsing JSON for application logic.

Implementation: use Node's built-in `crypto.verify` (Convex actions have full Node API). The `@gohighlevel/api-client` SDK exposes `webhooks.verifyEd25519Signature` — we'll inline the same logic to avoid adding the SDK as a dep just for one helper.

```ts
import { createPublicKey, verify as cryptoVerify } from "node:crypto";

function verifyGhlWebhook(rawBody: string, signature: string): boolean {
  try {
    const publicKey = createPublicKey({
      key: process.env.GHL_WEBHOOK_PUBLIC_KEY!,
      format: "pem",
    });
    return cryptoVerify(
      null,
      Buffer.from(rawBody),
      publicKey,
      Buffer.from(signature, "base64")
    );
  } catch {
    return false;
  }
}
```

**Failure mode:** any failed verification → return 401 immediately, log to `setterWebhookEvents` with `signatureValid: false` for forensic review. Never process unverified events.

### 6.3 Fast-ack pattern

Mirror the Recall handler:

1. Read raw body as text (so signature verification sees byte-identical payload).
2. Verify signature → 401 if bad.
3. Parse JSON.
4. Insert audit row in `setterWebhookEvents` (processed=false).
5. Schedule internal mutation via `ctx.scheduler.runAfter(0, internal.setterGhlWebhooks.dispatch, { auditId, body })`.
6. Return 200 immediately.

Total handler runtime budget: under 500ms for any single event (signature verification is fast, audit insert is one row).

### 6.4 Event dispatch

Internal mutation `setterGhlWebhooks.dispatch` runs after the 200 ack:

```ts
internal mutation dispatch({ auditId, body }):
  switch (body.type) {
    case "INSTALL":               → handleInstall(body)
    case "UNINSTALL":             → handleUninstall(body)
    case "Contact.Create":        → upsertLead(body)
    case "Contact.Update":        → upsertLead(body)
    case "OutboundMessage":
      if (body.messageType === "CALL")  → recordOutboundCall(body)
      if (body.messageType === "SMS")   → recordOutboundSms(body)
    case "InboundMessage":
      if (body.messageType === "CALL")  → recordInboundCall(body)
      if (body.messageType === "SMS")   → recordInboundSms(body)
    case "Appointment.Create":    → insertAppointment(body)
    case "Appointment.Update":    → patchAppointment(body)  // status change → recompute show counts
    case "Opportunity.Create":    → insertOpportunity(body)
    case "Opportunity.Update":    → patchOpportunity(body) + maybe insertStageTransition
    default:                      → patchAudit({ processed: true, processingError: "unhandled type" })
  }
  patchAudit({ processed: true, processingDurationMs })
```

### 6.5 Idempotency

Every event handler is idempotent:

- **`upsertLead`:** look up by `(teamId, ghlContactId)` index. Patch if exists, insert if not. Snapshot fields (`dialCount`, etc.) are recomputed by event handlers, not by upserts.
- **Event log inserts:** check `ghlEventKey` (using `messageId` for messages, `appointmentId+lastUpdatedAt` for appointments) before inserting. Skip if duplicate.
- **Stage transitions:** unique key = `(opportunityId, fromStageId, toStageId, transitionedAt)`. Skip if matched.

This means a webhook redelivery (GHL retries on non-2xx) results in zero side effects on the second delivery.

---

## 7. Sync strategy

Three layers, in priority order:

### 7.1 Webhooks (real-time, primary)

Covers ~95% of data. Every relevant event type is subscribed at the app level. Customer onboarding doesn't require webhook configuration — it's installed once on our app.

### 7.2 Initial backfill (REST, on install) — two-phase

Backfill is split into a fast synchronous phase and a deep background phase. The fast phase gets the dashboard usable in 5–10 minutes; the deep phase fills in the rest of the year over the following 24–48 hours so customers eventually have ~12 months of pre-install history without blocking the install experience.

#### 7.2a Fast backfill (last 90 days)

Runs synchronously when the OAuth callback completes (or `INSTALL` fires — whichever first). Both trigger the same internal action.

```ts
internal action setterGhlSync.fastBackfill({ installationId }):
  1. Fetch /users/search → upsert setterReps
  2. Fetch /opportunities/pipelines → upsert setterPipelines
  3. Paginate /contacts/search (sort by dateAdded desc, last 90 days) → upsert setterLeads
  4. For each contact: paginate /conversations/search → /conversations/:id/messages
     → emit setterLeadEvents + recompute snapshot fields
  5. Paginate /calendars/events (last 90 days through next 60 days) → upsert setterAppointments
  6. Paginate /opportunities/search → upsert setterOpportunities + emit initial setterStageTransitions

  patch installation { fastBackfillCompletedAt: now, deepBackfillLastCompletedMonth: 3 }
```

Time: ~5–10 min for typical orgs (500–5,000 contacts). Dashboard becomes usable as soon as this completes.

#### 7.2b Deep backfill (months 4 → 12, background)

A cron extends history backward one month at a time until 12 months total are synced. Each pass is incremental and resumable.

```ts
crons.interval(
  "setter-deep-backfill-extender",
  { minutes: 30 },
  internal.setterGhlSync.deepBackfillStep
);

internal.setterGhlSync.deepBackfillStep:
  installations = setterGhlInstallations
    where status = "active"
      AND fastBackfillCompletedAt IS NOT NULL
      AND (deepBackfillLastCompletedMonth IS NULL OR deepBackfillLastCompletedMonth < 12)
      AND (deepBackfillError IS NULL)
    limit 5  // throttle: max 5 customers extending in parallel

  for each installation in parallel:
    nextMonth = (deepBackfillLastCompletedMonth ?? 3) + 1
    windowStart = now - nextMonth months
    windowEnd   = now - (nextMonth - 1) months

    try:
      paginate /contacts/search where dateAdded in [windowStart, windowEnd] → upsert setterLeads
      for each contact: fetch conversations + messages (only if lead is new to us)
      paginate /calendars/events in [windowStart, windowEnd] → upsert setterAppointments
      paginate /opportunities/search where dateAdded in [windowStart, windowEnd] → upsert setterOpportunities

      patch installation { deepBackfillLastCompletedMonth: nextMonth }

      if nextMonth === 12:
        patch installation { deepBackfillCompletedAt: now }
    catch err:
      patch installation { deepBackfillError: err.message }
      // surfaced in Settings UI; admin can retry from there
```

**Pagination** uses GHL's `meta.nextPageUrl` or page+pageSize params (varies by endpoint).

**Why month-by-month, not all-at-once:** keeps each cron tick small and safely under Convex's per-action time limits, lets us show "5 of 12 months synced" progress, makes failures recoverable (one bad month doesn't tank the whole job), and limits the per-customer API burn rate.

**Time to full backfill:** typical org completes 12 months in 6–24 hours. Largest orgs (>50k contacts/year) may take 2–3 days. Customer doesn't notice — dashboard is fully usable from minute 10.

**API quota math:** 12-month backfill for a typical org (~18k contacts) = ~50–60k API calls. Well under the 200k/day per-install quota. Spread across ~24 hours of 30-min ticks, daily quota usage is minimal.

**UI banner:** while `deepBackfillCompletedAt` is null, show a non-blocking banner above the KPI strip: "Extending history... 7 of 12 months synced. New historical leads will appear automatically." Banner disappears when complete.

**Rate limiting:** the backfill is the most quota-intensive phase. Implement a token-bucket throttle (max 8 req/sec) to stay safely below the 100 req/10s limit. If we hit 429, sleep for `X-RateLimit-Interval-Milliseconds` and retry.

**Progress reporting:** patch `setterGhlInstallations.lastSyncedAt` in stages so the UI can show backfill progress to the user ("Synced 1,200 of ~3,500 contacts...").

**Time budget:** backfilling 5,000 contacts with their conversations should complete in 5–10 min. Larger orgs (50k contacts) → up to ~1h. Acceptable for a one-time install.

### 7.3 Reconciliation (REST, hourly cron)

Webhooks can be missed (GHL retries 3x then gives up; network blips happen). An hourly reconciliation pass catches stragglers:

```ts
crons.interval(
  "setter-data-reconcile",
  { hours: 1 },
  internal.setterGhlSync.reconcile
);

internal.setterGhlSync.reconcile:
  for each active installation:
    - Fetch contacts updated in last 90 minutes (overlap by 30min for safety)
    - Diff against setterLeads.lastSyncedAt
    - Upsert any with newer GHL.dateUpdated
    - Same for appointments, opportunities (last 90 min window)
```

This is the safety net. Webhooks remain the primary path.

### 7.4 Manual refresh

The Settings tab has a "Refresh now" button that triggers `setterGhlSync.reconcile` for that team only. Useful when a customer suspects data drift.

---

## 8. Metrics — exact computation logic

All metrics are computed from the snapshot fields on `setterLeads` and the appointment/opportunity tables. Time-series metrics use `setterLeadEvents`.

### 8.1 Speed to lead

**Definition:** time elapsed from `setterLeads.dateAdded` to `setterLeads.firstDialAt`.

**Computation site:** stamped on `setterLeads` when the first `dial_outbound` event fires.

```ts
firstDialAt = ev.occurredAt  // first dial_outbound event for this lead
speedToLeadSec = (firstDialAt - dateAdded) / 1000
```

**Aggregates:**
- Org-wide avg, median, p90 over a date range — query `setterLeads` filtered by `dateAdded` range, where `firstDialAt IS NOT NULL`, average the diff.
- Per-setter avg — group by `assignedToGhlUserId`.
- Trend (chart on Overview tab) — daily buckets over last 14/30 days.

**Edge cases:**
- Lead has no `firstDialAt` yet → exclude from avg (don't treat as 0).
- Lead reassigned mid-funnel → speed-to-lead stays attributed to the rep at first dial (since that's who acted).
- Out-of-hours lead arrival → still counted; managers care. Working-hours heatmap separately surfaces the pattern.

### 8.2 Dial count

Snapshot field `setterLeads.dialCount`, incremented per `dial_outbound` event.

### 8.3 SMS status

Three-state derived from `setterLeads.smsOutboundCount` + `setterLeads.smsInboundCount` + ordering of last events:

- `none` → both counts = 0
- `sent` → outbound > 0, no inbound after the first outbound
- `replied` → inbound > 0 after the first outbound

Recomputed on every SMS event.

### 8.4 isConnected (and connectedAt + connectedCallDurationSec)

Set on the first `dial_outbound` event with `details.callDurationSec >= teams.setterConnectionThresholdSec` (default 60).

Once set, stays true even if subsequent calls are short.

### 8.5 Appointment count + show rate per setter

```ts
// Per setter, in date range:
totalBooked = count(setterAppointments where bookedByGhlUserId = X
                                       AND bookedAt in range)
totalShowed = count(...where status = "Showed")
totalNoShow = count(...where status = "No Show")
totalCancelled = count(...where status = "Cancelled")

showRate = totalShowed / (totalShowed + totalNoShow)  // exclude cancelled from denom
```

**Edge cases:**
- Appointment is in the future and still `Confirmed` → not counted as showed/no-show yet (excluded from rate calc).
- Appointment in the past still `Confirmed` after 6h grace → flagged as ambiguous in UI (bell icon, "stale appointment status — check GHL").
- Appointment status changes from `Showed` → `No Show` retroactively → recompute on `Appointment.Update` webhook.

### 8.6 Funnel conversion rates

Per setter, in date range:

```
dials = count(setterLeadEvents where eventType = "dial_outbound"
                                AND ghlUserId = X
                                AND occurredAt in range)
connects = count(setterLeads where dialCount > 0 AND isConnected = true
                              AND assignedToGhlUserId = X
                              AND firstDialAt in range)
appointments = count(setterAppointments where bookedByGhlUserId = X
                                         AND bookedAt in range)
showed = count(setterAppointments where bookedByGhlUserId = X
                                   AND status = "Showed"
                                   AND startTime in range)

dial_to_connect = connects / dials
connect_to_appt = appointments / connects
appt_to_show = showed / appointments
```

**Edge case:** denominator zero → display "—" not "Infinity%" or "0%".

### 8.7 Pipeline stage funnel + time-in-stage (Tier 2)

Built from `setterStageTransitions`:

```ts
For a given pipeline + date range:
  for each stage in pipeline:
    count = count(opportunities where current stageId = thisStageId)
    avgTimeInStage = avg(transition.durationInPreviousStageSec
                        where toStageId = thisStageId
                        AND transitionedAt in range)
```

Renders as a horizontal funnel chart with stage counts + median time-in-stage labels.

### 8.8 Source attribution (Tier 2)

```ts
group by setterLeads.source:
  total = count(*)
  connected = count(isConnected = true)
  appointments = count(having appointment in setterAppointments)
  closed_won = count(in setterOpportunities where status = "won")
  
  conversionRate = closed_won / total
```

Renders as a stacked bar or a sortable table.

### 8.9 Working-hours heatmap (Tier 2)

7×24 grid (day-of-week × hour-of-day) of `dial_outbound` event counts per setter (or team-wide).

```ts
for each event in setterLeadEvents where eventType = "dial_outbound" AND occurredAt in range:
  dow = dayOfWeek(event.occurredAt, team.timezone)
  hour = hourOfDay(event.occurredAt, team.timezone)
  heatmap[dow][hour] += 1
```

Renders as a colored grid; darker cell = more dials. Hover shows count + speed-to-lead avg for that bucket.

### 8.10 Daily scorecard

Sums the above for one day in one Slack/Discord message. See §9.

---

## 9. Notification system (reuse existing)

### 9.1 Reused infrastructure

- `apps/web/convex/slack.ts` → `sendSlackNotification` internal action
- `apps/web/convex/discord.ts` → `sendDiscordNotification` internal action
- `slackNotifications` table (with new `dedupKey` optional field) → dedup
- `team.slackNotificationChannels` and `team.discordNotificationChannels` → per-type routing

### 9.2 New notification types

```ts
// inside slack.ts validTypes / discord.ts validTypes:
"setter_daily_scorecard"
"setter_untouched_alert"
"setter_speed_to_lead_summary"  // optional, off by default
```

Same dedup table column = `dedupKey`. Examples:

- Daily scorecard: `${teamId}_scorecard_2026-05-06`
- Untouched alert: `${teamId}_untouched_${ghlContactId}_${roundedTo15min}`

### 9.3 Daily scorecard generation

Cron runs hourly (cheap) and only fires for teams whose `setterDailyScorecardHourLocal` matches the current hour in their `team.timezone`:

```ts
crons.interval(
  "setter-daily-scorecard",
  { minutes: 60 },
  internal.setterDataNotifications.runScorecards
);

internal.setterDataNotifications.runScorecards:
  for team in teams where setterDataEnabled = true AND setterDailyScorecardEnabled = true:
    nowInTeamTz = formatInTimeZone(Date.now(), team.timezone)
    if nowInTeamTz.hour === team.setterDailyScorecardHourLocal AND nowInTeamTz.minute < 60:
      dedupKey = `${team._id}_scorecard_${nowInTeamTz.dateString}`
      if not exists in slackNotifications:
        generateScorecard(team) → buildSlackBlocks() / buildDiscordEmbed()
        sendSlackNotification / sendDiscordNotification
        insert dedup row
```

**Scorecard content (yesterday's data):**

- Headline: "📊 Setter Scorecard — Tue May 5"
- Speed-to-lead: avg, median, p90 + delta vs prior 7-day avg
- Connections: count + rate
- Appointments booked + show rate
- Untouched leads count
- Per-setter top-3 + bottom-3 by speed-to-lead
- Funnel snapshot
- Link: "View full report → sequ3nce.ai/dashboard/setter-data"

**Empty data:** still send the message ("No setter activity yesterday — leaderboard resets today"). Consistent rhythm > silence.

### 9.4 Untouched-lead alert

Cron runs every 2 minutes:

```ts
crons.interval(
  "setter-untouched-alert-sweep",
  { minutes: 2 },
  internal.setterDataNotifications.runUntouchedSweep
);

internal.setterDataNotifications.runUntouchedSweep:
  for team in teams where setterUntouchedAlertEnabled = true:
    threshold = team.setterUntouchedAlertThresholdMinutes ?? 5
    cutoff = Date.now() - threshold * 60 * 1000
    leads = setterLeads where teamId = team
                          AND dialCount = 0
                          AND smsOutboundCount = 0
                          AND dateAdded < cutoff
                          AND lastActivityAt is null  // never touched at all
    for lead in leads:
      bucket = floor(now / (15 * 60 * 1000))  // 15-min dedup bucket
      dedupKey = `${team._id}_untouched_${lead.ghlContactId}_${bucket}`
      if not exists: send + insert dedup
```

**Why a 15-min dedup bucket** — alert once when crossed, then cool down for 15 min so you don't get spam every 2 minutes for the same lead. Re-alerts after 15 min if still untouched.

### 9.5 Test notification button

Settings tab "Test" button → fires a one-shot notification with sample data + adds prefix `[TEST]` to the message. Doesn't write to dedup table.

---

## 10. UI structure

Locked design: hybrid visual style, 4 tabs.

### 10.1 Tab 1: Overview (landing)

Layout (top-down):

1. **Header bar:** title, "Last sync: X min ago", date range picker (7d / 30d / custom), refresh button.
2. **KPI strip (4 cards):**
   - Speed to lead (avg) + delta vs prior period
   - Connections (count / total)
   - Untouched leads (current count, color-coded)
   - Show rate (%)
3. **Funnel chart:** dials → connects → appts → showed, horizontal bars with counts + percentages on each segment.
4. **Action queue:** small table of currently untouched leads (top 5), with "View all →" link to Leads tab pre-filtered.
5. **Source mix card:** small bar showing where leads came from in the period.

### 10.2 Tab 2: Leads

1. **Toggle:** Pre-Connection / Connected / All.
2. **Filters:** assigned rep dropdown, date range (inherited from header), status filter, search by name/email.
3. **Table columns:** Lead, Time in pipeline, Dials, SMS, Assigned, Status. Yellow row highlighting for untouched.
4. **Row click:** expand to show full activity timeline (event log for that contact).
5. **Export CSV** button.

### 10.3 Tab 3: Setters

1. **Leaderboard table:** Setter name, Speed to lead, Dials, Connections, Appointments, Show rate, Sortable columns.
2. **Click a row:** drilldown panel slides in with:
   - Per-setter funnel
   - Working-hours heatmap (their dials per hour)
   - Source mix (which sources convert best for them)
   - Trend sparklines (speed to lead over last 30 days)
3. **Export CSV** button.

### 10.4 Tab 4: Settings

Sections:

1. **GHL connection:** status badge, location info, "Disconnect" button OR "Install GoHighLevel App" button.
2. **Disposition Sync:** toggle + field mapping config (rebuilt clean from old `/dashboard/ghl-sync`).
3. **Daily Scorecard notifications:**
   - Channel: Slack / Discord radio
   - Slack channel picker (dropdown of authorized channels) OR Discord webhook URL input
   - Time of day: hour picker in team timezone
   - "Send test scorecard" button
4. **Untouched-lead alerts:**
   - Toggle (off by default)
   - Threshold: 5 / 10 / 15 / 30 min dropdown
   - Channel: same as scorecard
5. **Connection threshold:**
   - Slider/dropdown: 30 / 60 / 90 / 120 sec (default 60)
   - Helper text: "A call lasting this long counts as a 'connection.' Shorter calls are not counted."

### 10.5 Tab visibility + empty / loading / error states

**Tab is always visible** in the sidebar for any B2B admin user — discovery matters more than tidiness. The empty (unconnected) state is itself the primary install CTA.

- **Not connected (default for new customers):** entire tab body shows the `ConnectionGate` hero — "Connect your GoHighLevel account to track your team's setter activity. [Install GoHighLevel App →]". This is the discovery surface. First time a manager opens the tab, this is what guides them to install.
- **Connected but still backfilling:** banner at top "Initial sync in progress — 1,200 of 3,500 contacts synced. Reports will be live shortly." Disable filters that depend on full data.
- **Connection error:** red banner at top with last error message + "Reconnect" button. Tab remains usable on stale data.
- **No data in date range:** empty-state illustration + "No leads found for May 1–5. Try widening your date range."

The `setterDataEnabled` team flag still exists in the schema as an **admin override** — useful for emergencies (e.g., "hide Setter Data for customer X while we debug their install"). Default is `undefined`/`true` → tab shows. Only an explicit `false` hides it.

### 10.5a Visualization stack

- **Charts:** shadcn/ui `chart` component (recharts wrapper) — themed via existing CSS variables so colors match light/dark mode and brand accents automatically. Standard for the codebase since it already uses shadcn primitives. Used for funnel charts, sparklines, trend lines.
- **Heatmap (working hours grid):** custom HTML table + Tailwind opacity gradients. Not a chart, no library.
- **Tables:** existing `apps/web/src/components/ui/table.tsx` shadcn table component.
- **No new chart library beyond recharts.** Bundle cost ~80 KB.

### 10.6 Component file structure

```
apps/web/src/app/dashboard/setter-data/
├── page.tsx                         # tab router + layout
├── components/
│   ├── ConnectionGate.tsx           # gates the whole page until connected
│   ├── SetupRequiredHero.tsx        # the install CTA when not connected
│   ├── BackfillBanner.tsx
│   ├── ErrorBanner.tsx
│   ├── DateRangePicker.tsx
│   ├── overview/
│   │   ├── OverviewTab.tsx
│   │   ├── KpiStrip.tsx
│   │   ├── FunnelChart.tsx
│   │   ├── ActionQueue.tsx
│   │   └── SourceMixCard.tsx
│   ├── leads/
│   │   ├── LeadsTab.tsx
│   │   ├── LeadFilterBar.tsx
│   │   ├── LeadTable.tsx
│   │   └── LeadDrillPanel.tsx
│   ├── setters/
│   │   ├── SettersTab.tsx
│   │   ├── SetterLeaderboard.tsx
│   │   ├── SetterDrillPanel.tsx
│   │   ├── WorkingHoursHeatmap.tsx
│   │   └── SetterSparklines.tsx
│   └── settings/
│       ├── SettingsTab.tsx
│       ├── GhlConnectionCard.tsx
│       ├── DispositionSyncConfig.tsx
│       ├── ScorecardConfig.tsx
│       ├── UntouchedAlertConfig.tsx
│       └── ConnectionThresholdConfig.tsx
```

---

## 11. RBAC / permissions

- `setterDataEnabled` can only be toggled by `user.role === "admin"`.
- All `setterData.*` queries check `user.role === "admin"` (via `resolveAuthUser`) before returning data.
- The OAuth install flow itself requires admin role (the Install button is hidden for non-admins).
- Closers logging into the dashboard (rare but possible for some accounts) get a "You don't have access to this section" empty-state.

---

## 12. Edge cases & failure modes

### 12.1 OAuth + token

- **Re-install:** customer uninstalls and reinstalls. INSTALL webhook fires with new tokens. Upsert logic on `(teamId, locationId)` overwrites old tokens. Old data preserved.
- **User changes location during install:** `state` param ties the install to teamId, but `locationId` may differ between attempts. We accept whatever GHL sends — the latest install wins.
- **Refresh token expires (1y):** customer needs to reinstall. We surface a banner "Your GHL connection expired — please reinstall." Status = `error`.
- **Customer's GHL account loses scopes:** API returns 403 on certain endpoints. We catch, surface in Settings, and skip those data types in the next sync.

### 12.2 Webhook delivery

- **Webhook arrives before INSTALL completes:** Race possible if events fire faster than our INSTALL handler. We buffer un-routed events (no matching `setterGhlInstallations`) in `setterWebhookEvents` with `processed: false`. A short retry job re-dispatches after 5 sec.
- **Webhook redelivery (retry):** GHL retries on non-2xx. Idempotency via `ghlEventKey` prevents duplicate events.
- **Webhook from unknown locationId:** log + drop. Could be a leftover install or a mistake. Investigate manually.
- **Body too large to fit Convex args:** unlikely (events are small) but cap at 1MB and log a truncation warning.
- **Signature key rotation:** if GHL rotates their public key, we get many failed verifications. Surface as a global ops alert; update env var.

### 12.2a Backfill

- **Deep backfill stalls mid-stream** (e.g., GHL outage on month 7): we patch `deepBackfillError` and skip that installation on subsequent ticks. Settings UI shows the error + a "Resume backfill" button that clears the error so the next tick picks up where we left off.
- **Customer reinstalls before deep backfill completes:** new install action resets `deepBackfillLastCompletedMonth` and `deepBackfillCompletedAt`, restarting from month 0. Already-synced data isn't re-pulled (idempotent upserts), but the cron re-checks each month window.
- **Customer is on a brand-new GHL location with <90 days history:** fast backfill returns small amounts; deep backfill ticks through empty months quickly and completes early. UI shows "All available history synced (3 months)" instead of "12 of 12".
- **Deep backfill never completes for huge orgs (>50k contacts/year):** cron will keep extending day after day. Acceptable — banner stays up. If a customer hits 1 week without completion, surface a support ticket prompt.

### 12.3 Data integrity

- **Deleted contact in GHL:** we don't get `Contact.Delete` consistently. Instead, an absence in reconciliation pulls (the contact disappears from /contacts/search) flags the lead as `inactive`. We don't hard-delete; data is preserved for historical reports.
- **Contact merged in GHL:** if two contacts merge, one ID survives. The lost contactId's events become orphaned in our DB. Mitigated by reconciliation: we re-fetch any contact whose update time appears in newer payloads, even if missing locally.
- **Setter removed from GHL:** `setterReps.isActive = false`. Their historical metrics remain accessible; they fall off the leaderboard for current-period queries.
- **Pipeline stage renamed in GHL:** stage IDs are stable; we cache name in `setterPipelines` and refresh on next pipeline-list sync. Old transitions still reference the stage ID, so display continues to work after re-fetch.

### 12.4 Rate limiting

- **Hitting 100 req/10s:** token bucket throttles. If we still 429, sleep `X-RateLimit-Interval-Milliseconds` and retry. Retry once per request; if still failing, surface to UI and continue with next request.
- **Hitting 200k req/day:** unlikely for a single customer. Daily reconciliation is our biggest spend; cap to 10k contacts max and skip the rest with a one-time email warning to admin.

### 12.5 Time zone

- All event timestamps stored as Unix ms (UTC). All UI display uses team timezone (`team.timezone`).
- "Daily scorecard at 9am" interpreted as 9am in `team.timezone`. Hourly cron + zone-aware comparison.
- Speed-to-lead spans across midnight cleanly because we use absolute timestamps, not date strings.
- Browser timezone is **not** used — team timezone is the single source of truth.

### 12.6 Concurrency

- Two simultaneous webhook events for the same lead → both run as separate Convex mutations. Convex transactions guarantee atomicity per mutation; the snapshot field updates use `ctx.db.patch` which is last-writer-wins on individual fields. Acceptable for `dialCount` etc. since both increments are commutative if we read-then-add (we do).
- Scheduled sync running while webhook arrives: webhook updates win (snapshot fields), reconciliation only patches if its data is newer than `lastSyncedAt`.

### 12.7 Notification delivery

- **Slack channel deleted:** `sendSlackNotification` returns 404. We log error, surface in Settings UI, but keep retrying (admin may recreate the channel).
- **Discord webhook revoked:** same handling.
- **Daily scorecard sent twice (clock skew):** dedup via `dedupKey = teamId_scorecard_YYYY-MM-DD` prevents duplicates.
- **No data for scorecard window:** message still sent ("No activity yesterday"). Empty alerts (untouched-lead) are NOT sent.

### 12.8 UI

- **User clicks "Refresh" repeatedly:** debounced; subsequent clicks are no-ops within 30 sec.
- **Date range very wide (1y):** queries cap at 50k rows; UI shows "Showing latest 50,000 — narrow your range for full data."
- **Tab loaded mid-backfill:** show banner; allow viewing what's already synced; disable "Export" until complete.

---

## 13. Phased rollout

We can ship in three phases — each ships on its own.

### Phase 1: Foundation (ships v1.0)

- Marketplace App registered + private install link
- OAuth flow + token storage
- Webhook handler with Ed25519 verification
- INSTALL/UNINSTALL handling
- `Contact.Create/Update`, `Outbound/InboundMessage` (call + SMS)
- `setterLeads`, `setterReps`, `setterLeadEvents`, `setterGhlInstallations`, `setterWebhookEvents` tables
- Two-phase backfill (fast 90-day on install + deep 12-month extender cron) for contacts + conversations
- Hourly reconciliation
- "Extending history" banner in UI while deep backfill runs
- **Tab visible to all B2B admins** with `ConnectionGate` install hero as first-time empty state
- Tab 1 (Overview) + Tab 2 (Leads) + Tab 4 (Settings) — basic
- KPIs: speed-to-lead, dials, SMS status, connections, untouched count
- Daily Scorecard notification (Slack + Discord)
- **Hide legacy `/dashboard/ghl-sync` sidebar entry** (keep underlying disposition-sync code in place untouched; revisit in Phase 3)

**Estimated:** 2 weeks. Demoable, useful on its own.

### Phase 2: Setter view (ships v1.1)

- `setterAppointments` table + `Appointment.*` webhooks + backfill (both phases)
- Tab 3 (Setters) + per-setter drilldown
- Show rate metric
- Funnel rates (dial → connect → appt → show)
- Per-setter scorecard breakdown in daily Slack message
- Untouched-lead alerts (optional, off by default)

**Estimated:** 1 week.

### Phase 3: Pipeline depth (ships v1.2)

- `setterOpportunities`, `setterPipelines`, `setterStageTransitions` tables
- `Opportunity.*` webhooks + backfill
- Pipeline funnel chart on Overview
- Source attribution table on Setters drilldown
- Working-hours heatmap on Setters drilldown
- Disposition Sync rebuilt clean (folded into the same OAuth)

**Estimated:** 1 week.

Total: 3–4 weeks across phases. Each phase deploys independently behind no flag — just ships when ready.

---

## 14. Files to create / modify

### New backend files

| Path | Purpose |
|---|---|
| `apps/web/convex/setterGhlOauth.ts` | Token exchange, refresh, install action |
| `apps/web/convex/setterGhlWebhooks.ts` | Webhook event router + per-type handlers |
| `apps/web/convex/setterGhlSync.ts` | Initial backfill + hourly reconciliation |
| `apps/web/convex/setterGhlClient.ts` | Fetch wrapper with auth + rate limit + 401 retry |
| `apps/web/convex/setterData.ts` | UI queries (getOverview, getLeads, getSetters, etc.) |
| `apps/web/convex/setterDataMutations.ts` | Settings mutations (toggle features, disconnect, save config) |
| `apps/web/convex/setterDataMetrics.ts` | Pure functions: speed-to-lead aggregator, funnel calc, etc. |
| `apps/web/convex/setterDataNotifications.ts` | Daily scorecard + untouched alert generators + builders |
| `apps/web/src/app/api/ghl-marketplace/oauth/callback/route.ts` | Next.js OAuth redirect handler |

### New frontend files

| Path | Purpose |
|---|---|
| `apps/web/src/app/dashboard/setter-data/page.tsx` | Tab router |
| `apps/web/src/app/dashboard/setter-data/components/...` | All UI components (see §10.6) |

### Modified files

| Path | Change |
|---|---|
| `apps/web/convex/schema.ts` | Add 9 new tables + 11 optional fields on `teams` + optional `dedupKey` on `slackNotifications` |
| `apps/web/convex/http.ts` | Register `/webhooks/ghl-marketplace` route |
| `apps/web/convex/crons.ts` | Add reconcile (hourly), deep-backfill extender (every 30 min), scorecard sweep (hourly), untouched sweep (every 2 min), webhook audit prune (daily) |
| `apps/web/convex/slack.ts` | Add new notification types to `validTypes` array + builders for setter messages |
| `apps/web/convex/discord.ts` | Same as Slack: new types + builders |
| `apps/web/src/app/dashboard/layout.tsx` (or sidebar component) | Add "Setter Data" nav entry |
| `apps/web/src/app/dashboard/ghl-sync/page.tsx` | Replace with redirect to `/dashboard/setter-data?tab=settings` (or keep as legacy view with deprecation banner) |

### Environment variables

`apps/web/.env.local` + Vercel + Convex dashboard:

```
GHL_CLIENT_ID
GHL_CLIENT_SECRET
GHL_WEBHOOK_PUBLIC_KEY
NEXT_PUBLIC_GHL_CLIENT_ID
NEXT_PUBLIC_GHL_REDIRECT_URI
```

---

## 15. Open questions / decisions to revisit

These are decisions worth deferring or making with more data, not blockers for starting.

1. **Public Marketplace listing** — when we approach the 5-agency private cap, decide on Security Review timing. Affects nothing in the build itself.
2. **Setter ↔ Sequ3nce closer mapping** — confirmed deferred. Re-evaluate if a setter ever also closes (currently 1% per Tyler).
3. **Multi-location agencies** — current design assumes one location per team. If a customer manages multiple GHL locations under one Sequ3nce team, we'd need a `setterGhlInstallations` row per location and a location selector in the UI. Defer; flag if it happens.
4. **Long-term audit retention** — `setterWebhookEvents` pruned at 30 days. If support requires a 90-day window for replay, lift the cap.
5. **Hourly speed-to-lead summary** — we built this as an opt-in notification type but didn't surface it in v1 Settings UI. Add later if any customer asks.
6. **Recording playback** — Tier 3, deferred. When we add it, evaluate privacy + compliance (PII in transcript blobs).
7. **Lead source taxonomy** — GHL's `source` field is freeform. We may want a normalization layer (FB Ads / Google Ads / Organic / Referral / Other) for clean reports. Defer until a customer's source data shows real chaos.

---

## 16. Verification plan

Before shipping each phase:

1. **Static checks:** `cd apps/web && npx tsc --noEmit` — clean.
2. **Schema deploy:** `npx convex deploy --yes` — must succeed without breaking existing tables.
3. **OAuth happy path (Phase 1):**
   - Install via dev marketplace listing into a test GHL sub-account
   - Confirm INSTALL webhook fires + tokens stored
   - Confirm initial backfill completes within 10 min for a test account with ~500 contacts
   - Confirm UI shows live data
4. **Webhook signature verification:** send a deliberately-invalid signature → confirm 401 + `setterWebhookEvents.signatureValid = false`.
5. **Idempotency:** replay the same `Outbound/InboundMessage` event twice → confirm only one `setterLeadEvents` row inserted (verified by `ghlEventKey` index).
6. **Daily scorecard:** trigger via internal mutation with `setterDailyScorecardHourLocal` set to current hour → confirm Slack message arrives with correct content.
7. **Untouched-lead alert:** create a test contact in GHL with no calls → wait 5 min → confirm Slack alert arrives.
8. **Disconnect:** click Disconnect → confirm tokens deleted, data preserved, banner shows.
9. **Token refresh:** force-expire `expiresAt` on a test installation → trigger any sync → confirm 401 → refresh → retry → success.
10. **RBAC:** log in as non-admin → confirm Setter Data tab is hidden / denied.

---

## 17. Risks summary

| Risk | Severity | Mitigation |
|---|---|---|
| GHL Marketplace approval delays (when we go past 5 agencies) | Medium | Apply early; have private install fallback |
| Webhook signature key rotation breaks all events | High | Monitor failed-verification rate; alert on spike |
| Token refresh chain stalls (refresh token rejected) | Medium | Hourly proactive refresh; ops alert on failures |
| Large-org backfill > 1h | Low | Incremental progress UI; resumable; non-blocking |
| GHL API outage | Medium | Webhooks queue; reconciliation catches up; UI shows last-sync banner |
| Unhandled webhook event types (new GHL events we didn't subscribe to) | Low | Audit log captures everything; default switch case logs |
| Webhook handler DoS (replay attack) | Medium | Signature verification first; idempotency via ghlEventKey |
| Schema bloat (millions of `setterLeadEvents` rows) | Low | Indexed; pagination on reads; archive cron at 1y if needed |

---

## 18. Quick start (for the engineer implementing this)

1. Create the Marketplace App in GHL dev console (private distribution, sub-account install, all required scopes, webhook URL pointing at staging Convex first).
2. Add env vars to Convex prod + Vercel.
3. Phase 1 backend: `setterGhlOauth.ts` + `setterGhlWebhooks.ts` + schema additions + http route + initial backfill action.
4. Phase 1 frontend: install button on Settings tab + Connection Gate + basic Overview KPI cards.
5. Test install → see data flow end-to-end.
6. Iterate: add metrics one at a time, each testable in isolation.
7. Phase 2: appointments. Phase 3: opportunities + heatmap.

The implementation can follow this plan task-by-task; each section above maps to a discrete unit of work with clear inputs and outputs.
