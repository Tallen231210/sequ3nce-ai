import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Teams (companies using the platform)
  teams: defineTable({
    /**
     * Which product this team bought.
     *
     * "bot" (or unset) is the full product we've always sold — our meeting bot
     * joins the call and captures ammo live. "fathom" is the bring-your-own-
     * recording tier: we never join, so anything that depends on us being in
     * the room isn't part of what they're paying for and shouldn't be shown.
     *
     * Deliberately just a label. Pricing, Stripe products and upgrade paths
     * are a separate piece of work — this exists so features can be gated
     * honestly in the meantime rather than everyone seeing everything.
     */
    productTier: v.optional(v.string()),
    /**
     * A tier set by hand that Stripe must not overwrite.
     *
     * Normally the tier is derived from the price a team pays, and that's the
     * point — entitlement can't drift from billing. But two real cases have no
     * subscription to derive from, or a subscription that says the wrong
     * thing: comped teams (founders, partners), and internal accounts being
     * used to test a tier they aren't paying for.
     *
     * When this is set, the Stripe webhook leaves `productTier` alone. Without
     * it, a manually-set tier survives right up until the next invoice and
     * then silently reverts — which is worse than not supporting it at all,
     * because it looks like it worked.
     */
    productTierOverride: v.optional(v.string()),
    name: v.string(),
    stripeCustomerId: v.optional(v.string()),
    /**
     * The same two ids at Polar, while both processors coexist.
     *
     * Separate fields rather than reusing the Stripe ones: during the
     * changeover a team may legitimately have a live Stripe subscription and a
     * new Polar one, and overwriting would lose the ability to tell which is
     * actually billing them.
     */
    polarCustomerId: v.optional(v.string()),
    polarSubscriptionId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    plan: v.string(), // "active", "cancelled", "trialing", etc.
    subscriptionStatus: v.optional(v.string()), // "active", "past_due", "canceled", "unpaid", "trialing"
    // Comped team (founder/partner/friend) — subscriptionStatus is set to
    // "active" without a Stripe subscription. No stripeCustomerId, so Stripe
    // webhooks (which look up by customer id) never touch it. Marker lets us
    // exclude comped teams from revenue reporting.
    comped: v.optional(v.boolean()),
    currentPeriodEnd: v.optional(v.number()), // Unix timestamp of when current billing period ends
    seatCount: v.optional(v.number()), // Number of paid closer seats
    customAiPrompt: v.optional(v.string()), // Company-specific ammo extraction instructions
    createdAt: v.number(),
    // Settings
    timezone: v.optional(v.string()), // Team timezone (e.g., "America/New_York")
    customOutcomes: v.optional(v.array(v.string())), // Custom call outcome options
    customPlaybookCategories: v.optional(v.array(v.string())), // Custom playbook categories
    googleCalendarConnected: v.optional(v.boolean()), // Calendar integration status (future)
    // Calendly integration
    calendlyAccessToken: v.optional(v.string()), // Personal Access Token from Calendly
    calendlyUserUri: v.optional(v.string()), // Calendly user URI (e.g., "https://api.calendly.com/users/xxx")
    calendlyOrganizationUri: v.optional(v.string()), // Calendly organization URI
    calendlyWebhookId: v.optional(v.string()), // Webhook subscription ID for cleanup
    calendlyConnectedEmail: v.optional(v.string()), // Email of connected Calendly account
    calendlyLastSyncAt: v.optional(v.number()), // Last sync timestamp
    // Ammo V2 feature flag
    ammoV2Enabled: v.optional(v.boolean()), // Enable AI-powered real-time ammo analysis
    // Meeting Bot feature flag
    meetingBotEnabled: v.optional(v.boolean()), // Enable meeting bot auto-join via Meeting BaaS
    /**
     * Most bots auto-join may book for this team in a rolling day.
     *
     * Recording is billed by the hour, and auto-join's volume is set by the
     * customer's calendar rather than by us — a busy floor, or a calendar
     * misconfiguration that duplicates events, could run up a bill nobody sees
     * until the invoice. This is the backstop, not a budget: it should never be
     * reached in normal use, and reaching it is worth investigating.
     *
     * Unset means AUTO_JOIN_DEFAULT_DAILY_CAP in meetingBot.ts.
     */
    autoJoinDailyCap: v.optional(v.number()),

    // Compliance review. Off by default — it only does anything once the
    // business has written down what compliant means to them, and a score
    // judged against nothing would be worse than no score.
    complianceEnabled: v.optional(v.boolean()),
    /**
     * What's fine to say on a call and what isn't, in the customer's own words.
     *
     * Deliberately free text. The alternative — encoding actual FTC guidance
     * per industry — was tried and abandoned: it never finishes, and the
     * documents change constantly. A business describing its own rules in a
     * paragraph is both simpler and more accurate about what it actually cares
     * about.
     */
    complianceRules: v.optional(v.string()),
    /** Its own channel, and usually a private one — see the invite note below. */
    complianceSlackChannelId: v.optional(v.string()),
    complianceSlackChannelName: v.optional(v.string()),
    complianceDiscordWebhookUrl: v.optional(v.string()),
    complianceChannel: v.optional(v.string()), // "slack" | "discord"
    /** Stamped only after a test post succeeds, so a failure stays retryable. */
    complianceTestSentAt: v.optional(v.number()),
    /**
     * Call out calls whose post-call form was never filled in, on the
     * completed-call notification. Off unless a team asks for it.
     *
     * Only honest because that notification now waits five minutes. It fires
     * early the moment the closer submits, so a team whose closers are prompt
     * still gets the summary straight away — the wait only costs the calls
     * this flag is about.
     */
    flagMissingPostCallForm: v.optional(v.boolean()),
    // ---- End-of-day cash digest -------------------------------------------
    // Today, month to date, year to date, pace against the team's goal, and
    // who collected what. Same config shape as the collections digest.
    // Setter EOD notifications — the reminder blast (setter names + their
    // personal filing links, where the setters look) and the missing-report
    // (who hasn't filed, for the manager). Hour + days configurable from
    // the Setter EODs tab; delivery details via CLI.
    setterEodReminderEnabled: v.optional(v.boolean()),
    setterEodReminderHourLocal: v.optional(v.number()),
    setterEodReminderDays: v.optional(v.array(v.union(v.literal("Sun"), v.literal("Mon"), v.literal("Tue"), v.literal("Wed"), v.literal("Thu"), v.literal("Fri"), v.literal("Sat")))),
    setterEodReminderSlackChannelId: v.optional(v.string()),
    setterEodReminderSlackChannelName: v.optional(v.string()),
    setterEodMissingEnabled: v.optional(v.boolean()),
    setterEodMissingHourLocal: v.optional(v.number()),
    setterEodMissingDays: v.optional(v.array(v.union(v.literal("Sun"), v.literal("Mon"), v.literal("Tue"), v.literal("Wed"), v.literal("Thu"), v.literal("Fri"), v.literal("Sat")))),
    setterEodMissingSlackChannelId: v.optional(v.string()),
    setterEodMissingSlackChannelName: v.optional(v.string()),
    setterEodDiscordWebhookUrl: v.optional(v.string()),
    // Manager EOD digest — the recordings-only end-of-day report for
    // managers/owners. Same config shape as the cash digest; the two are
    // siblings, not replacements.
    managerEodEnabled: v.optional(v.boolean()),
    managerEodHourLocal: v.optional(v.number()),
    managerEodChannel: v.optional(v.union(v.literal("slack"), v.literal("discord"))),
    managerEodSlackChannelId: v.optional(v.string()),
    managerEodSlackChannelName: v.optional(v.string()),
    managerEodDiscordWebhookUrl: v.optional(v.string()),
    cashDigestEnabled: v.optional(v.boolean()),
    cashDigestCadence: v.optional(v.string()),        // "daily" | "weekly"
    cashDigestHourLocal: v.optional(v.number()),      // 0-23 in the team's zone
    cashDigestChannel: v.optional(v.string()),        // "slack" | "discord"
    cashDigestSlackChannelId: v.optional(v.string()),
    cashDigestSlackChannelName: v.optional(v.string()),
    cashDigestDiscordWebhookUrl: v.optional(v.string()),
    cashDigestTestSentAt: v.optional(v.number()),
    /** Include the per-closer board in the post. Defaults on. */
    cashDigestShowLeaderboard: v.optional(v.boolean()),
    /**
     * This team was created for whoever signed in, because we didn't recognise
     * them — not because anyone chose to start a company.
     *
     * Lets the subscribe page tell the two apart. A lapsed customer needs
     * pricing; someone who was meant to join a colleague's team needs to be
     * told that, and until now got pricing and concluded their company had been
     * cut off.
     */
    selfServeCreated: v.optional(v.boolean()),
    /**
     * Read the post-call numbers off the transcript instead of asking a closer.
     *
     * Per team and default OFF, because switching it on makes Collections
     * report MORE outstanding balances — the intended improvement, and also the
     * way this could chase a customer for money they already paid.
     */
    // Vestigial. Reading the call off the recording is simply how the product
    // works now — there is no switch and no way to opt out. Two teams still
    // carry `true` from the staged rollout; the field stays because removing it
    // would fail validation on those documents, and nothing reads it.
    aiExtractionEnabled: v.optional(v.boolean()),
    /**
     * Gate on the share links compliance alerts hand out. Empty means no gate.
     *
     * Stored as plaintext, deliberately, because the alert has to be able to
     * print it — the people reading these are not Sequ3nce users and have
     * nowhere else to look it up. It is not anyone's credential: it unlocks
     * recordings for one team and nothing else, and anyone who can read this
     * document can already read the calls it protects.
     *
     * One per team rather than one per call, so a reader learns it once and
     * their browser remembers it. Per-call passwords would mean typing a new
     * one every time for no benefit — if the password travels in the same
     * message as the link, it's the URL escaping alone that this stops, not
     * the message being forwarded.
     */
    compliancePassword: v.optional(v.string()),
    meetingBotName: v.optional(v.string()), // Configurable bot display name (what other participants see)
    /**
     * Display name for the MANAGER bot, separate from the closer bot's above.
     *
     * Both can legitimately be in the same meeting — a manager sitting in on a
     * closer's sales call — and two identically-named participants is the
     * moment someone kicks the wrong one out.
     */
    managerMeetingBotName: v.optional(v.string()),
    // Team type: "company" (B2B default) or "personal" (B2C workspace)
    type: v.optional(v.union(v.literal("company"), v.literal("personal"))),
    // Beta features array - for staged rollout of new features
    // e.g., ["liveStreaming", "aiCoaching", "advancedAnalytics"]
    betaFeatures: v.optional(v.array(v.string())),
    // Role Play Room - persistent video chat for team practice
    rolePlayRoom: v.optional(v.object({
      dailyRoomUrl: v.optional(v.string()), // Full Daily.co room URL
      dailyRoomName: v.optional(v.string()), // Room name (e.g., "team-abc123")
      participants: v.array(v.object({
        closerId: v.string(), // Closer ID as string (for serialization)
        userName: v.string(), // Display name in the room
        joinedAt: v.number(), // Unix timestamp when they joined
      })),
    })),
    // Slack integration for reinforcement requests
    slackWebhookUrl: v.optional(v.string()), // DEPRECATED: Slack incoming webhook URL (kept for migration)
    // Slack OAuth integration (new)
    slackAccessToken: v.optional(v.string()), // Bot token from OAuth
    slackChannelId: v.optional(v.string()), // LEGACY: Single channel ID (kept for backwards compatibility)
    slackChannelName: v.optional(v.string()), // LEGACY: Channel name for display
    slackTeamId: v.optional(v.string()), // Slack workspace ID
    slackTeamName: v.optional(v.string()), // Workspace name for display
    slackConnectedAt: v.optional(v.number()), // When connected
    // Per-notification channel configuration
    // Each notification type can be:
    //   - undefined = not configured yet (falls back to legacy slackChannelId)
    //   - { enabled: false } = explicitly disabled (don't send)
    //   - { enabled: true, channelId, channelName } = send to this channel
    slackNotificationChannels: v.optional(v.object({
      reinforcement: v.optional(v.object({
        enabled: v.boolean(),
        channelId: v.optional(v.string()),
        channelName: v.optional(v.string()),
      })),
      callStarted: v.optional(v.object({
        enabled: v.boolean(),
        channelId: v.optional(v.string()),
        channelName: v.optional(v.string()),
      })),
      callSummary: v.optional(v.object({
        enabled: v.boolean(),
        channelId: v.optional(v.string()),
        channelName: v.optional(v.string()),
      })),
      callGoingLong: v.optional(v.object({
        enabled: v.boolean(),
        channelId: v.optional(v.string()),
        channelName: v.optional(v.string()),
      })),
      callCompleted: v.optional(v.object({
        enabled: v.boolean(),
        channelId: v.optional(v.string()),
        channelName: v.optional(v.string()),
      })),
    })),
    // Discord webhook integration (simpler than Slack - one webhook URL per notification type)
    discordNotificationChannels: v.optional(v.object({
      reinforcement: v.optional(v.object({
        enabled: v.boolean(),
        webhookUrl: v.optional(v.string()),
        channelName: v.optional(v.string()), // Display only
      })),
      callStarted: v.optional(v.object({
        enabled: v.boolean(),
        webhookUrl: v.optional(v.string()),
        channelName: v.optional(v.string()),
      })),
      callSummary: v.optional(v.object({
        enabled: v.boolean(),
        webhookUrl: v.optional(v.string()),
        channelName: v.optional(v.string()),
      })),
      callGoingLong: v.optional(v.object({
        enabled: v.boolean(),
        webhookUrl: v.optional(v.string()),
        channelName: v.optional(v.string()),
      })),
      callCompleted: v.optional(v.object({
        enabled: v.boolean(),
        webhookUrl: v.optional(v.string()),
        channelName: v.optional(v.string()),
      })),
    })),
    discordConnectedAt: v.optional(v.number()),
    // Hyros ad attribution integration
    hyrosApiKey: v.optional(v.string()),
    hyrosEnabled: v.optional(v.boolean()),
    hyrosConnectedAt: v.optional(v.number()),
    // Hyros read direction (Phase 5) — shared-secret for verifying inbound
    // webhook signatures. Encrypted via lib/encrypt the same way hyrosApiKey is.
    hyrosWebhookSecret: v.optional(v.string()),
    hyrosWebhookConfiguredAt: v.optional(v.number()),
    // Meta Ads (Facebook) integration — Phase 1 spend ingestion.
    // Encrypted via lib/encrypt (same pattern as hyrosApiKey). Stores a
    // long-lived User Access Token with ads_read permission. The token
    // expires every 60 days; metaAdsTokenExpiresAt drives renewal prompts.
    metaAdsAccessToken: v.optional(v.string()),
    metaAdsAdAccountId: v.optional(v.string()),   // "act_XXXXXXX" format
    metaAdsConnectedAt: v.optional(v.number()),
    metaAdsTokenExpiresAt: v.optional(v.number()),
    metaAdsLastSyncedAt: v.optional(v.number()),
    metaAdsLastSyncError: v.optional(v.string()),
    // Phase 2 — Setter Scorecard team-level overlay config.
    // Per-offer overlay is a future Phase 4; for now one team = one config.
    // setterCadenceDefault: "A" (B2C, 12 dials/lead over 4 days) or
    //   "B" (B2B, 5-6 dials/lead). Drives cadence-adherence targets.
    // setter*Target: optional overrides for the playbook KPIs.
    setterCadenceDefault: v.optional(v.string()),       // "A" | "B"
    setterDialsPerDayTarget: v.optional(v.number()),    // default 150
    setterContactsPerDayTarget: v.optional(v.number()), // derived from cadence if absent
    setterSetRateTarget: v.optional(v.number()),        // 0..100 percentage
    // Override anchor for scorecard dollar leakage. When set, used as the
    // "avg deal value per close" multiplier instead of the computed avg.
    // Useful when closer-entered cashCollected / contractValue data is
    // patchy (some teams enter placeholders) but the manager knows the
    // typical deal economics. Used as the LARGER of (computed avg, this
    // override) so it never under-estimates.
    setterTypicalDealValue: v.optional(v.number()),
    // GoHighLevel CRM integration (legacy API-key flow — disposition sync)
    // Kept for backwards compatibility; the new Setter Data feature uses
    // OAuth tokens via setterGhlInstallations instead. Phase 3 will rebuild
    // disposition sync on top of OAuth and this field becomes obsolete.
    ghlApiKey: v.optional(v.string()),
    ghlEnabled: v.optional(v.boolean()),
    ghlConnectedAt: v.optional(v.number()),
    ghlLocationId: v.optional(v.string()),
    ghlCreateContacts: v.optional(v.boolean()),
    ghlAddNotes: v.optional(v.boolean()),

    // Setter Data feature — admin override flag (default unset = visible).
    // Set to false explicitly to hide the tab for a specific team (emergency
    // kill switch). The tab is otherwise always shown to B2B admins; the
    // ConnectionGate component handles the not-yet-installed state.
    setterDataEnabled: v.optional(v.boolean()),

    // "Connection" definition — a call lasting >= this many seconds counts
    // as a connect for show-rate / connection-rate metrics. Default 60.
    // Configurable per team because some sales orgs use 90 or 120.
    setterConnectionThresholdSec: v.optional(v.number()),

    // Set when the setterDailyStats rollup backfill (setterRollups.ts) has
    // completed for this team — the scorecard reads rollups only after this.
    setterRollupsBackfilledAt: v.optional(v.number()),

    // Daily Scorecard Slack/Discord notification config
    setterDailyScorecardEnabled: v.optional(v.boolean()),
    setterDailyScorecardChannel: v.optional(v.string()), // "slack" | "discord"
    setterDailyScorecardSlackChannelId: v.optional(v.string()),
    setterDailyScorecardSlackChannelName: v.optional(v.string()), // For picker round-trip + error copy
    setterDailyScorecardDiscordWebhookUrl: v.optional(v.string()),
    setterDailyScorecardHourLocal: v.optional(v.number()), // 0-23 in team.timezone

    // Team Performance daily scoreboard. Deliberately mirrors the setter
    // scorecard fields above: same shape, same semantics, same delivery
    // machinery — a manager who has configured one already understands this.
    closerDailyScorecardEnabled: v.optional(v.boolean()),
    closerDailyScorecardChannel: v.optional(v.string()), // "slack" | "discord"
    closerDailyScorecardSlackChannelId: v.optional(v.string()),
    closerDailyScorecardSlackChannelName: v.optional(v.string()),
    closerDailyScorecardDiscordWebhookUrl: v.optional(v.string()),
    closerDailyScorecardHourLocal: v.optional(v.number()), // 0-23 in team.timezone
    /**
     * Weekdays the post goes out, 0=Sun..6=Sat, in team.timezone. Undefined
     * means Mon-Fri. Teams work different weeks — some run Saturdays, some
     * don't want a Monday post about a dead Sunday — and picking days is a
     * better answer than the blanket "skip quiet days" rule alone.
     */
    closerDailyScorecardDays: v.optional(v.array(v.number())),
    /** Last manual "send test" — throttles repeat posts into a live channel. */
    closerDailyScorecardTestSentAt: v.optional(v.number()),

    /**
     * "Who hasn't filed their end-of-day" nudge. Same shape again.
     *
     * Separate from the scoreboard on purpose. The scoreboard only counts days
     * a closer submitted, so anyone who skips the form disappears from it
     * rather than showing a bad number — on a real Friday that meant one of
     * three closers appeared and nothing said the others were missing. This
     * names them, and stays silent when everyone has filed.
     */
    eodNudgeEnabled: v.optional(v.boolean()),
    eodNudgeChannel: v.optional(v.string()), // "slack" | "discord"
    eodNudgeSlackChannelId: v.optional(v.string()),
    eodNudgeSlackChannelName: v.optional(v.string()),
    eodNudgeDiscordWebhookUrl: v.optional(v.string()),
    eodNudgeHourLocal: v.optional(v.number()), // 0-23 in team.timezone
    eodNudgeDays: v.optional(v.array(v.number())), // 0=Sun..6=Sat; undefined = Mon-Fri
    eodNudgeTestSentAt: v.optional(v.number()),

    // Outstanding balances digest. Same six-field shape as the two scorecards
    // above, for the same reason: a manager who has configured one already
    // knows how to configure this.
    //
    // Its own channel on purpose. Collections is chased by whoever runs
    // customer success, not by the closers watching calls happen in the call
    // channel — two audiences, two jobs.
    collectionsDigestEnabled: v.optional(v.boolean()),
    collectionsDigestChannel: v.optional(v.string()), // "slack" | "discord"
    collectionsDigestSlackChannelId: v.optional(v.string()),
    collectionsDigestSlackChannelName: v.optional(v.string()),
    collectionsDigestDiscordWebhookUrl: v.optional(v.string()),
    collectionsDigestHourLocal: v.optional(v.number()), // 0-23 in team.timezone
    /**
     * "daily" (default) or "weekly" (Mondays only).
     *
     * Daily is tolerable only because the digest is silent when nothing is
     * owed, so it appears solely on days there is money to chase. Weekly exists
     * for teams that still find that too much.
     */
    collectionsDigestCadence: v.optional(v.string()),
    /** Last manual "send test" — throttles repeat posts into a live channel. */
    collectionsDigestTestSentAt: v.optional(v.number()),

    // Untouched-lead alert config (Phase 2). Off by default — some teams
    // love real-time alerts, some hate the noise. When enabled, the
    // sweep cron pings the configured channel any time a lead has been
    // sitting > thresholdMinutes with zero contact attempts.
    setterUntouchedAlertEnabled: v.optional(v.boolean()),
    setterUntouchedAlertThresholdMinutes: v.optional(v.number()), // default 5
    setterUntouchedAlertChannel: v.optional(v.string()), // "slack" | "discord"
    setterUntouchedAlertSlackChannelId: v.optional(v.string()),
    setterUntouchedAlertSlackChannelName: v.optional(v.string()), // For picker round-trip + error copy
    setterUntouchedAlertDiscordWebhookUrl: v.optional(v.string()),

    // Daily Uncontacted Leads digest. End-of-day rollup of every lead added
    // today (team-local) that still has zero contact attempts at report
    // time. Complementary to the real-time untouched alert — gives setters
    // a clean batch view to sweep through if they couldn't keep up with
    // pings during the day. Off by default. Default hour 17 (5pm local).
    setterUncontactedDigestEnabled: v.optional(v.boolean()),
    setterUncontactedDigestHourLocal: v.optional(v.number()), // 0-23 in team.timezone
    setterUncontactedDigestChannel: v.optional(v.string()), // "slack" | "discord"
    setterUncontactedDigestSlackChannelId: v.optional(v.string()),
    setterUncontactedDigestSlackChannelName: v.optional(v.string()),
    setterUncontactedDigestDiscordWebhookUrl: v.optional(v.string()),

    // Phase 3 — Disposition sync toggle. When true AND a setterGhlInstallations
    // row exists for this team, post-call disposition sync routes through the
    // new OAuth flow instead of the legacy ghlApiKey path. Off by default;
    // teams with no OAuth install fall through to legacy as before.
    setterDispositionSyncEnabled: v.optional(v.boolean()),

    // Dashboard Phase 1 — Per-lead speed-to-lead Slack/Discord ping config.
    // Fires the moment a setter dials a brand-new lead for the first time.
    // Off by default — opt-in per team.
    setterSpeedToLeadEnabled: v.optional(v.boolean()),
    setterSpeedToLeadChannel: v.optional(v.string()), // "slack" | "discord"
    setterSpeedToLeadSlackChannelId: v.optional(v.string()),
    setterSpeedToLeadSlackChannelName: v.optional(v.string()), // For picker round-trip + error copy
    setterSpeedToLeadDiscordWebhookUrl: v.optional(v.string()),
    // Speed above which the ping renders with ⚠️ (and 3× above renders 🚨).
    // Default 30 min if unset.
    setterSpeedToLeadSlowThresholdMs: v.optional(v.number()),

    // Dashboard Phase 3 — daily coverage-gap digest config. Surfaces hour
    // windows where leads arrived but didn't get dialed for an unusually
    // long time (≥3× the team's 30-day baseline median time-to-first-dial).
    // Sent next-morning at hourLocal (default 9). Off by default.
    // Dashboard Phase 4 — auto-detected booking flow type. Recomputed daily
    // by setter-booking-flow-detection cron. Customers can override in
    // Settings. The dashboard uses the override when set, otherwise the
    // detected value, otherwise "unknown" (treated as self_book for display).
    setterBookingFlowDetected: v.optional(
      v.union(
        v.literal("setter_drives"),
        v.literal("self_book"),
        v.literal("mixed"),
        v.literal("unknown"),
      ),
    ),
    setterBookingFlowDetectedAt: v.optional(v.number()),
    setterBookingFlowOverride: v.optional(
      v.union(
        v.literal("auto"),
        v.literal("setter_drives"),
        v.literal("self_book"),
        v.literal("mixed"),
      ),
    ),

    setterCoverageGapEnabled: v.optional(v.boolean()),
    setterCoverageGapChannel: v.optional(v.string()), // "slack" | "discord"
    setterCoverageGapSlackChannelId: v.optional(v.string()),
    setterCoverageGapSlackChannelName: v.optional(v.string()), // For picker round-trip + error copy
    setterCoverageGapDiscordWebhookUrl: v.optional(v.string()),
    setterCoverageGapHourLocal: v.optional(v.number()), // 0-23 in team.timezone, default 9
    setterCoverageGapMinLeadsThreshold: v.optional(v.number()), // default 3

    // ---- Team Performance Sheet (closer-side scoreboard) ----
    // Manager KPI targets, as PERCENTAGES (0-100). Rendered green/amber/red
    // via the same statusForDelta thresholds the setter scorecard uses.
    closerBookedPctTarget: v.optional(v.number()),      // default 70 — booked ÷ slots
    closerShowPctTarget: v.optional(v.number()),        // default 65 — taken ÷ booked
    closerOfferClosePctTarget: v.optional(v.number()),  // default 40 — closes ÷ offers
    closerClosePctTarget: v.optional(v.number()),       // default 25 — closes ÷ taken
    // Unit economics. Ad spend is monthly; weeks divide it evenly for now.
    closerAdSpendMonthly: v.optional(v.number()),
    closerCompPct: v.optional(v.number()),              // default 20 — rep commission %
    // Slot capacity. Slots are derived from each closer's calendar (open
    // working time ÷ typical call length + booked calls); these configure
    // the working window. Per-team defaults; closers may override.
    closerWorkdayStartMin: v.optional(v.number()),      // minutes from local midnight, default 540 (9am)
    closerWorkdayEndMin: v.optional(v.number()),        // default 1020 (5pm)
    closerWorkdays: v.optional(v.array(v.number())),    // 0=Sun..6=Sat, default [1,2,3,4,5]
    closerTypicalCallLengthMin: v.optional(v.number()),
    /**
     * Prospects this team books into a single time slot. Default 1.
     *
     * Teams that over-book to absorb no-shows have capacity that a 1:1 slot
     * model can't express — one live team books 2+ per slot deliberately, so
     * Booked% read like they'd filled 200% of their day. This describes the
     * POLICY (what we'll accept), not the outcome (what actually booked), so
     * a day where only some slots doubled is exactly what Booked% should be
     * measuring rather than a distortion of it.
     */
    closerBookingsPerSlot: v.optional(v.number()), // default 45; seeded from real avg duration
    // Team cash goal — defaults to the sum of per-closer goals; set here to
    // override with a stretch target.
    closerTeamCashGoalOverride: v.optional(v.number()),
    // Prize race (manager-set, purely motivational).
    closerPrizeName: v.optional(v.string()),
    closerPrizeEmoji: v.optional(v.string()),
    closerPrizeTarget: v.optional(v.number()),

    // Post-signup onboarding pack — drives welcome email idempotency,
    // dashboard banner visibility, and the /dashboard/onboarding checklist.
    // All optional + additive; null/undefined means "not yet" for each.
    welcomeEmailSentAt: v.optional(v.number()),
    onboardingBookedCallAt: v.optional(v.number()),
    onboardingBannerDismissedAt: v.optional(v.number()),
    onboardingCompletedAt: v.optional(v.number()),
  })
    .index("by_polar_customer", ["polarCustomerId"])
    .index("by_stripe_customer", ["stripeCustomerId"]),

  // Users (admins/managers who access the web dashboard)
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    teamId: v.id("teams"),
    role: v.string(), // "admin", "manager"
    createdAt: v.number(),

    // ---- Manager Mode: a manager's own calendar ----
    //
    // Managers had no calendar concept at all before this — every calendar and
    // bot field in the product hung off `closers`. All optional, so every
    // existing row still validates and nothing about managers changes until
    // one of them deliberately connects.
    googleCalendarRefreshToken: v.optional(v.string()),
    calendarProvider: v.optional(v.string()), // "google"
    calendarConnectedAt: v.optional(v.number()),
    calendarOnboardingCompleted: v.optional(v.boolean()),
    /**
     * Written `?? true` at connect time, never a bare true — a manager who
     * deliberately switched recording off and later reconnects must not be
     * silently switched back on. Same rule the closer toggle learned.
     */
    managerAutoJoinEnabled: v.optional(v.boolean()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_team", ["teamId"]),

  /**
   * An invitation for someone to join a team's web dashboard.
   *
   * Exists because there was no way to add a second manager at all. A `users`
   * row is only created by first sign-in — which mints a NEW team — or by our
   * own admin tooling, so 19 of 20 teams had exactly one dashboard user and a
   * co-founder signing up landed on an empty team and the subscribe page,
   * looking exactly like a billing lockout.
   *
   * A separate table rather than a `users` row with no `clerkId`: that field is
   * required and read as a string all over, and widening it would ripple. This
   * also keeps `users` meaning "someone who has actually signed in".
   *
   * The invite is only a RECORD TO MATCH AGAINST. The matching itself is the
   * verified-email path in `ensureUserTeam` that already existed for
   * reattaching recreated logins.
   */
  managerInvites: defineTable({
    teamId: v.id("teams"),
    /** Always lowercased — matching is case-insensitive. */
    email: v.string(),
    role: v.string(), // "admin" | "manager" — synonyms today, recorded for later
    invitedByUserId: v.id("users"),
    createdAt: v.number(),
    acceptedAt: v.optional(v.number()),
    acceptedUserId: v.optional(v.id("users")),
  })
    .index("by_email", ["email"])
    .index("by_team", ["teamId"]),

  // Closers (sales reps who use the desktop app)
  closers: defineTable({
    /**
     * Whether this closer wants the daily "calls need an outcome" email.
     *
     * Opt-IN, and absent means no. Nobody should receive mail from us because
     * a feature shipped — an unrequested daily email is the fastest way to
     * teach a whole team to filter everything we send, including the ones that
     * matter.
     */
    outcomeRemindersEnabled: v.optional(v.boolean()),
    /**
     * Send a bot to this closer's calendar meetings without being asked.
     *
     * Opt-IN, and absent means no. The feature is meant to end up on by
     * default, but a bot walking into a customer's sales calls is not
     * something to switch on for a whole floor at once — so the rollout is per
     * person, starting with someone who knows what the bot is.
     *
     * Also the long-term opt-out: a closer who doesn't want their calendar
     * recorded turns this off rather than removing a bot from every meeting.
     */
    autoJoinEnabled: v.optional(v.boolean()),
    email: v.string(),
    name: v.string(),
    teamId: v.id("teams"),
    status: v.string(), // "pending", "active", "deactivated"
    clerkId: v.optional(v.string()), // Set when they complete signup
    passwordHash: v.optional(v.string()), // Hashed password for desktop app login
    // Calendar integration via ICS feed
    icsUrl: v.optional(v.string()), // ICS feed URL from Google Calendar, Calendly, etc.
    calendarConnected: v.optional(v.boolean()), // Legacy field - kept for backward compatibility
    calendarConnectedAt: v.optional(v.number()), // When calendar was connected
    calendarLastSyncAt: v.optional(v.number()), // Last successful sync timestamp
    // Meeting Bot calendar OAuth integration
    googleCalendarRefreshToken: v.optional(v.string()), // Google Calendar OAuth refresh token
    microsoftCalendarRefreshToken: v.optional(v.string()), // Microsoft/Outlook OAuth refresh token
    calendarProvider: v.optional(v.string()), // "google" | "microsoft"
    meetingBaasCalendarId: v.optional(v.string()), // Meeting BaaS calendar integration ID
    calendarOnboardingCompleted: v.optional(v.boolean()), // Whether closer completed bot onboarding
    meetingPlatform: v.optional(v.string()), // "google_meet" | "zoom" | "microsoft_teams"
    // Zoom OAuth (mandatory for OBF compliance)
    zoomAccessToken: v.optional(v.string()), // Zoom OAuth access token
    zoomRefreshToken: v.optional(v.string()), // Zoom OAuth refresh token
    zoomConnectedAt: v.optional(v.number()), // When Zoom was connected
    // Phone number for B2B ↔ B2C identity matching
    phone: v.optional(v.string()),
    invitedAt: v.number(),
    activatedAt: v.optional(v.number()),
    lastLoginAt: v.optional(v.number()), // Track last desktop app login
    lastSeenAt: v.optional(v.number()), // Updated when desktop app polls for messages (for "last active" indicator)
    sharedMomentsSeenAt: v.optional(v.number()), // When closer last viewed "Shared with You"
    // Magic-link auth — closer sign-in via emailed 6-digit code (or
    // sequ3nce:// deep-link). Optional + additive; legacy password closers
    // still use passwordHash. See convex/closerMagicLink.ts for the flow.
    magicLinkCodeHash: v.optional(v.string()), // SHA-256 of latest 6-digit code
    magicLinkExpiresAt: v.optional(v.number()), // Unix ms, 15 min from issue
    magicLinkLastSentAt: v.optional(v.number()), // For 60s resend cooldown
    magicLinkFailedAttempts: v.optional(v.number()), // Lockout after N wrong codes
    // Picker token: issued by verifyCloserMagicLink when the verified
    // email maps to MULTIPLE closer records (closer works for multiple
    // Sequ3nce teams with the same email). Short-lived (2 min); the
    // closer redeems it via pickCloserTeam to sign into a specific team.
    magicLinkPickerTokenHash: v.optional(v.string()),
    magicLinkPickerExpiresAt: v.optional(v.number()),
    // The email on this closer's Fathom account, which they tell us once.
    // Fathom says who recorded a call; this is how we know which closer that
    // is. Kept separate from `email` because the two are often different —
    // a work login here, a personal Google account on Fathom.
    fathomEmail: v.optional(v.string()),
  })
    .index("by_team", ["teamId"])
    .index("by_email", ["email"])
    .index("by_clerk_id", ["clerkId"]),

  // Proof that a closer actually signed in.
  //
  // Without this, every closer request simply asserts "I am closer X" and the
  // backend believes it — so a closer could submit numbers as a teammate.
  // Login now issues a random token; we store only its hash and resolve the
  // closer FROM the session rather than from anything the client claims.
  //
  // A table rather than fields on `closers` so one closer can be signed in on
  // several devices at once and a single session can be revoked on sign-out.
  closerSessions: defineTable({
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    tokenHash: v.string(), // SHA-256 hex of the token; the raw token is never stored
    createdAt: v.number(),
    expiresAt: v.number(),
    lastUsedAt: v.number(),
    revokedAt: v.optional(v.number()), // set on sign-out; kept for auditability
    // Coarse client hint for support ("which browser was this?"). Never trusted.
    userAgent: v.optional(v.string()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_closer", ["closerId"]),

  // A connected Fathom account.
  //
  // Two shapes have to work, because customers differ and we can't make them
  // change: a company paying for Fathom Teams connects once and we see
  // everyone's calls, or each closer connects their own personal account.
  // `closerId` present means the latter. Same code path either way.
  fathomConnections: defineTable({
    teamId: v.id("teams"),
    /** Set when one closer connected their own account; absent for team-wide. */
    closerId: v.optional(v.id("closers")),
    apiKey: v.string(),
    /** Fathom's webhook id and signing secret, from when we registered it. */
    webhookId: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
    status: v.string(), // "active" | "error" | "disconnected"
    errorMessage: v.optional(v.string()),
    errorAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    /**
     * Fathom addresses we've received recordings for that match nobody here.
     *
     * The single likeliest way this integration disappoints someone: a closer
     * whose Fathom is a personal Gmail records every call, we can't tell whose
     * they are, and their manager sees an empty column with no explanation.
     * Kept on the connection so it can be shown and fixed rather than only
     * appearing in a log nobody reads.
     */
    unmatchedRecorders: v.optional(
      v.array(
        v.object({
          email: v.string(),
          count: v.number(),
          lastSeenAt: v.number(),
        }),
      ),
    ),
    /**
     * Fathom addresses we've been told are not closers, so stop reporting them.
     *
     * A key can see everything shared with its owner, which at a company
     * running support and sales in one Fathom workspace means a steady stream
     * of recordings that are nobody's sales calls. Without this the warning
     * above reappears every time that person records, and a permanent warning
     * is one people learn to ignore — including on the day it says something
     * that matters.
     *
     * Suppresses the NOTICE only. It never blocks ingestion: if one of these
     * addresses later belongs to a real closer, their calls match on the roster
     * and come in as normal. Ignoring is "stop telling me", not "block".
     */
    ignoredRecorders: v.optional(v.array(v.string())),
    createdAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_closer", ["closerId"]),

  // Calendar events (synced from closer ICS feeds or Google Calendar API)
  calendarEvents: defineTable({
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    uid: v.string(), // ICS UID or Google Calendar event ID for deduplication
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.number(), // Unix timestamp
    endTime: v.number(), // Unix timestamp
    location: v.optional(v.string()),
    isAllDay: v.optional(v.boolean()),
    /**
     * When the booking was made, from Google's `created` on the event.
     *
     * Distinct from startTime (when the meeting happens) and fetchedAt (when we
     * looked), and absent from both until now — which is why "how fast did a
     * setter respond after someone booked" was unanswerable for every
     * calendar-based team. Google returns this on every event already; we were
     * discarding it.
     *
     * Optional because historical rows predate it and only refill as the
     * rolling sync window passes over them.
     */
    bookedAt: v.optional(v.number()),
    meetingUrl: v.optional(v.string()), // Extracted Zoom/Meet/Teams URL for one-click join
    fetchedAt: v.number(), // When this event was last synced
    // Attendee data (populated by Google Calendar API, not available from ICS feeds)
    attendees: v.optional(v.array(v.object({
      email: v.string(),
      name: v.optional(v.string()),
      isOrganizer: v.optional(v.boolean()),
    }))),
    // Multi-calendar support (B2C) — tracks which calendar connection this event belongs to
    calendarId: v.optional(v.id("b2cCalendars")),
    // Multi-calendar support (B2B) — sibling field pointing at the closer's
    // sub-calendar subscription. Mutually exclusive with calendarId above:
    // B2C events fill calendarId, B2B events fill subscriptionId. The shared
    // calendarColor/calendarLabel fields below are used by both.
    subscriptionId: v.optional(v.id("closerCalendarSubscriptions")),
    calendarColor: v.optional(v.string()),  // denormalized for fast UI rendering
    calendarLabel: v.optional(v.string()),  // denormalized for fast UI rendering
    // When set, this calendar event is a system-generated reference to a
    // Sequ3nce coaching call. The Schedule Join handler routes to the in-app
    // CoachingCallRoom overlay instead of opening meetingUrl externally.
    coachingCallId: v.optional(v.id("b2cCoachingCalls")),
  })
    .index("by_closer", ["closerId"])
    .index("by_team_and_time", ["teamId", "startTime"])
    .index("by_closer_and_uid", ["closerId", "uid"])
    .index("by_coaching_call", ["coachingCallId"])
    // Used by per-subscription upsert / cleanup / cascade-delete so we don't
    // scan the entire closer's event set just to find one sub's events.
    .index("by_subscription", ["subscriptionId"]),

  // B2B multi-calendar subscriptions — one row per sub-calendar the closer
  // wants to sync from their one connected Google account. Many subscriptions
  // can share a single closers.googleCalendarRefreshToken. B2C uses a
  // separate b2cCalendars table because each B2C row carries its own OAuth
  // token (multi-account model). For B2B, OAuth is single-account; this
  // table just tracks which sub-calendars under that account to sync.
  closerCalendarSubscriptions: defineTable({
    closerId: v.id("closers"),
    teamId: v.id("teams"), // denormalized for team-scoped queries / cleanup
    googleCalendarId: v.string(), // Google Calendar API id ("primary" or "abc@group.calendar.google.com")
    label: v.string(), // user-customizable display name; defaults to the calendar's summary on add
    calendarBackgroundColor: v.optional(v.string()), // hex from Google's backgroundColor; refreshed every sync
    accessRole: v.optional(v.string()), // "owner" | "writer" | "reader" | "freeBusyReader"
    /**
     * Whether events on this calendar consume THIS closer's bookable capacity
     * on the Team Performance board. Unset = infer it (a calendar is the
     * closer's own when it is "primary" or its address matches their email).
     *
     * Exists because inference can't always be right: teams subscribe to each
     * other's calendars, and on one live team every subscription reports
     * accessRole "owner" because they share a Google Workspace. A manager can
     * state directly which calendars represent a rep's availability.
     */
    countsTowardCapacity: v.optional(v.boolean()),
    enabled: v.boolean(),
    // Set when sync hits a fatal error for this sub. UI surfaces the tag;
    // sync skips disabled subs. null = healthy.
    syncErrorCode: v.optional(v.string()), // "deleted" | "forbidden" | "other"
    lastSyncAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_closer", ["closerId"])
    .index("by_closer_and_enabled", ["closerId", "enabled"])
    .index("by_team", ["teamId"]),

  // Scheduled calls (synced from Calendly or other calendar integrations)
  scheduledCalls: defineTable({
    closerId: v.optional(v.id("closers")), // Optional - can be unassigned if no closer match
    teamId: v.id("teams"),
    calendarEventId: v.string(), // Calendly event URI or other calendar event ID
    prospectName: v.optional(v.string()),
    prospectEmail: v.optional(v.string()),
    scheduledAt: v.number(), // Unix timestamp
    meetingLink: v.optional(v.string()),
    syncedAt: v.number(),
    source: v.optional(v.string()), // "calendly", "google", "manual" - defaults to "manual" for legacy
    status: v.optional(v.string()), // "scheduled", "cancelled" - for tracking cancellations
    calendlyInviteeUri: v.optional(v.string()), // For updating/cancelling specific invitee
  })
    .index("by_closer", ["closerId"])
    .index("by_team_and_date", ["teamId", "scheduledAt"])
    .index("by_calendar_event", ["calendarEventId"]),

  // Calls (actual calls - live or completed)
  calls: defineTable({
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    scheduledCallId: v.optional(v.id("scheduledCalls")), // Link to calendar event
    prospectName: v.optional(v.string()),
    // Dashboard Phase 2 — denormalized for the setter↔closer matcher.
    // Populated at call-create time from the linked calendar event when
    // available; backfilled for older rows via backfillCallProspectIdentity.
    // NORMALIZED form: emails lowercased + trimmed; phones digits-only
    // with US country code stripped (per setterCloserMatcher's helpers).
    prospectEmail: v.optional(v.string()),
    prospectPhone: v.optional(v.string()),
    status: v.string(), // "scheduled", "waiting", "on_call", "completed", "no_show", "cancelled"
    outcome: v.optional(v.string()), // "closed", "not_closed", "no_show", "rescheduled"
    dealValue: v.optional(v.number()), // Legacy field - kept for backward compatibility
    cashCollected: v.optional(v.number()), // Amount paid on the call (upfront payment)
    contractValue: v.optional(v.number()), // Total contract commitment
    /**
     * Collections tracking for the gap between cashCollected and contractValue.
     *
     * We cannot see payments — customers take money through processors we have
     * no connection to, often under names that never appear on the call board.
     * So an outstanding balance is closed out by hand, and these two fields are
     * the only thing that stops the daily digest mentioning it forever.
     *
     * Deliberately two outcomes rather than one flag. Without a way to say "this
     * is never getting paid", an uncollectable debt nags every morning until
     * people learn to ignore the channel, which costs us the collectable ones
     * too. They stay distinguishable in the data because "we got the money" and
     * "we gave up" are different facts about the business.
     */
    balanceSettledAt: v.optional(v.number()),
    balanceSettledBy: v.optional(v.string()),
    balanceWrittenOffAt: v.optional(v.number()),
    balanceWrittenOffBy: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    duration: v.optional(v.number()), // In seconds
    speakerCount: v.number(), // 1 = waiting, 2+ = on call
    recordingUrl: v.optional(v.string()), // S3 URL or Meeting BaaS video URL
    recordingType: v.optional(v.string()), // "audio" (legacy desktop) | "video" (meeting bot)
    // transcriptText moved to callContent sibling.
    meetingBotId: v.optional(v.id("meetingBots")), // Link to meeting bot that recorded this call
    // Talk-to-listen ratio (from Deepgram speaker diarization)
    closerTalkTime: v.optional(v.number()), // Closer talk time in seconds
    /** A human flipped Closer/Prospect on this call's transcript. Automation
     *  (speaker verification) must never overrule it. */
    speakerLabelsFlippedAt: v.optional(v.number()),
    speakerLabelsFlippedBy: v.optional(v.string()),
    prospectTalkTime: v.optional(v.number()), // Prospect talk time in seconds
    /** How many distinct participants SPOKE (Recall's roster is derived from
     *  utterances — a silent attendee is invisible). Persisted by speaker
     *  verification, which already computes and used to discard this. */
    participantCount: v.optional(v.number()),
    /** True when a non-closer, non-bot participant spoke. The honest test
     *  for "did the prospect actually show" — a closer waiting alone
     *  produces a long recording and this stays false. */
    prospectJoined: v.optional(v.boolean()),
    /**
     * Last time any live view of this call was open (closer web app, manager
     * Live page, or the call detail page mid-call). Heartbeated every ~20s by
     * those screens. The audio processor's 45-second live-analysis loop runs
     * for bot-sourced calls ONLY while this is fresh — analyzing a call
     * nobody is watching was most of the Anthropic bill. Desktop-sourced
     * calls don't need it: the desktop IS the viewer, attached by WebSocket.
     */
    liveViewerHeartbeatAt: v.optional(v.number()),
    // Speaker mapping (maps Deepgram speakers to closer/prospect)
    speakerMapping: v.optional(v.object({
      closerSpeaker: v.string(), // "speaker_0" or "speaker_1" from Deepgram
      confirmed: v.boolean(), // Whether the closer has confirmed/corrected this mapping
    })),
    // Post-call data (from closer questionnaire)
    notes: v.optional(v.string()), // Optional notes from closer
    // Hidden marker — read by getBotCallId's reconnect-dedup window. UI never displays this.
    // Set when a call ends via either createCall's safety guard OR completeCall's WebSocket-close path.
    wasAutoCompleted: v.optional(v.boolean()),
    completedAt: v.optional(v.number()), // Timestamp when closer submitted questionnaire
    // summary, callAnalysis, ammoAnalysis moved to callContent sibling.

    // Post-call questionnaire fields (enhanced)
    primaryObjection: v.optional(v.string()), // Selected objection from dropdown (for lost/follow_up)
    primaryObjectionOther: v.optional(v.string()), // Free text if "Other" was selected
    objectionsOvercome: v.optional(v.string()), // For closed deals: "none", objection type, or "other"
    objectionsOvercomeOther: v.optional(v.string()), // Free text if "Other" was selected
    // Every objection raised, in the order it came up, when AI read the call.
    // A real call often has several — "I need to talk to my wife", pushed back
    // on, becomes "I need to think about the price". primaryObjection keeps its
    // old meaning (the single root, so every existing chart and filter is
    // untouched); this is the trail behind that answer, and the only way to see
    // whether the AI read the conversation the way a closer would have.
    objections: v.optional(v.array(v.string())),
    leadQualityScore: v.optional(v.number()), // 1-10 rating
    prospectWasDecisionMaker: v.optional(v.string()), // "yes" | "no" | "unclear"

    // Delayed notification scheduling (for "wait, then fire anyway" pattern)
    pendingNotificationJobId: v.optional(v.string()),

    // AI detection fields (populated by audio processor during call)
    budgetDiscussion: v.optional(v.object({
      detected: v.boolean(),
      mentionCount: v.number(),
      quotes: v.array(v.string()),
    })),
    timelineUrgency: v.optional(v.object({
      detected: v.boolean(),
      mentionCount: v.number(),
      quotes: v.array(v.string()),
      isUrgent: v.optional(v.string()), // "yes" | "no" | "unclear"
    })),
    decisionMakerDetection: v.optional(v.object({
      detected: v.boolean(),
      mentionCount: v.number(),
      quotes: v.array(v.string()),
      isSoleDecisionMaker: v.optional(v.string()), // "yes" | "no" | "unclear"
    })),
    spousePartnerMentions: v.optional(v.object({
      detected: v.boolean(),
      mentionCount: v.number(),
      quotes: v.array(v.string()),
    })),
    objectionsDetected: v.optional(v.array(v.object({
      type: v.string(),
      quotes: v.array(v.string()),
      timestamp: v.optional(v.number()),
    }))),

    // Call review fields
    calendarEventId: v.optional(v.id("calendarEvents")),
    // Where this call came from. Absent on everything recorded before Fathom
    // existed, which is the same thing as "bot".
    source: v.optional(v.string()), // "bot" | "fathom"
    /** Fathom's recording id — the dedup key, so a replayed webhook or a
     *  reconciliation sweep can't create the call twice. */
    externalRecordingId: v.optional(v.string()),
    /** Fathom hosts the media; we only ever get a link to their player. */
    externalShareUrl: v.optional(v.string()),
    // Fathom records EVERYTHING a closer sits in, including team meetings.
    // Our bot only ever joined calls it was pointed at, so this problem is new.
    //
    // Rather than guess and hide, we show every call and only COUNT the ones
    // we're confident about — a closer noticing a real call went missing is
    // far worse than seeing one extra row they can dismiss.
    classifiedAs: v.optional(v.string()), // "sales" | "internal" | "unsure"
    classifiedBy: v.optional(v.string()), // "auto" | "closer"
    /**
     * Two numbers copied off `callContent.complianceReview`.
     *
     * The findings themselves live on callContent with the other heavy blobs,
     * which is right — but the Completed Calls list reads `calls` and nothing
     * else, and joining a sibling table per row to answer "which of these has
     * findings" would be 100 extra reads to render one column. These two make
     * the score sortable and the filter free.
     *
     * Absent means never reviewed, which is NOT the same as reviewed and clean —
     * a clean call has a score and a count of zero.
     */
    complianceScore: v.optional(v.number()),
    complianceFindingCount: v.optional(v.number()),
    /**
     * Claimed before the review runs, so two triggers for the same call can't
     * both do the work.
     *
     * They genuinely can: `generateCallAnalysis` is scheduled from the bot path
     * AND again from speaker re-verification. Without a claim that means two AI
     * calls, two writes, and — the visible part — two alerts in the compliance
     * channel for one call.
     *
     * A timestamp rather than a flag so a run that dies mid-flight expires and
     * can be retried, instead of blocking that call forever.
     */
    complianceReviewStartedAt: v.optional(v.number()),
    /**
     * Why the last review attempt failed, cleared when one succeeds.
     *
     * Exists because the alternative is silence, and silence here is dangerous:
     * a call with no review is indistinguishable from a call that came back
     * clean, and the calls most likely to fail are the ones with the most to
     * say.
     */
    complianceReviewFailed: v.optional(v.string()),
    /**
     * Who put the numbers on this call: "ai" | "closer" | "manager".
     *
     * Absent means the old post-call form, i.e. a human — every historical call
     * predates extraction, so treating absent as human is correct and needs no
     * migration.
     *
     * Two jobs. It marks AI-derived figures in the UI and in the Collections
     * digest, so nobody mistakes a guess for a confirmation. And it keeps the
     * outcome-coverage warning honest: that metric exists so the board can't
     * present "0 closes" as fact when it means "nobody logged anything", and
     * filling every outcome with AI would silently take it to 100% while the
     * numbers became LESS human-confirmed, not more.
     */
    outcomeSource: v.optional(v.string()),
    /** Claimed before extraction runs, so two triggers can't both do the work. */
    extractionStartedAt: v.optional(v.number()),
    /** Why the last extraction attempt failed, cleared when one succeeds. */
    extractionFailed: v.optional(v.string()),
    /** Absent means counted, so nothing about existing calls changes. */
    countsTowardStats: v.optional(v.boolean()), // Link to Google Calendar event (for prospect email)
    /**
     * Pulled from Fathom history at connect time, rather than arriving live.
     *
     * These never count toward stats on arrival no matter how confident the
     * classifier is, because the numbers that matter — outcome, cash collected,
     * contract value — only ever come from the closer's post-call form, and a
     * historical call has none. Counting them would put every backfilled call
     * in the denominator of the close rate and none in the numerator, so a
     * closer's first day would show a month of calls and a 0% close rate.
     * Filling in the outcome promotes them.
     */
    isHistorical: v.optional(v.boolean()),
    flaggedForReview: v.optional(v.boolean()),       // Closer flagged this for manager review
    flaggedAt: v.optional(v.number()),               // When flagged
    reviewStatus: v.optional(v.string()),            // "pending" | "reviewed"
    reviewedAt: v.optional(v.number()),              // When manager marked reviewed
    reviewedBy: v.optional(v.id("users")),           // Which manager reviewed
    commentCount: v.optional(v.number()),            // Denormalized count for list views
    lastCommentAt: v.optional(v.number()),           // When the last comment was added
    feedbackReadAt: v.optional(v.number()),          // When closer last read manager feedback
    managerReadAt: v.optional(v.number()),           // When manager last read closer replies

    // Hyros sync tracking
    hyrosSyncedAt: v.optional(v.number()),
    hyrosSyncError: v.optional(v.string()),

    // GHL sync tracking
    ghlSyncedAt: v.optional(v.number()),
    ghlSyncError: v.optional(v.string()),
    ghlContactId: v.optional(v.string()),

    createdAt: v.number(),
  })
    .index("by_calendar_event", ["calendarEventId"])
    .index("by_team", ["teamId"])
    .index("by_closer", ["closerId"])
    .index("by_team_and_status", ["teamId", "status"])
    .index("by_team_and_date", ["teamId", "createdAt"])
    .index("by_closer_and_startedAt", ["closerId", "startedAt"])
    // Dedup: a replayed webhook or a reconciliation sweep must find the call
    // that already exists rather than making a second one.
    .index("by_external_recording", ["externalRecordingId"])
    // Narrow scans for sidebar badge counters — without these indexes,
    // the badge queries collect() over every call for a team and blow
    // past Convex's 16 MiB per-query read limit on high-volume teams.
    .index("by_team_and_flagged", ["teamId", "flaggedForReview"])
    .index("by_team_and_review_status", ["teamId", "reviewStatus"])
    // Reverse lookup from a meetingBot to all calls referencing it. Used by
    // speakerVerification.getAllCallsLinkedToBot to find every call that
    // belongs to a bot when there are multiple (fragmented bot sessions).
    // Without this index the lookup is a full-table .filter() scan and blows
    // Convex's 16 MiB read limit on teams with large call histories.
    .index("by_meeting_bot", ["meetingBotId"]),

  // Sidecar stats table — denormalizes only the fields stats queries
  // need (no transcript / ammoAnalysis / callAnalysis blobs). Lets
  // dashboard queries scan thousands of rows without hitting Convex's
  // 16 MiB per-query read limit (a calls row averages ~97 KB; a
  // callStats row is ~80 bytes). Kept in sync via the maintainCallStats
  // hook in calls.ts on every create/patch/delete of the parent call.
  adminAlerts: defineTable({
    kind: v.string(),
    sentAt: v.number(),
  }).index("by_kind", ["kind", "sentAt"]),

  callStats: defineTable({
    callId: v.id("calls"),
    teamId: v.id("teams"),
    closerId: v.string(),
    createdAt: v.number(),
    status: v.string(),
    outcome: v.optional(v.string()),
    dealValue: v.optional(v.number()),
    contractValue: v.optional(v.number()),
    cashCollected: v.optional(v.number()),
    duration: v.optional(v.number()),
  })
    .index("by_call", ["callId"])
    .index("by_team", ["teamId"])
    .index("by_team_and_date", ["teamId", "createdAt"])
    .index("by_closer", ["closerId"])
    .index("by_closer_and_date", ["closerId", "createdAt"]),

  // Heavy-blob sibling table — moves the four large fields off the
  // calls table so list/scan queries don't pay ~97 KB/row for data
  // they don't need. After the backfill in callContent.ts runs and
  // commit 2 removes these fields from the calls schema, a calls row
  // is ~100 bytes and any team-wide scan is permanently under the
  // Convex 16 MiB read limit regardless of team size or date range.
  //
  // Single-call detail views (transcript player, AI analysis tab,
  // desktop ammo polling) do one extra .get("callContent", callId) —
  // single-row reads are unconstrained by the scan limit.
  callContent: defineTable({
    callId: v.id("calls"),
    teamId: v.id("teams"),
    transcriptText: v.optional(v.string()),
    summary: v.optional(v.string()),
    callAnalysis: v.optional(v.object({
      chapters: v.array(v.object({
        title: v.string(),
        startTime: v.number(),
        endTime: v.number(),
        summary: v.string(),
      })),
      analysis: v.object({
        opening: v.object({ score: v.string(), summary: v.string() }),
        discovery: v.object({ score: v.string(), summary: v.string() }),
        presentation: v.object({ score: v.string(), summary: v.string() }),
        objectionHandling: v.object({ score: v.string(), summary: v.string() }),
        closing: v.object({ score: v.string(), summary: v.string() }),
      }),
      callSequence: v.array(v.object({
        phase: v.string(),
        description: v.string(),
      })),
      analyzedAt: v.number(),
    })),
    /**
     * Compliance review, judged against rules the business wrote themselves.
     *
     * Its own field rather than a sixth dimension on callAnalysis: this is
     * rule-driven and closer to pass/fail than a quality rating, and keeping it
     * separate means editing the rules can re-run only compliance instead of
     * regenerating chapters and sales scores for every call.
     *
     * NOTE ON WORDING — findings say what was SAID and which rule it may
     * conflict with. They never assert a violation. If we tell a customer a
     * call is "9/10 compliant" and they later face a complaint, our number
     * becomes part of their story.
     */
    complianceReview: v.optional(v.object({
      /** 1-10. For sorting a list and spotting a trend, not for certifying. */
      score: v.number(),
      findings: v.array(v.object({
        /** Which of their rules this may touch, in their own words. */
        rule: v.string(),
        /** What was actually said — the thing a human checks in ten seconds. */
        quote: v.string(),
        /** Seconds from the start, so it can be found in the recording. */
        timestamp: v.optional(v.number()),
        /**
         * Who said it — only when speaker labelling was verified. Transcripts
         * sometimes swap closer and prospect, and flagging a rep for the
         * prospect's words would destroy trust in this immediately.
         */
        speaker: v.optional(v.string()),
        /** Why it might matter. Phrased as a question for a human, not a verdict. */
        concern: v.string(),
      })),
      /** One line a manager can read without opening the call. */
      summary: v.string(),
      /** The rules this was judged against, so an old score stays explicable
       *  after the business edits them. */
      rulesUsed: v.string(),
      reviewedAt: v.number(),
    })),
    ammoAnalysis: v.optional(v.object({
      engagement: v.object({
        level: v.string(),
        reason: v.string(),
      }),
      beliefs: v.object({
        problem: v.number(),
        solution: v.number(),
        vehicle: v.number(),
        self: v.number(),
        time: v.number(),
        money: v.number(),
        urgency: v.number(),
      }),
      objectionPrediction: v.array(v.object({
        type: v.string(),
        probability: v.number(),
      })),
      painPoints: v.array(v.string()),
      liveSummary: v.optional(v.string()),
      analyzedAt: v.number(),
    })),
  })
    .index("by_call", ["callId"])
    .index("by_team", ["teamId"]),

  // Ammo (key moments extracted from calls)
  ammo: defineTable({
    callId: v.id("calls"),
    teamId: v.id("teams"),
    text: v.string(), // The actual quote
    type: v.string(), // "emotional", "urgency", "budget", "commitment", "objection_preview", "pain_point" or custom category
    timestamp: v.optional(v.number()), // When in the call this was said (seconds from start)
    createdAt: v.number(),
    // Scoring fields for heavy hitter detection
    score: v.optional(v.number()), // 0-100 heavy hitter score
    repetitionCount: v.optional(v.number()), // How many times this topic was mentioned
    isHeavyHitter: v.optional(v.boolean()), // score >= 50
    categoryId: v.optional(v.string()), // Custom category ID from ammoConfig (if using custom categories)
    suggestedUse: v.optional(v.string()), // AI-generated suggestion for how to use this ammo
  })
    .index("by_call", ["callId"])
    .index("by_team", ["teamId"]),

  // Objections (specific objections raised during calls)
  objections: defineTable({
    callId: v.id("calls"),
    teamId: v.id("teams"),
    objectionText: v.string(), // "I need to think about it"
    category: v.optional(v.string()), // "spouse", "timing", "price", "trust", etc.
    handled: v.optional(v.boolean()),
    handlingResponse: v.optional(v.string()), // How closer responded
    timestamp: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_call", ["callId"])
    .index("by_team", ["teamId"]),

  // Live transcript segments (for real-time streaming during calls)
  /**
   * A team's setters, entered by the manager.
   *
   * Distinct from `setterReps` (which is what a CRM sync discovers) because
   * this roster exists BEFORE any CRM is connected — it's what the EOD links
   * and the closer attribution dropdown hang off. `setterRepId` links the two
   * once a sync can identify the same person.
   */
  setterRoster: defineTable({
    teamId: v.id("teams"),
    name: v.string(),
    /** The EOD link identity. Bookmark-on-phone auth, same trust model as
     *  share links. Revoke by rotating. Superseded by email magic-link for
     *  the setter APP; the token still opens the bare EOD form. */
    token: v.string(),
    /** Login identity for the setter app. Lowercased. Zion types these. */
    email: v.optional(v.string()),
    /** Scorecard grouping ("A", "B"). Freeform, Zion's vocabulary. */
    pod: v.optional(v.string()),
    active: v.boolean(),
    setterRepId: v.optional(v.id("setterReps")),
    createdAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_token", ["token"])
    .index("by_email", ["email"]),

  /** Every setter sign-in attempt, matched or not. Exists because "the
   *  setters didn't get the email" was undiagnosable: a mistyped address
   *  left no trace. Kept small — attempts, not sessions. */
  setterLoginAttempts: defineTable({
    email: v.string(),
    matched: v.boolean(),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  /** One-time 6-digit login codes for the setter app. Mirrors the closer
   *  magic-link tables: hashed, single-use, 15-minute expiry, lockout. */
  setterMagicCodes: defineTable({
    email: v.string(),
    rosterId: v.id("setterRoster"),
    codeHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    attempts: v.number(),
    usedAt: v.optional(v.number()),
  }).index("by_email", ["email"]),

  /** A signed-in setter device. 90 days; dies when the roster row is
   *  deactivated. Recordings sit behind this — bearer tokens don't cut it. */
  setterSessions: defineTable({
    rosterId: v.id("setterRoster"),
    teamId: v.id("teams"),
    tokenHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_roster", ["rosterId"]),

  /** "This setter set this call", read off the title's leading (initials)
   *  token. Deliberately overshoots — "(E)" matches Erten AND Ethan; each
   *  dismisses what isn't theirs. */
  setterCallMatches: defineTable({
    teamId: v.id("teams"),
    rosterId: v.id("setterRoster"),
    callId: v.id("calls"),
    token: v.string(),
    matchedAt: v.number(),
  })
    .index("by_roster", ["rosterId", "matchedAt"])
    .index("by_call", ["callId"])
    .index("by_team", ["teamId"]),

  /** Per-setter "not my call". Hides it from THAT setter only; reversible,
   *  because an invisible suppression rule is how afternoons get wasted. */
  setterCallDismissals: defineTable({
    rosterId: v.id("setterRoster"),
    callId: v.id("calls"),
    createdAt: v.number(),
  }).index("by_roster_and_call", ["rosterId", "callId"]),

  /** Zion's locked scorecard baseline, per Sat-start week. The scenario
   *  itself is a whiteboard; only the lock and CDPBC survive a reload. */
  scorecardBaselines: defineTable({
    teamId: v.id("teams"),
    weekKey: v.string(),
    rows: v.optional(v.string()),
    cdpbc: v.optional(v.number()),
    lockedAt: v.number(),
  }).index("by_team_and_week", ["teamId", "weekKey"]),

  /** One setter's end-of-day numbers. Self-reported; the CRM cross-check can
   *  come later once Close is connected. */
  setterEodEntries: defineTable({
    teamId: v.id("teams"),
    rosterId: v.id("setterRoster"),
    /** Team-local day, "YYYY-MM-DD". */
    dayKey: v.string(),
    dials: v.number(),
    pickUps: v.number(),
    sets: v.number(),
    newLeadsHit: v.number(),
    followUps: v.number(),
    /** Zion's additions 2026-08-23 — optional so old entries stay valid. */
    callsOnCalendar: v.optional(v.number()),
    callsShown: v.optional(v.number()),
    callsClosed: v.optional(v.number()),
    note: v.optional(v.string()),
    submittedAt: v.number(),
  })
    .index("by_roster_and_day", ["rosterId", "dayKey"])
    .index("by_team_and_day", ["teamId", "dayKey"]),

  transcriptSegments: defineTable({
    callId: v.id("calls"),
    teamId: v.id("teams"),
    speaker: v.string(), // "closer" or "prospect"
    text: v.string(),
    timestamp: v.number(), // seconds from call start
    createdAt: v.number(),
  })
    .index("by_call", ["callId"])
    .index("by_call_and_time", ["callId", "timestamp"]),

  // Playbook highlights (saved call segments for training)
  highlights: defineTable({
    callId: v.id("calls"),
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    title: v.string(), // Short description like "Handling 'I need to think about it'"
    notes: v.optional(v.string()), // Manager's coaching notes
    category: v.string(), // "objection_handling", "pitch", "close", "pain_discovery"
    transcriptText: v.string(), // The selected transcript text
    startTimestamp: v.number(), // Start time in seconds
    endTimestamp: v.number(), // End time in seconds
    createdAt: v.number(),
    createdBy: v.id("users"), // Manager who created this highlight
  })
    .index("by_team", ["teamId"])
    .index("by_team_and_category", ["teamId", "category"])
    .index("by_closer", ["closerId"])
    .index("by_call", ["callId"]),

  // Training Playlists (curated collections of highlights for training closers)
  trainingPlaylists: defineTable({
    teamId: v.id("teams"),
    name: v.string(), // "New Closer Onboarding", "Objection Handling Masterclass"
    description: v.optional(v.string()), // Optional description of the playlist
    createdBy: v.id("users"), // Manager who created this playlist
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_creator", ["createdBy"]),

  // Training Playlist Items (ordered highlights within a playlist)
  trainingPlaylistItems: defineTable({
    playlistId: v.id("trainingPlaylists"),
    highlightId: v.id("highlights"),
    order: v.number(), // Position in the playlist (0, 1, 2, ...)
    addedAt: v.number(),
  })
    .index("by_playlist", ["playlistId"])
    .index("by_playlist_order", ["playlistId", "order"])
    .index("by_highlight", ["highlightId"]),

  // Training Playlist Assignments (which closers have which playlists assigned)
  trainingPlaylistAssignments: defineTable({
    playlistId: v.id("trainingPlaylists"),
    closerId: v.id("closers"),
    assignedBy: v.id("users"), // Manager who assigned this
    assignedAt: v.number(),
  })
    .index("by_closer", ["closerId"])
    .index("by_playlist", ["playlistId"])
    .index("by_closer_playlist", ["closerId", "playlistId"]),

  // Ammo Configs (per-team customization for ammo extraction and nudges)
  ammoConfigs: defineTable({
    teamId: v.id("teams"),

    // Required Information List - what info must closers uncover on every call
    requiredInfo: v.array(v.object({
      id: v.string(),
      label: v.string(),
      description: v.optional(v.string()),
    })),

    // Script Framework - call stages in order
    scriptFramework: v.array(v.object({
      id: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      order: v.number(),
    })),

    // Common Objections - what objections prospects typically raise
    commonObjections: v.array(v.object({
      id: v.string(),
      label: v.string(),
      keywords: v.array(v.string()), // phrases that indicate this objection
    })),

    // Ammo Categories - custom categories with keywords to listen for
    ammoCategories: v.array(v.object({
      id: v.string(),
      name: v.string(),
      color: v.string(), // for UI display (e.g., "purple", "green", "blue")
      keywords: v.array(v.string()), // phrases to listen for
    })),

    // Offer Details
    offerDescription: v.string(), // What do they sell?
    problemSolved: v.string(), // What problem does it solve?

    // Call Framework (Manifesto) - defines sales stages, behaviors, and objection rebuttals
    callManifesto: v.optional(v.object({
      stages: v.array(v.object({
        id: v.string(),
        name: v.string(),
        goal: v.optional(v.string()),
        goodBehaviors: v.array(v.string()),
        badBehaviors: v.array(v.string()),
        keyMoments: v.array(v.string()),
        order: v.number(),
      })),
      objections: v.array(v.object({
        id: v.string(),
        name: v.string(),
        rebuttals: v.array(v.string()),
      })),
    })),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"]),

  // Smart Nudges (real-time coaching suggestions during calls)
  nudges: defineTable({
    callId: v.id("calls"),
    teamId: v.id("teams"),
    type: v.string(), // "dig_deeper" | "missing_info" | "script_reminder" | "objection_warning"
    message: v.string(), // Short message shown to closer
    detail: v.optional(v.string()), // Additional context or suggestion
    status: v.string(), // "active" | "saved" | "dismissed"
    triggeredBy: v.optional(v.string()), // What keyword/phrase triggered this nudge
    createdAt: v.number(),
  })
    .index("by_call", ["callId"])
    .index("by_call_and_status", ["callId", "status"]),

  // Closer Resources (sales scripts, payment links, and other resources for closers)
  closerResources: defineTable({
    teamId: v.id("teams"),
    type: v.string(), // "script" | "payment_link" | "document" | "link"
    title: v.string(), // Display name
    description: v.optional(v.string()), // Optional description
    content: v.optional(v.string()), // For scripts: the actual script text
    url: v.optional(v.string()), // For payment links and external documents
    order: v.number(), // Display order
    isActive: v.boolean(), // Whether to show to closers
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_and_order", ["teamId", "order"]),

  // Client Error Logs (for debugging desktop app issues remotely)
  clientErrors: defineTable({
    closerId: v.optional(v.id("closers")),
    teamId: v.optional(v.id("teams")),
    closerEmail: v.optional(v.string()), // Fallback if closerId lookup fails
    errorType: v.string(), // "permission_denied", "capture_failed", "connection_error", etc.
    errorMessage: v.string(),
    errorStack: v.optional(v.string()),
    // Diagnostic info
    appVersion: v.optional(v.string()),
    platform: v.optional(v.string()), // "darwin", "win32", "linux"
    osVersion: v.optional(v.string()), // e.g., "14.2.1"
    architecture: v.optional(v.string()), // "arm64", "x64"
    // Permission states at time of error
    screenPermission: v.optional(v.string()), // "granted", "denied", "not-determined"
    microphonePermission: v.optional(v.string()),
    // Capture step tracking - which step in audio capture failed
    captureStep: v.optional(v.string()), // "getDisplayMedia", "getUserMedia", "audioContext", etc.
    // Additional context
    context: v.optional(v.string()), // JSON string with any extra diagnostic info (includes track counts)
    createdAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_closer", ["closerId"])
    .index("by_type", ["errorType"]),

  // Live Streams (for managers listening to calls in real-time)
  liveStreams: defineTable({
    callId: v.id("calls"),
    teamId: v.id("teams"),
    closerId: v.id("closers"),
    // The visitorCallId is the UUID generated by the desktop app for this call session
    // It's used to match the WebSocket connection to this stream record
    visitorCallId: v.string(),
    status: v.string(), // "active" | "ended"
    // Track connected listeners for debugging/analytics
    listenerCount: v.optional(v.number()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_call", ["callId"])
    .index("by_visitor_call_id", ["visitorCallId"])
    .index("by_team_status", ["teamId", "status"])
    .index("by_closer_status", ["closerId", "status"]),

  // Live Messages (real-time chat between managers and closers)
  liveMessages: defineTable({
    teamId: v.id("teams"),

    // Sender info (can be manager OR closer)
    senderType: v.string(), // "manager" | "closer"
    senderUserId: v.optional(v.id("users")), // Set if sender is a manager
    senderCloserId: v.optional(v.id("closers")), // Set if sender is a closer
    senderName: v.string(), // Denormalized for easy display

    // Recipient info (can be manager OR closer)
    recipientType: v.string(), // "manager" | "closer"
    recipientUserId: v.optional(v.id("users")), // Set if recipient is a manager
    recipientCloserId: v.optional(v.id("closers")), // Set if recipient is a closer

    // Message content
    message: v.string(),
    isRead: v.boolean(),

    // Timestamps
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_team", ["teamId"])
    .index("by_recipient_closer", ["recipientCloserId", "isRead"])
    .index("by_recipient_user", ["recipientUserId", "isRead"])
    .index("by_sender_closer", ["senderCloserId"])
    .index("by_sender_user", ["senderUserId"]),

  // Reinforcement Requests (closers requesting urgent help from managers)
  reinforcementRequests: defineTable({
    teamId: v.id("teams"),
    closerId: v.id("closers"),
    callId: v.optional(v.id("calls")), // Optional: the active call if any
    closerName: v.string(), // Denormalized for display
    message: v.optional(v.string()), // Optional context message
    status: v.string(), // "pending" | "acknowledged" | "resolved"
    acknowledgedBy: v.optional(v.id("users")), // Manager who acknowledged
    acknowledgedAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    slackNotificationSent: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_team_status", ["teamId", "status"])
    .index("by_closer", ["closerId"]),

  // Diagnostic Reports (for debugging user-specific issues)
  diagnosticReports: defineTable({
    reportId: v.string(), // Short memorable ID like "ABC123"
    appType: v.optional(v.string()), // "b2b" or "b2c"
    closerId: v.optional(v.string()),
    teamId: v.optional(v.string()),
    closerEmail: v.optional(v.string()),
    userDescription: v.optional(v.string()),

    // System diagnostics (all fields optional for cross-platform compatibility)
    system: v.optional(v.object({
      platform: v.optional(v.string()), // "win32", "darwin", "electron-windows"
      arch: v.optional(v.string()),
      osRelease: v.optional(v.string()),
      osVersion: v.optional(v.string()),
      osBuild: v.optional(v.string()),
      macOSVersion: v.optional(v.string()),
      macOSBuild: v.optional(v.string()),
      hardwareModel: v.optional(v.string()),
      chipType: v.optional(v.string()),
      cpuModel: v.optional(v.string()),
      ramTotal: v.optional(v.number()),
      ramAvailable: v.optional(v.number()),
      ramTotalGB: v.optional(v.number()),
      ramAvailableGB: v.optional(v.number()),
      appVersion: v.optional(v.string()),
      appBuild: v.optional(v.string()),
      appUptime: v.optional(v.number()),
      userAgent: v.optional(v.string()),
      electronVersion: v.optional(v.string()),
      chromeVersion: v.optional(v.string()),
      openWindowCount: v.optional(v.number()),
    })),

    // Audio diagnostics
    audio: v.optional(v.object({
      defaultInputDeviceName: v.optional(v.string()),
      defaultInputDeviceUID: v.optional(v.string()),
      systemAudioCaptureStatus: v.optional(v.string()),
      captureStatus: v.optional(v.string()),
      micLevel: v.optional(v.number()),
      systemLevel: v.optional(v.number()),
      silenceDetectionActive: v.optional(v.boolean()),
      lastMicCallbackSecondsAgo: v.optional(v.number()),
      totalChunksSent: v.optional(v.number()),
      isCapturing: v.optional(v.boolean()),
      currentCallId: v.optional(v.string()),
      hasActiveConnection: v.optional(v.boolean()),
      useCoreAudioTap: v.optional(v.boolean()),
      audioDevices: v.optional(v.array(v.object({
        kind: v.optional(v.string()),
        label: v.optional(v.string()),
      }))),
    })),

    // WebSocket diagnostics
    websocket: v.optional(v.object({
      connectionState: v.optional(v.string()),
      reconnectionCountThisSession: v.optional(v.number()),
      reconnectAttempt: v.optional(v.number()),
      isReconnecting: v.optional(v.boolean()),
      lastHeartbeatAckSecondsAgo: v.optional(v.number()),
      lastPongSecondsAgo: v.optional(v.number()),
      missedHeartbeatCount: v.optional(v.number()),
      audioServiceUrl: v.optional(v.string()),
      reconnectionHistory: v.optional(v.array(v.object({
        timestamp: v.optional(v.string()),
        reason: v.optional(v.string()),
      }))),
    })),

    // Call diagnostics
    call: v.optional(v.object({
      currentCallId: v.optional(v.string()),
      convexCallId: v.optional(v.string()),
      closerId: v.optional(v.string()),
      teamId: v.optional(v.string()),
      recordingState: v.optional(v.string()),
      recordingDuration: v.optional(v.number()),
      timeSinceRecordingStarted: v.optional(v.number()),
    })),

    // Permission diagnostics
    permissions: v.optional(v.object({
      microphonePermission: v.optional(v.string()),
      screenRecordingPermission: v.optional(v.string()),
    })),

    // Log diagnostics
    logs: v.optional(v.object({
      recentLogs: v.optional(v.array(v.object({
        timestamp: v.optional(v.string()),
        level: v.optional(v.string()),
        category: v.optional(v.string()),
        message: v.optional(v.string()),
      }))),
      errorCountLastHour: v.optional(v.number()),
      lastErrorMessage: v.optional(v.string()),
      lastErrorTimestamp: v.optional(v.string()),
    })),

    // Meeting bot diagnostics
    meetingBot: v.optional(v.object({
      meetingBotEnabled: v.optional(v.boolean()),
      botCallActive: v.optional(v.boolean()),
      activeBotCallId: v.optional(v.string()),
      activeBotId: v.optional(v.string()),
      activeBotMeetingTitle: v.optional(v.string()),
      activeBotProspectName: v.optional(v.string()),
      pendingQuestionnaireCount: v.optional(v.number()),
      showingPostCallQuestionnaire: v.optional(v.boolean()),
      calendarConnected: v.optional(v.boolean()),
      calendarProvider: v.optional(v.string()),
      meetingPlatform: v.optional(v.string()),
      appMode: v.optional(v.string()),
      currentSidebarItem: v.optional(v.string()),
      pollBotStatusActive: v.optional(v.boolean()),
      ammoPanelVisible: v.optional(v.boolean()),
      questionnairePanelVisible: v.optional(v.boolean()),
      firstPendingCallId: v.optional(v.string()),
      firstPendingProspectName: v.optional(v.string()),
      botStatus: v.optional(v.string()),
      botIsScheduled: v.optional(v.boolean()),
      botActiveSeconds: v.optional(v.number()),
      lastBotError: v.optional(v.string()),
      lastBotErrorAt: v.optional(v.string()),
    })),

    // Ammo panel diagnostics
    ammoPanel: v.optional(v.object({
      ammoItemCount: v.optional(v.number()),
      transcriptSegmentCount: v.optional(v.number()),
      isPolling: v.optional(v.boolean()),
      trackedCallId: v.optional(v.string()),
      isAmmoV2Enabled: v.optional(v.boolean()),
    })),

    // API error diagnostics
    api: v.optional(v.object({
      lastApiError: v.optional(v.string()),
      lastApiErrorEndpoint: v.optional(v.string()),
      lastApiErrorAt: v.optional(v.string()),
      apiErrorCountLastHour: v.optional(v.number()),
    })),

    createdAt: v.number(),
  })
    .index("by_report_id", ["reportId"])
    .index("by_closer", ["closerId"])
    .index("by_team", ["teamId"]),

  // Slack Notifications (tracking sent notifications to prevent duplicates).
  // Used by both call-based notifications (with callId) and feature-level
  // notifications like Setter Data daily scorecard (with dedupKey instead).
  slackNotifications: defineTable({
    teamId: v.id("teams"),
    callId: v.optional(v.id("calls")),
    type: v.string(), // see slack.ts validTypes for the canonical list
    sentAt: v.number(),
    // Generic dedup key for non-call notifications. Format depends on type:
    //   "setter_daily_scorecard" → `${teamId}_scorecard_${YYYY-MM-DD}`
    //   "setter_untouched_alert" → `${teamId}_untouched_${ghlContactId}_${15minBucket}`
    dedupKey: v.optional(v.string()),
  })
    .index("by_call_and_type", ["callId", "type"])
    .index("by_team", ["teamId"])
    .index("by_dedup_key", ["dedupKey"]),

  // Meeting Bots (bots that auto-join video calls via Meeting BaaS)
  meetingBots: defineTable({
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    callId: v.optional(v.id("calls")), // Created when bot joins and call record is made
    meetingBaasId: v.optional(v.string()), // Meeting BaaS bot ID (legacy)
    recallBotId: v.optional(v.string()), // Recall.ai bot UUID
    meetingUrl: v.string(), // Zoom/Meet/Teams URL
    meetingTitle: v.optional(v.string()), // From calendar event
    prospectName: v.optional(v.string()), // Auto-populated from calendar or manual entry
    status: v.string(), // "scheduled" | "joining" | "active" | "completed" | "failed" | "cancelled" | "kicked"
    scheduledAt: v.optional(v.number()), // When the meeting is scheduled to start
    joinedAt: v.optional(v.number()), // When bot actually joined
    endedAt: v.optional(v.number()), // When bot left/call ended
    calendarEventId: v.optional(v.string()), // Link to calendar event UID
    recordingUrl: v.optional(v.string()), // Meeting BaaS video recording URL
    recordingDuration: v.optional(v.number()), // Duration in seconds
    questionnaireCompleted: v.optional(v.boolean()), // Whether closer filled post-call form
    source: v.string(), // "calendar" | "quick_bot"
    failureReason: v.optional(v.string()), // Why the bot failed (if status === "failed")
    closerName: v.optional(v.string()), // For webhook transcript speaker identification
    closerParticipantId: v.optional(v.union(v.number(), v.string())), // Recall participant.id pinned once we identify the closer — locks per-call speaker consistency
    closerIsHost: v.optional(v.boolean()), // Whether the closer is the meeting host. true for scheduled bots (closer scheduled the meeting), false for QuickBot (closer joining external Zoom). Used by decideSpeaker to match is_host correctly.
    // Post-call ground-truth check against Recall.ai's participant list.
    // Set by speakerVerification.verifyClosersByRecallApi when the verifier
    // either confirms the pin matches the closer's name or repairs it from
    // Recall's authoritative data. One-shot — once stamped, we don't reverify.
    speakerVerifiedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_closer", ["closerId"])
    .index("by_team", ["teamId"])
    .index("by_closer_and_status", ["closerId", "status"])
    .index("by_team_and_status", ["teamId", "status"])
    .index("by_meeting_baas_id", ["meetingBaasId"])
    .index("by_recall_bot_id", ["recallBotId"])
    .index("by_calendar_event", ["calendarEventId"]),

  // Call Comments (timestamped feedback on call recordings)
  callComments: defineTable({
    callId: v.id("calls"),
    teamId: v.id("teams"),
    authorType: v.union(v.literal("manager"), v.literal("closer")),
    authorId: v.string(),            // clerkUserId or closerId string
    authorName: v.string(),          // Display name
    content: v.string(),             // Comment text
    timestampSeconds: v.optional(v.number()), // Video timestamp in seconds (null = general comment)
    parentCommentId: v.optional(v.id("callComments")), // Reply to another comment
    createdAt: v.number(),
  })
    .index("by_call", ["callId"])
    .index("by_call_and_time", ["callId", "createdAt"]),

  // Shared Moments (video clips shared with the team for training)
  sharedMoments: defineTable({
    callId: v.id("calls"),
    teamId: v.id("teams"),
    closerId: v.id("closers"),       // Closer from the call
    title: v.string(),                // "Great objection handle"
    notes: v.optional(v.string()),    // Manager description
    startSeconds: v.number(),         // Clip start time
    endSeconds: v.number(),           // Clip end time
    sharedBy: v.id("users"),          // Manager who shared
    sharedWithAll: v.optional(v.boolean()),          // true = entire team, false/undefined = specific closers
    sharedWithCloserIds: v.optional(v.array(v.string())), // Closer IDs if not shared with all
    createdAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_call", ["callId"])
    .index("by_team_recent", ["teamId", "createdAt"]),

  // Shared Links (public URLs for sharing call recordings externally)
  sharedLinks: defineTable({
    callId: v.id("calls"),
    teamId: v.id("teams"),
    token: v.string(),                           // Unique URL-safe token (16 chars)
    shareType: v.string(),                       // "full" | "clip"
    startSeconds: v.optional(v.number()),        // Clip start (only for shareType "clip")
    endSeconds: v.optional(v.number()),          // Clip end (only for shareType "clip")
    includeComments: v.boolean(),                // Whether comments are visible on the public page
    createdBy: v.string(),                       // clerkUserId or closerId
    createdByType: v.string(),                   // "manager" | "closer"
    isActive: v.boolean(),                       // false = revoked
    createdAt: v.number(),
    accessType: v.optional(v.string()),          // "full_access" | "compliance" (undefined = full_access for B2B compat)
    passwordHash: v.optional(v.string()),        // SHA-256 hash if password-protected
    redactedTranscript: v.optional(v.array(v.object({
      speaker: v.string(),
      text: v.string(),
      timestamp: v.number(),
    }))),                                        // AI-redacted version for compliance links
  })
    .index("by_token", ["token"])
    .index("by_call", ["callId"])
    // Rotating a team's compliance password has to re-gate the links already
    // out there, or rotating it achieves nothing.
    .index("by_team", ["teamId"]),

  // Excluded Calendar Events (events the closer marked as "not a sales call")
  excludedCalendarEvents: defineTable({
    closerId: v.id("closers"),
    calendarEventId: v.string(), // Calendar event UID
    eventTitle: v.optional(v.string()), // For display
    isRecurring: v.optional(v.boolean()), // If true, exclude all instances
    createdAt: v.number(),
  })
    .index("by_closer", ["closerId"])
    .index("by_closer_and_event", ["closerId", "calendarEventId"]),

  // ==================== B2C Tables ====================

  // B2C user accounts (Sequ3nce Personal)
  b2cUsers: defineTable({
    email: v.string(),
    /** Optional since Polar provisioning (2026-08-19): accounts created from a
     *  web checkout have no phone until the user adds one. Email is the login
     *  key; phone remains unique WHEN present. */
    phone: v.optional(v.string()),
    phoneVerified: v.boolean(),
    name: v.string(),
    /** Optional since Polar provisioning: a checkout-created account has no
     *  password until the welcome email's set-password link is used. Login is
     *  refused (with guidance) while unset. */
    passwordHash: v.optional(v.string()),
    personalWorkspaceId: v.id("teams"),   // Their "team of one"
    stripeCustomerId: v.optional(v.string()),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("cancelled"),
      v.literal("past_due"),
      v.literal("none"),
    ),
    subscriptionId: v.optional(v.string()),
    // --- Polar (B2C moved to Polar 2026-08-19; Stripe fields above are legacy,
    // kept for schema compatibility — there were zero paying Stripe users) ---
    polarCustomerId: v.optional(v.string()),
    polarSubscriptionId: v.optional(v.string()),
    /** "monthly" | "3month" | "6month" | "yearly" — from product metadata. */
    planTerm: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    profileSlug: v.optional(v.string()),  // URL-safe unique slug
    linkedCloserIds: v.optional(v.array(v.id("closers"))), // B2B closer IDs matched by phone
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    role: v.optional(v.string()),           // "admin" | "user" (undefined = "user")
    passwordResetCode: v.optional(v.string()),  // 6-digit reset code (hashed)
    passwordResetExpiry: v.optional(v.number()), // Expiry timestamp for reset code
    badges: v.optional(v.array(v.string())),    // "founder", "coach", etc.
    emailVerified: v.optional(v.boolean()),                // undefined = grandfathered (treated as true)
    emailVerificationCode: v.optional(v.string()),         // SHA-256 hashed 6-digit code
    emailVerificationExpiry: v.optional(v.number()),       // Unix timestamp
    emailVerificationLastSent: v.optional(v.number()),     // For 60s resend cooldown
    lastSeenAt: v.optional(v.number()),                    // Online presence heartbeat timestamp
    isTestAccount: v.optional(v.boolean()),                // Playwright/QA accounts — hidden from community + presence
    trialExpiresAt: v.optional(v.number()),                 // Beta trial end date (undefined = no trial)
    onboardingCompleted: v.optional(v.boolean()),           // Whether onboarding questionnaire was filled
    onboardingSource: v.optional(v.string()),               // "instagram" | "youtube" | "google" | "referral"
    onboardingIncome: v.optional(v.string()),               // "0-1k" | "2-5k" | "5-10k" | "10-20k" | "20k+"
    onboardingStruggle: v.optional(v.string()),             // "finding_offer" | "networking" | "improving_skills" | "staying_consistent"
  })
    .index("by_email", ["email"])
    .index("by_phone", ["phone"])
    .index("by_profile_slug", ["profileSlug"])
    .index("by_subscription_status", ["subscriptionStatus"])
    .index("by_stripe_customer", ["stripeCustomerId"])
    .index("by_polar_customer", ["polarCustomerId"]),

  // ==================== B2C Community Tables (Phase A) ====================

  // Community channels (pre-seeded topic discussions)
  b2cCommunityChannels: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    icon: v.optional(v.string()),
    order: v.number(),
    isDefault: v.boolean(),
    isArchived: v.boolean(),
    postCount: v.number(),
    lastActivityAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_order", ["order"]),

  // Community posts within channels
  b2cCommunityPosts: defineTable({
    channelId: v.id("b2cCommunityChannels"),
    authorId: v.id("b2cUsers"),
    authorName: v.string(),
    authorPhotoStorageId: v.optional(v.string()),
    body: v.string(),
    visibility: v.optional(v.string()), // "everyone" (default) | "friends"
    likeCount: v.number(),
    commentCount: v.number(),
    isPinned: v.boolean(),
    isDeleted: v.boolean(),
    reactionCounts: v.optional(v.any()), // { thumbsup: 3, fire: 1 }
    broadcastId: v.optional(v.id("b2cMoneyBellBroadcasts")), // linked broadcast — when set, post is a Money Bells broadcast
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_channel", ["channelId", "createdAt"])
    .index("by_author", ["authorId", "createdAt"])
    .index("by_channel_pinned", ["channelId", "isPinned"])
    .index("by_created", ["createdAt"])
    .index("by_broadcast", ["broadcastId"]),

  // Post likes (separate table for uniqueness enforcement)
  b2cCommunityPostLikes: defineTable({
    postId: v.id("b2cCommunityPosts"),
    userId: v.id("b2cUsers"),
    createdAt: v.number(),
  })
    .index("by_post_user", ["postId", "userId"])
    .index("by_user", ["userId"]),

  // Comments on posts (flat, no nesting)
  b2cCommunityComments: defineTable({
    postId: v.id("b2cCommunityPosts"),
    channelId: v.id("b2cCommunityChannels"),
    authorId: v.id("b2cUsers"),
    authorName: v.string(),
    authorPhotoStorageId: v.optional(v.string()),
    body: v.string(),
    parentCommentId: v.optional(v.id("b2cCommunityComments")),
    likeCount: v.number(),
    isDeleted: v.boolean(),
    reactionCounts: v.optional(v.any()), // { thumbsup: 3, fire: 1 }
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_post", ["postId", "createdAt"])
    .index("by_author", ["authorId", "createdAt"]),

  // Comment likes
  b2cCommunityCommentLikes: defineTable({
    commentId: v.id("b2cCommunityComments"),
    userId: v.id("b2cUsers"),
    createdAt: v.number(),
  })
    .index("by_comment_user", ["commentId", "userId"])
    .index("by_user", ["userId"]),

  // ==================== B2C Community Tables (Phase B — schema only) ====================

  // Training modules (admin-curated courses)
  b2cTrainingModules: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    thumbnailStorageId: v.optional(v.string()),
    order: v.number(),
    lessonCount: v.number(),
    isPublished: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_published", ["isPublished", "order"]),

  // Individual video lessons within a module
  b2cTrainingLessons: defineTable({
    moduleId: v.id("b2cTrainingModules"),
    title: v.string(),
    description: v.optional(v.string()),
    videoUrl: v.string(),
    durationSeconds: v.optional(v.number()),
    order: v.number(),
    isPublished: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_module", ["moduleId", "order"]),

  // ==================== B2C Community Tables (Phase C — schema only) ====================

  // DM threads between two users.
  // Team threads (founder→user notifications) use participantKey="team_<recipientId>"
  // and leave participant2Id undefined; senderType distinguishes them.
  b2cDirectMessageThreads: defineTable({
    participantKey: v.string(),
    participant1Id: v.id("b2cUsers"),
    participant2Id: v.optional(v.id("b2cUsers")),
    lastMessageAt: v.optional(v.number()),
    lastMessagePreview: v.optional(v.string()),
    createdAt: v.number(),
    // Team-notification fields (undefined treated as "user" for legacy rows):
    senderType: v.optional(v.union(v.literal("user"), v.literal("team"))),
    repliesAllowed: v.optional(v.boolean()),
  })
    .index("by_participant_key", ["participantKey"])
    .index("by_participant1", ["participant1Id", "lastMessageAt"])
    .index("by_participant2", ["participant2Id", "lastMessageAt"])
    .index("by_sender_type_last", ["senderType", "lastMessageAt"]),

  // Individual DM messages.
  // For team-notification messages: teamSentBy = the founder who actually typed it
  // (senderId is the same founder; teamSentBy signals that the message should be
  // rendered as "Sequ3nce Team" regardless). broadcastId links messages from the
  // same fan-out event, used for aggregate read-count queries.
  b2cDirectMessages: defineTable({
    threadId: v.id("b2cDirectMessageThreads"),
    senderId: v.id("b2cUsers"),
    body: v.string(),
    isRead: v.boolean(),
    readAt: v.optional(v.number()),
    isDeleted: v.boolean(),
    createdAt: v.number(),
    teamSentBy: v.optional(v.id("b2cUsers")),
    broadcastId: v.optional(v.id("b2cTeamBroadcasts")),
  })
    .index("by_thread", ["threadId", "createdAt"])
    .index("by_recipient_unread", ["threadId", "isRead"])
    .index("by_broadcast", ["broadcastId"]),

  // One row per founder-initiated notification send (either specific or all-users).
  // Powers the founder-side history panel and aggregate read-count display.
  b2cTeamBroadcasts: defineTable({
    sentBy: v.id("b2cUsers"),
    body: v.string(),
    recipientMode: v.union(v.literal("specific"), v.literal("all")),
    recipientCount: v.number(),
    repliesAllowed: v.boolean(),
    sentAt: v.number(),
  })
    .index("by_sent_at", ["sentAt"])
    .index("by_sent_by", ["sentBy", "sentAt"]),

  // ==================== B2C Community Tables (Phase D — schema only) ====================

  // Friend connections between community members
  b2cFriendships: defineTable({
    requesterId: v.id("b2cUsers"),
    recipientId: v.id("b2cUsers"),
    friendshipKey: v.string(),
    status: v.string(),
    acceptedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_friendship_key", ["friendshipKey"])
    .index("by_requester", ["requesterId", "status"])
    .index("by_recipient", ["recipientId", "status"])
    .index("by_accepted", ["status", "acceptedAt"]),

  // ==================== B2C Community Tables (Phase E — Discord overhaul) ====================

  // Emoji reactions on posts and comments (new system alongside old likes)
  b2cCommunityReactions: defineTable({
    targetType: v.string(), // "post" | "comment"
    targetId: v.string(), // post or comment _id
    userId: v.id("b2cUsers"),
    emoji: v.string(), // "thumbsup"|"fire"|"hundred"|"clap"|"laugh"|"heart"|"eyes"|"mindblown"
    createdAt: v.number(),
  })
    .index("by_target", ["targetType", "targetId", "emoji"])
    .index("by_target_user", ["targetType", "targetId", "userId"])
    .index("by_user", ["userId"]),

  // Per-user per-channel read state for unread indicators
  b2cChannelReadState: defineTable({
    userId: v.id("b2cUsers"),
    channelId: v.id("b2cCommunityChannels"),
    lastReadAt: v.number(),
  })
    .index("by_user_channel", ["userId", "channelId"])
    .index("by_user", ["userId"]),

  // Short-lived typing indicators for DMs (5s TTL)
  b2cTypingIndicators: defineTable({
    threadId: v.id("b2cDirectMessageThreads"),
    userId: v.id("b2cUsers"),
    userName: v.string(),
    expiresAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_expires", ["expiresAt"]),

  // ==================== Money Bells (B2C monthly cash-collected leaderboard) ====================

  // Broadcast source of truth — one row per "I just closed a deal" broadcast
  b2cMoneyBellBroadcasts: defineTable({
    userId: v.id("b2cUsers"),
    callId: v.id("calls"),
    cashCollected: v.number(),              // snapshot at broadcast time
    note: v.optional(v.string()),           // optional user note, max 140 chars
    postId: v.id("b2cCommunityPosts"),      // linked post row (for reactions/comments)
    isDeleted: v.boolean(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("b2cUsers")),
    broadcastedAt: v.number(),
    month: v.string(),                       // "YYYY-MM" for leaderboard month queries
  })
    .index("by_month_cash", ["month", "isDeleted", "cashCollected"])
    .index("by_user_month", ["userId", "month", "isDeleted"])
    .index("by_call", ["callId"])
    .index("by_post", ["postId"]),

  // Monthly prize config + winner tracking
  b2cMoneyBellPrizes: defineTable({
    month: v.string(),                       // "YYYY-MM" — one row per month
    prizeAmount: v.optional(v.number()),     // legacy (rank-1 dollar amount); new rows use prizeText1
    prizeLabel: v.optional(v.string()),      // legacy e.g. "Top Cash Collected"
    // Free-form prize text per rank — anything ("$500 cash", "Rolex Submariner", "iPad Air", ...)
    prizeText1: v.optional(v.string()),
    prizeText2: v.optional(v.string()),
    prizeText3: v.optional(v.string()),
    // Rank-1 winner (legacy field names preserved)
    winnerUserId: v.optional(v.id("b2cUsers")),
    winnerCashCollected: v.optional(v.number()),
    // Rank-2 + rank-3 winners
    winner2UserId: v.optional(v.id("b2cUsers")),
    winner2CashCollected: v.optional(v.number()),
    winner3UserId: v.optional(v.id("b2cUsers")),
    winner3CashCollected: v.optional(v.number()),
    paid: v.boolean(),                       // rank-1 paid flag (legacy)
    paidAt: v.optional(v.number()),
    paid2: v.optional(v.boolean()),
    paid2At: v.optional(v.number()),
    paid3: v.optional(v.boolean()),
    paid3At: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_month", ["month"])
    .index("by_paid_status", ["paid"]),

  // Per-user opt-in records (users must join Money Bells before broadcasting)
  b2cMoneyBellOptIns: defineTable({
    userId: v.id("b2cUsers"),
    joinedAt: v.number(),
    acknowledgedWarning: v.boolean(),       // honor-system acknowledgment
  })
    .index("by_user", ["userId"]),

  // Per-user commission configuration driving the Personal Goal Tracker widget
  // on the Dashboard. One row per user; set once on first goal, editable anytime.
  b2cGoalTrackerSettings: defineTable({
    userId: v.id("b2cUsers"),
    commissionMode: v.union(v.literal("cash"), v.literal("contract")),
    commissionRate: v.number(),             // 0.10 = 10%
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"]),

  // User-defined motivational goals. At most one "active" goal per user at any
  // time; completed / expired / cancelled goals are preserved for future history.
  b2cPersonalGoals: defineTable({
    userId: v.id("b2cUsers"),
    title: v.string(),                      // ≤ 80 chars; may include the "why" inline
    emoji: v.optional(v.string()),          // rendered bigger than inline emoji in title; falls back to 🎯
    targetAmount: v.number(),               // dollars EARNED (after commission calc)
    startDate: v.number(),                  // ms epoch — goal creation; baseline for progress
    endDate: v.number(),                    // ms epoch — deadline
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("expired"),
      v.literal("cancelled"),
    ),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_user", ["userId", "createdAt"])
    .index("by_status_endDate", ["status", "endDate"]),

  // B2C Coaching Calls — live group video sessions hosted by badged coaches
  // via Daily.co. Interactive (everyone unmutes), coach is the Daily meeting
  // owner (mute/kick powers). Records to Daily cloud, URL persisted here once
  // processing completes.
  b2cCoachingCalls: defineTable({
    coachUserId: v.id("b2cUsers"),
    title: v.string(),                        // ≤ 120 chars; validated in mutation
    description: v.optional(v.string()),      // ≤ 1000 chars
    scheduledStartTime: v.number(),           // ms epoch
    scheduledDurationMin: v.number(),         // 15 / 30 / 45 / 60 / 90 / 120
    status: v.union(
      v.literal("scheduled"),
      v.literal("live"),
      v.literal("ended"),
      v.literal("cancelled"),
    ),
    // Stable identifier we pass to Daily.co. Deterministic (e.g. "coaching-<id>")
    // so the same call always maps to the same Daily room.
    dailyRoomName: v.string(),
    // Filled when the coach clicks Start and we create the Daily room.
    dailyRoomUrl: v.optional(v.string()),
    // Recording lifecycle — Daily records to their cloud; we poll for URL after end.
    recordingUrl: v.optional(v.string()),
    recordingStatus: v.optional(v.union(
      v.literal("recording"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
      v.literal("deleted"),  // coach or founder manually removed the recording
    )),
    actualStartTime: v.optional(v.number()),
    actualEndTime: v.optional(v.number()),
    cancelledReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_start", ["status", "scheduledStartTime"])
    .index("by_coach", ["coachUserId", "scheduledStartTime"])
    .index("by_daily_room", ["dailyRoomName"]),

  // Attendance log for coaching calls — powers analytics, kick enforcement,
  // and future RSVP features. One row per join event (users who leave + rejoin
  // get multiple rows; we use latest by joinedAt).
  b2cCoachingCallAttendance: defineTable({
    callId: v.id("b2cCoachingCalls"),
    userId: v.id("b2cUsers"),
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
    role: v.union(v.literal("coach"), v.literal("attendee")),
    kicked: v.optional(v.boolean()),
  })
    .index("by_call", ["callId"])
    .index("by_user", ["userId"])
    .index("by_call_user", ["callId", "userId"]),

  // B2C closer profiles (public-facing profile data)
  b2cProfiles: defineTable({
    userId: v.id("b2cUsers"),
    headline: v.optional(v.string()),
    bio: v.optional(v.string()),
    location: v.optional(v.string()),
    photoStorageId: v.optional(v.string()),
    industries: v.optional(v.array(v.string())),
    ticketRange: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    socialLinks: v.optional(v.object({
      linkedin: v.optional(v.string()),
      twitter: v.optional(v.string()),
      instagram: v.optional(v.string()),
      website: v.optional(v.string()),
      calendly: v.optional(v.string()),
    })),
    isPublic: v.boolean(),
    isAvailable: v.optional(v.boolean()),
    introVideoUrl: v.optional(v.string()),
    highlightReelUrl: v.optional(v.string()),
    whatsappNumber: v.optional(v.string()),
    // Manual stats + verification system
    manualStats: v.optional(v.object({
      callsCompleted: v.optional(v.number()),
      closeRate: v.optional(v.number()),
      cashCollected: v.optional(v.number()),
      avgDealSize: v.optional(v.number()),
      avgDuration: v.optional(v.number()),
      talkRatio: v.optional(v.number()),
    })),
    statsSource: v.optional(v.string()),        // "auto" | "manual"
    isManuallyVerified: v.optional(v.boolean()), // set by admin after pay stub review
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_public", ["isPublic"]),

  // B2C Stats Verification Requests — closers submit pay stub/CRM screenshots to
  // claim "Verified by Sequ3nce" on their public profile. Founders review and
  // approve/reject. Row per submission; history preserved through reject→resubmit cycles.
  b2cStatsVerificationRequests: defineTable({
    userId: v.id("b2cUsers"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    claimedStats: v.object({
      cashCollected: v.optional(v.number()),
      closeRate: v.optional(v.number()),
      callsCompleted: v.optional(v.number()),
    }),
    context: v.optional(v.string()),           // user note, 500 char cap
    payStubStorageIds: v.array(v.string()),    // 1-6, required
    crmStorageIds: v.array(v.string()),        // 0-4, optional
    submittedAt: v.number(),
    reviewedBy: v.optional(v.id("b2cUsers")),
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    inboxThreadId: v.optional(v.id("b2cDirectMessageThreads")),
  })
    .index("by_user", ["userId", "submittedAt"])
    .index("by_user_pending", ["userId", "status"])
    .index("by_status_submitted_at", ["status", "submittedAt"]),

  // B2C Highlight Clips — call clips showcased on public profiles
  b2cHighlightClips: defineTable({
    userId: v.id("b2cUsers"),
    callId: v.id("calls"),
    label: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    isFullCall: v.boolean(),
    blurRegion: v.string(), // "left" | "right" | "none"
    sortOrder: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "sortOrder"])
    .index("by_call", ["callId"]),

  // B2C Highlight Clip Shares — shareable URLs for individual clips
  b2cHighlightShares: defineTable({
    clipId: v.id("b2cHighlightClips"),
    userId: v.id("b2cUsers"),
    token: v.string(),                    // URL-safe 16-char base36
    isActive: v.boolean(),
    hasPassword: v.boolean(),
    passwordHash: v.optional(v.string()), // SHA-256 hex
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_clip", ["clipId"]),

  // B2C Content Submissions — user-generated clips & testimonials for marketing
  b2cContentSubmissions: defineTable({
    userId: v.id("b2cUsers"),
    type: v.union(v.literal("clip"), v.literal("testimonial")),
    // Clip-specific
    clipId: v.optional(v.id("b2cHighlightClips")),
    callId: v.optional(v.id("calls")),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    blurRegion: v.optional(v.string()),
    // Testimonial-specific
    videoUrl: v.optional(v.string()),
    // Shared fields
    label: v.string(),
    category: v.string(),
    note: v.optional(v.string()),
    paymentHandle: v.string(),
    paymentMethod: v.string(),
    consentGiven: v.boolean(),
    // Review
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("paid")),
    reviewedBy: v.optional(v.id("b2cUsers")),
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    paidAmount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_clip", ["clipId"]),

  // B2C Weekly Contests — Call of the Week voting system
  b2cWeeklyContests: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    prizeAmount: v.number(),
    status: v.string(), // "active" | "completed"
    createdBy: v.id("b2cUsers"),
    winnerId: v.optional(v.id("b2cUsers")),
    winnerSubmissionId: v.optional(v.id("b2cWeeklySubmissions")),
    weekStartDate: v.string(), // "2026-03-31" (Monday)
    weekEndDate: v.string(),   // "2026-04-06" (Sunday)
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_week", ["weekStartDate"]),

  b2cWeeklySubmissions: defineTable({
    contestId: v.id("b2cWeeklyContests"),
    userId: v.id("b2cUsers"),
    type: v.string(), // "highlight" | "share_link"
    clipId: v.optional(v.id("b2cHighlightClips")),
    shareUrl: v.optional(v.string()),
    title: v.string(),
    voteCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_contest", ["contestId"])
    .index("by_user_contest", ["userId", "contestId"]),

  b2cWeeklyVotes: defineTable({
    contestId: v.id("b2cWeeklyContests"),
    userId: v.id("b2cUsers"),
    submissionId: v.id("b2cWeeklySubmissions"),
    createdAt: v.number(),
  })
    .index("by_user_contest", ["userId", "contestId"])
    .index("by_submission", ["submissionId"]),

  // B2C Job Postings — created by B2B teams, browsed by B2C closers
  b2cJobPostings: defineTable({
    teamId: v.id("teams"),
    createdBy: v.string(),              // Clerk userId of the poster
    title: v.string(),
    description: v.string(),
    industry: v.optional(v.string()),
    ticketRange: v.optional(v.string()),
    ote: v.optional(v.string()),        // e.g. "150k-250k OTE"
    requiredSkills: v.optional(v.array(v.string())),
    contactEmail: v.optional(v.string()),
    contactUrl: v.optional(v.string()),
    status: v.string(),                 // "open" | "closed"
    interestCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId", "status", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_status_industry", ["status", "industry", "createdAt"]),

  // B2C Job Interests — closer expressed interest in a job posting
  b2cJobInterests: defineTable({
    jobPostingId: v.id("b2cJobPostings"),
    b2cUserId: v.id("b2cUsers"),
    createdAt: v.number(),
  })
    .index("by_job", ["jobPostingId", "createdAt"])
    .index("by_user", ["b2cUserId", "createdAt"])
    .index("by_job_user", ["jobPostingId", "b2cUserId"]),

  // ============================================
  // B2C MULTI-CALENDAR — multiple Google Calendar connections per closer
  // ============================================

  // Each record represents one Google Calendar (or ICS feed) connection.
  // Closers can have up to 5 calendars, each labeled with an offer/company name
  // and color-coded for visual separation in the schedule view.
  b2cCalendars: defineTable({
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    label: v.string(),                              // user-provided: "Solar Co", "Coaching Inc"
    color: v.string(),                              // hex color from preset palette
    provider: v.string(),                           // "google" | "ics"
    googleRefreshToken: v.optional(v.string()),      // Google OAuth refresh token
    googleEmail: v.optional(v.string()),             // Google account email (for display + dupe detection)
    icsUrl: v.optional(v.string()),                  // ICS feed URL (fallback method)
    isEnabled: v.boolean(),                          // toggle visibility in schedule
    lastSyncAt: v.optional(v.number()),
    syncError: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_closer", ["closerId"]),

  // ============================================
  // B2C PUBLIC JOB BOARD — curated external jobs
  // ============================================

  // Jobs curated by founders from LinkedIn/Indeed/etc.
  b2cPublicJobs: defineTable({
    companyName: v.string(),
    title: v.string(),
    location: v.string(),
    salaryRange: v.optional(v.string()),
    industry: v.string(),
    description: v.optional(v.string()),
    applyUrl: v.string(),
    source: v.optional(v.string()),    // "LinkedIn", "Indeed", "Direct", "Other"
    addedBy: v.id("b2cUsers"),
    status: v.string(),                // "active" | "closed"
    // Bulk-import additions (May 2026 — VA-scraped job batch). All
    // optional so existing rows added through the manual form continue
    // to validate without backfill.
    remote: v.optional(v.boolean()),
    jobType: v.optional(v.string()),         // "Full-time" | "1099" | "Contract" | "Part-time"
    experienceLevel: v.optional(v.string()), // "Entry" | "Mid" | "Senior"
    datePosted: v.optional(v.number()),      // Unix ms — when the company posted, not when we imported
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_industry", ["status", "industry", "createdAt"]),

  // Per-user tracking (Saved / Applied / Interviewed) for public jobs
  b2cPublicJobTracking: defineTable({
    jobId: v.id("b2cPublicJobs"),
    userId: v.id("b2cUsers"),
    saved: v.boolean(),
    applied: v.boolean(),
    interviewed: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_user_job", ["userId", "jobId"])
    .index("by_user", ["userId"]),

  // ============================================
  // B2C COMMUNITY — Feature Requests, Bug Reports
  // ============================================

  // Feature requests with upvoting (one vote per user per request)
  b2cFeatureRequests: defineTable({
    authorId: v.id("b2cUsers"),
    authorName: v.string(),
    authorPhotoStorageId: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    status: v.string(), // "open" | "planned" | "in_progress" | "shipped"
    upvoteCount: v.number(),
    commentCount: v.number(),
    isDeleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_upvotes", ["isDeleted", "upvoteCount"])
    .index("by_created", ["isDeleted", "createdAt"])
    .index("by_author", ["authorId", "createdAt"]),

  // One-vote-per-user-per-request enforcement
  b2cFeatureRequestVotes: defineTable({
    requestId: v.id("b2cFeatureRequests"),
    userId: v.id("b2cUsers"),
    createdAt: v.number(),
  })
    .index("by_user_request", ["userId", "requestId"])
    .index("by_request", ["requestId"]),

  // Private bug reports (structured form, only visible to the author + admins)
  b2cBugReports: defineTable({
    authorId: v.id("b2cUsers"),
    authorEmail: v.string(),
    whatHappened: v.string(),
    whatWereDoing: v.string(),
    whichScreen: v.string(),
    appVersion: v.optional(v.string()),
    platform: v.optional(v.string()),
    status: v.string(), // "new" | "reviewed" | "fixed"
    createdAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_author", ["authorId", "createdAt"]),

  // ============================================
  // SEQU3NCE STREAM — Wispr Flow-style dictation
  // ============================================

  // Per-user Stream preferences (hotkey binding, etc.)
  streamSettings: defineTable({
    b2cUserId: v.id("b2cUsers"),
    // Electron accelerator-style string, e.g. "Fn", "RightControl", "CommandOrControl+Shift+Space"
    hotkey: v.string(),
    // Track whether the user has completed first-run setup (so we can route them to Settings tab once)
    hasCompletedOnboarding: v.optional(v.boolean()),
    // Master on/off switch — defaults false until user explicitly enables. When false the Fn hotkey
    // hook does not run and no audio is captured.
    enabled: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["b2cUserId"]),

  // Rolling history of dictated transcriptions (capped at 500 per user via pruning in actions)
  streamTranscriptions: defineTable({
    b2cUserId: v.id("b2cUsers"),
    text: v.string(),
    durationSec: v.optional(v.number()), // Length of audio clip in seconds
    createdAt: v.number(),
  }).index("by_user_and_date", ["b2cUserId", "createdAt"]),

  // ============================================
  // B2C LEADS — captured on landing page before download
  // ============================================

  // Warm leads from the /personal landing page. Captured when users click
  // "Download" — email is used for Refgrow affiliate attribution, phone
  // is for sales team follow-up.
  b2cLeads: defineTable({
    email: v.string(),
    phone: v.string(),
    firstName: v.optional(v.string()), // collected from landing-page form
    lastName: v.optional(v.string()),
    source: v.optional(v.string()),   // which button: "hero", "nav", "pricing", "cta"
    refParam: v.optional(v.string()), // raw ?ref= value from affiliate link
    createdAt: v.number(),
    updatedAt: v.number(),
    // GHL (GoHighLevel) sync state — set by the b2cGhl.syncLeadToGHL action.
    // Status lifecycle: pending → synced | failed. A cron retries failed rows.
    ghlContactId: v.optional(v.string()),
    ghlSyncStatus: v.optional(
      v.union(v.literal("pending"), v.literal("synced"), v.literal("failed"))
    ),
    ghlSyncedAt: v.optional(v.number()),
    ghlLastError: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_sync_status", ["ghlSyncStatus"]),

  // ==================== Objection Playbook ====================
  // Community library of sales rebuttals. Populated by the Objection Battle
  // Royale in-call game (winner auto-saves) and by coach manual additions.
  b2cObjectionPlaybook: defineTable({
    rebuttalText: v.string(),                          // <= 1000 chars
    objectionText: v.string(),                         // <= 500 chars — the prompt this rebuttal answers
    authorUserId: v.optional(v.id("b2cUsers")),        // null if coach added a "classic" rebuttal manually
    authorName: v.string(),                            // denormalized for display
    tags: v.array(v.string()),                         // ["price", "timing", "authority", "competitor", ...]
    sourceCallId: v.optional(v.id("b2cCoachingCalls")), // the coaching call a Battle Royale ran in
    voteCount: v.number(),                             // denormalized counter (source of truth = b2cPlaybookVotes)
    coachAnnotation: v.optional(v.string()),           // <= 500 chars — coach's context/framing
    featured: v.boolean(),                             // coach pin — stays at top of default list
    createdBy: v.id("b2cUsers"),                       // the coach who saved it (not necessarily the author)
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_featured_created", ["featured", "createdAt"])
    .index("by_votes", ["voteCount"])
    .index("by_created", ["createdAt"]),

  // Vote dedup — one row per (entry, user). voteCount on the entry is the
  // denormalized running total, atomically updated in the vote mutation.
  b2cPlaybookVotes: defineTable({
    entryId: v.id("b2cObjectionPlaybook"),
    userId: v.id("b2cUsers"),
    at: v.number(),
  })
    .index("by_entry_user", ["entryId", "userId"])
    .index("by_user", ["userId"]),

  // Per-user metadata for the adoption-checklist widget. Task COMPLETION is
  // not stored here — it's derived live from source-of-truth tables (profile,
  // calls, highlights, coaching attendance, stream entries). This row only
  // tracks UI lifecycle: when the user first encountered the widget, whether
  // they dismissed Setup, whether the popover has auto-opened yet, and the
  // last time the user "saw" Earn (used to decide red-dot visibility).
  b2cAdoptionChecklist: defineTable({
    userId: v.id("b2cUsers"),
    firstSeenAt: v.number(),
    setupDismissedAt: v.optional(v.number()),
    setupCompletedAt: v.optional(v.number()),
    setupAutoOpenedAt: v.optional(v.number()),
    earnRedDotLastSeenAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"]),

  // Tracks replay-watch progress per (user, coaching call). Used by the
  // adoption-checklist "join coaching call OR watch a replay" task. The
  // ReplayPlayerModal fires a throttled upsert every 10s while playing.
  // A row with watchedSeconds >= 30 satisfies the task.
  b2cCoachingReplayWatched: defineTable({
    userId: v.id("b2cUsers"),
    callId: v.id("b2cCoachingCalls"),
    watchedSeconds: v.number(),
    firstWatchedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_call", ["userId", "callId"]),

  // ============================================================================
  // Setter Data — B2B feature for sales managers to track setter performance
  // via a private GoHighLevel Marketplace App. See docs/SETTER-DATA-SPEC.md.
  // ============================================================================

  // OAuth tokens for the GHL Marketplace App, one row per team. Tokens are
  // encrypted via lib/encrypt.ts. The two-phase backfill progress fields let
  // us show "5 of 12 months synced" UI and let the deep-backfill cron find
  // pending work without scanning every installation.
  setterGhlInstallations: defineTable({
    teamId: v.id("teams"),
    // CRM provider discriminator. Optional for backward-compat: existing rows
    // predate Close support — a null provider is treated as "ghl" everywhere
    // (a one-time migration backfills them). New GHL installs set "ghl";
    // Close installs set "close".
    provider: v.optional(v.union(v.literal("ghl"), v.literal("close"))),
    // GHL identifiers (present for provider="ghl")
    locationId: v.string(),                // sub-account ID
    locationName: v.optional(v.string()),
    companyId: v.optional(v.string()),
    // Close identifier (present for provider="close"). The Close organization
    // id (from /me/). GHL-specific fields (locationId/refreshToken/expiresAt/
    // scopes) hold benign placeholders for Close rows so we don't have to
    // relax their types across the GHL codebase; the encrypted Close API key
    // is stored in `accessToken`, and `locationName` holds the org name.
    closeOrganizationId: v.optional(v.string()),
    // Funnel characterization captured at Close connect-time (from
    // setterCloseConnect.detectFunnel). Powers the dashboard's "here's what we
    // detected about your funnel" transparency summary without re-probing.
    closeFunnel: v.optional(v.any()),
    // OAuth tokens — both encrypted (AES-256-GCM via encryptApiKey).
    // For Close: accessToken holds the encrypted API key; refreshToken holds a
    // placeholder (Close keys don't expire/refresh); expiresAt is far-future.
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),                 // Unix ms — when access_token expires
    // Scopes granted at install (lets us detect a re-install with different scopes)
    scopes: v.array(v.string()),
    // Lifecycle
    installedAt: v.number(),
    lastRefreshedAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    status: v.union(
      v.literal("active"),
      v.literal("error"),
      v.literal("uninstalled"),
    ),
    errorMessage: v.optional(v.string()),
    errorAt: v.optional(v.number()),
    // Two-phase backfill progress. fastBackfill (last 90 days) runs on install
    // and gets the dashboard usable in 5–10 min. deepBackfill extends backward
    // one month at a time up to 12 months total via a cron — gives new
    // customers a year of history within 24–48h without blocking install.
    fastBackfillCompletedAt: v.optional(v.number()),
    deepBackfillLastCompletedMonth: v.optional(v.number()), // 0–12 (3 = 90d done)
    deepBackfillCompletedAt: v.optional(v.number()),
    deepBackfillError: v.optional(v.string()),
    // Auto-detected after consecutive `not_available` results from GHL's
    // transcription endpoint. When true, fetchAndProcessTranscript skips
    // scheduling new fetches for this team to save API calls. Cleared
    // automatically when a transcript IS returned later (customer flipped
    // it on in GHL) or after 7 days (re-detect in case settings changed).
    transcriptionDisabled: v.optional(v.boolean()),
    transcriptionDisabledAt: v.optional(v.number()),
  })
    .index("by_team", ["teamId"])
    .index("by_location", ["locationId"])
    .index("by_team_and_status", ["teamId", "status"])
    // Used by the deep-backfill extender cron to find installations with
    // pending work — query for null deepBackfillCompletedAt where status=active.
    .index("by_status_and_deep_backfill_completed", [
      "status",
      "deepBackfillCompletedAt",
    ]),

  // Synced GHL users (sub-account members). Setters are identified here by
  // their GHL user id; we never have a Sequ3nce user record for them.
  // isActive flips false when a user disappears from GHL between syncs;
  // we keep the row so historical metrics still resolve their name.
  setterReps: defineTable({
    teamId: v.id("teams"),
    ghlUserId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    ghlRole: v.optional(v.string()),
    isActive: v.boolean(),
    lastSeenInSyncAt: v.number(),
    // Phase 2 — Setter Scorecard tenure tracking.
    // firstSeenAt: set on first GHL sync that surfaces this rep. Never
    //   overwritten. Used as the canonical "joined our system" date for
    //   ramping vs stabilized auto-detection (60-day threshold).
    // stabilizedAt: manual override. When set, isStabilized = now >= this.
    //   Defaults to null — fall back to auto-detect via firstSeenAt.
    firstSeenAt: v.optional(v.number()),
    stabilizedAt: v.optional(v.number()),
  })
    .index("by_team", ["teamId"])
    .index("by_team_and_ghl_user_id", ["teamId", "ghlUserId"]),

  // Phase 1 — daily ad spend rollup per ad creative per platform.
  // Populated by adSpend.ts daily-sync cron. Joined to Hyros-attributed
  // setterLeads via adSourceId (Hyros's adSource.adSourceId === Meta's
  // ad ID) to produce per-closer ROI in getCloserRoi.
  //
  // Stored in cents to avoid float drift. One row per (team, date,
  // platform, adSourceId).
  adSpendDaily: defineTable({
    teamId: v.id("teams"),
    date: v.string(),                          // "YYYY-MM-DD" in UTC
    platform: v.string(),                      // "facebook" | "google" | ...
    adAccountId: v.optional(v.string()),       // Meta ad account id
    adSourceId: v.optional(v.string()),        // Meta ad id — matches Hyros adSource.adSourceId
    sourceLinkName: v.optional(v.string()),    // human-readable creative name
    spendCents: v.number(),
    impressions: v.optional(v.number()),
    clicks: v.optional(v.number()),
    source: v.string(),                        // "meta_ads" (Meta API) | "manual" | future "google_ads"
    ingestedAt: v.number(),
  })
    .index("by_team_and_date", ["teamId", "date"])
    .index("by_team_and_platform_and_date", ["teamId", "platform", "date"])
    .index("by_ad_source_and_date", ["adSourceId", "date"]),

  // Synced GHL contacts (the "leads" the setters work). Snapshot fields are
  // denormalized projections of setterLeadEvents — they're recomputed on
  // every event-driven mutation so reads (the leads table view) stay fast.
  // Source-of-truth is the events table; this is the read model.
  setterLeads: defineTable({
    teamId: v.id("teams"),
    ghlContactId: v.string(),
    // Identity
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    /** email, trimmed + lowercased — exists so booking matching can do an
     *  indexed point lookup instead of scanning 20k leads per query. Stamped
     *  at ingest; backfilled per team on demand. */
    emailNorm: v.optional(v.string()),
    /** A team member living in the CRM as a contact, not a prospect. Set
     *  manually (support CLI). Excluded from every setter metric — the first
     *  real org had its OWNER as the top-"booked" lead with 182 internal
     *  meetings counted as bookings. */
    isInternal: v.optional(v.boolean()),
    phone: v.optional(v.string()),
    // GHL metadata
    dateAdded: v.number(),                 // GHL-side timestamp, NOT receipt time
    source: v.optional(v.string()),
    sourceDetail: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    assignedToGhlUserId: v.optional(v.string()),
    assignedToName: v.optional(v.string()),
    // Computed snapshot fields (rebuilt by event handlers, not by upserts)
    dialCount: v.number(),
    firstDialAt: v.optional(v.number()),
    // Provider user id of whoever made the chronologically-FIRST dial.
    // Lead-ownership fallback for per-setter set rate when the CRM's
    // assignedTo is blank. Maintained with min-time semantics in
    // recordCallEvent (backfills replay events newest-first).
    firstDialByUserId: v.optional(v.string()),
    // Close-only: when the enrichment pass (GET /lead/{id} → name/email/
    // phone + true date_created) last processed this lead. Explicit marker —
    // inferring "needs enrichment" from a missing name breaks when the
    // meetings backpatch names a lead first. Unset on GHL leads.
    enrichedAt: v.optional(v.number()),
    lastDialAt: v.optional(v.number()),
    // Chronologically-first outbound SMS (min-time semantics, like
    // firstDialAt). Powers pre-call qualification from snapshots instead of
    // team-wide event scans.
    firstSmsOutboundAt: v.optional(v.number()),
    smsOutboundCount: v.number(),
    smsInboundCount: v.number(),
    smsStatus: v.union(
      v.literal("none"),    // no SMS either way
      v.literal("sent"),    // outbound sent, no inbound reply yet
      v.literal("replied"), // inbound after outbound
    ),
    isConnected: v.boolean(),              // any call >= team threshold sec
    connectedAt: v.optional(v.number()),
    connectedCallDurationSec: v.optional(v.number()),
    appointmentCount: v.number(),          // populated in Phase 2 (setterAppointments)
    showedCount: v.number(),
    noShowCount: v.number(),
    // Bookkeeping
    lastActivityAt: v.optional(v.number()),
    lastSyncedAt: v.number(),
    // Hyros read direction (Phase 5) — denormalized first-touch and
    // last-touch attribution from Hyros. Populated by either the inbound
    // hyrosWebhook handler (real-time on lead.opted.in) or the
    // setter-hyros-attribution-poll cron (reconciliation backstop). UI
    // groups the Lead Sources panel by trafficSource when present,
    // falling back to lead.source for non-Hyros customers.
    hyrosFirstSource: v.optional(
      v.object({
        trafficSource: v.string(),
        trafficSourceCategory: v.optional(v.string()),
        adSourceId: v.optional(v.string()),
        adSourcePlatform: v.optional(v.string()),
        adAccountId: v.optional(v.string()),
        sourceLinkId: v.optional(v.string()),
        sourceLinkName: v.optional(v.string()),
        sourceLinkAdId: v.optional(v.string()),
        clickDate: v.optional(v.number()),
        organic: v.optional(v.boolean()),
      }),
    ),
    hyrosLastSource: v.optional(
      v.object({
        trafficSource: v.string(),
        trafficSourceCategory: v.optional(v.string()),
        adSourceId: v.optional(v.string()),
        adSourcePlatform: v.optional(v.string()),
        adAccountId: v.optional(v.string()),
        sourceLinkId: v.optional(v.string()),
        sourceLinkName: v.optional(v.string()),
        sourceLinkAdId: v.optional(v.string()),
        clickDate: v.optional(v.number()),
        organic: v.optional(v.boolean()),
      }),
    ),
    hyrosAttributionFetchedAt: v.optional(v.number()),
    hyrosAttributionStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("found"),
        v.literal("not_found"),
      ),
    ),
  })
    .index("by_team", ["teamId"])
    .index("by_team_and_assigned", ["teamId", "assignedToGhlUserId"])
    .index("by_team_and_connected", ["teamId", "isConnected"])
    .index("by_team_and_date_added", ["teamId", "dateAdded"])
    .index("by_team_and_ghl_contact_id", ["teamId", "ghlContactId"])
    .index("by_team_and_last_activity", ["teamId", "lastActivityAt"])
    .index("by_team_and_hyros_status", ["teamId", "hyrosAttributionStatus"])
    .index("by_team_and_email_norm", ["teamId", "emailNorm"])
    .index("by_team_and_internal", ["teamId", "isInternal"]),

  // Append-only event log. Source of truth for all per-lead activity. Powers
  // time-series reports (working hours heatmap, source attribution trends,
  // per-setter funnel over time) that snapshot fields can't express.
  // Idempotency: ghlEventKey holds the GHL message/event id where available;
  // by_ghl_event_key index lets handlers skip duplicate webhook deliveries.
  setterLeadEvents: defineTable({
    teamId: v.id("teams"),
    ghlContactId: v.string(),
    // Denormalized lead pointer — null until the lead row exists (rare race
    // when an event arrives before Contact.Create is processed).
    setterLeadId: v.optional(v.id("setterLeads")),
    eventType: v.union(
      v.literal("dial_outbound"),
      v.literal("call_inbound"),
      v.literal("sms_outbound"),
      v.literal("sms_inbound"),
      v.literal("connected"),                 // first call >= threshold
      v.literal("appointment_booked"),        // Phase 2
      v.literal("appointment_status_change"), // Phase 2
      v.literal("opportunity_stage_change"),  // Phase 3
      v.literal("contact_assigned"),
    ),
    occurredAt: v.number(),                   // GHL timestamp, NOT receipt
    ghlUserId: v.optional(v.string()),        // who performed the action
    // Polymorphic payload — shape depends on eventType. Examples:
    //   dial_outbound      → { callDurationSec, conversationId, messageId }
    //   sms_outbound       → { conversationId, messageId, body? }
    //   appointment_booked → { appointmentId, calendarId, startTime, status }
    details: v.optional(v.any()),
    // Idempotency: GHL message/event id where applicable. Looked up via
    // by_ghl_event_key before insert — duplicate deliveries become no-ops.
    ghlEventKey: v.optional(v.string()),
  })
    .index("by_team_and_contact", ["teamId", "ghlContactId"])
    .index("by_team_and_type_and_time", ["teamId", "eventType", "occurredAt"])
    .index("by_team_and_setter_and_time", ["teamId", "ghlUserId", "occurredAt"])
    .index("by_ghl_event_key", ["ghlEventKey"]),

  // Per-call transcripts pulled from GHL's
  // /conversations/locations/:locationId/messages/:messageId/transcription
  // endpoint. Stored in a separate table (NOT inline on setterLeadEvents)
  // so the existing aggregate queries on dial activity don't pay the
  // blob-read cost — same lesson as the getCloserStats 16 MiB fix
  // (commit f52e382). Each row is keyed by the GHL messageId so
  // re-running the fetch is idempotent.
  //
  // A row is inserted with transcriptionStatus="pending" the moment a
  // dial_outbound or call_inbound event is recorded. A scheduled action
  // (internal.ai.fetchAndProcessTranscript) then attempts the GHL fetch
  // and flips the status. Transcription is a paid GHL add-on, so many
  // calls will legitimately return 400 "Transcription does not exist"
  // — those rows stay at status="not_available" forever (not a retry).
  setterCallTranscripts: defineTable({
    teamId: v.id("teams"),
    ghlContactId: v.string(),
    ghlMessageId: v.string(),                 // joins to setterLeadEvents.ghlEventKey = "msg:<id>"
    direction: v.union(v.literal("outbound"), v.literal("inbound")),
    occurredAt: v.number(),
    durationSec: v.optional(v.number()),
    // Raw GHL transcript JSON serialized as a string (typical size 5-100KB).
    // Stored verbatim so we never re-fetch even if our parsing changes.
    transcriptJson: v.optional(v.string()),
    transcriptionStatus: v.union(
      v.literal("pending"),                   // fetch scheduled, not yet attempted
      v.literal("available"),                 // fetched + parsed + stored
      v.literal("not_available"),             // GHL returned 400 — customer hasn't enabled transcription
      v.literal("failed"),                    // transient (5xx / network) — retried by reconcile cron
    ),
    fetchedAt: v.optional(v.number()),
    fetchAttempts: v.optional(v.number()),    // bounded retries — give up after ~5
    lastFetchError: v.optional(v.string()),
    // First time we got GHL 400 "Transcription does not exist" for this row.
    // GHL transcribes calls asynchronously and can lag behind the webhook by
    // minutes-to-hours, so we keep retrying not_available rows for up to 24h
    // before accepting the verdict permanently. Preserved across retries so
    // the 24h window is anchored to the first 400, not the most recent.
    notAvailableFirstSeenAt: v.optional(v.number()),
    // AI summary (3-5 bullet points) generated from the transcript by
    // internal.ai.generateSetterCallSummary. Populated asynchronously
    // after transcriptionStatus flips to "available"; UI gracefully
    // degrades to "Summary unavailable" when missing.
    aiSummary: v.optional(v.string()),
    aiSummaryAt: v.optional(v.number()),
    // Talk-time data, units matching the closer-side calls.closerTalkTime
    // for future cross-feature consistency. Computed from per-word
    // start/end timings in the raw transcript.
    setterTalkTimeSec: v.optional(v.number()),
    prospectTalkTimeSec: v.optional(v.number()),
    // Heuristic guess of which GHL speaker index is the setter (0 or 1).
    // Null when the heuristic abstained (no clear signal from the first
    // few seconds); the UI renders "Speaker A / Speaker B" without
    // setter/prospect labels in that case.
    setterSpeakerIndex: v.optional(v.union(v.literal(0), v.literal(1))),
  })
    .index("by_team_and_message", ["teamId", "ghlMessageId"])
    .index("by_team_and_contact_and_time", ["teamId", "ghlContactId", "occurredAt"])
    .index("by_team_and_status", ["teamId", "transcriptionStatus"]),

  // Raw webhook payload audit log — forensic only, NOT a data source for
  // reports. Pruned at 30 days by a daily cron. signatureValid is set false
  // for any payload that fails Ed25519 verification (those rows are kept
  // longer-term forensic value: did someone try to spoof us?).
  setterWebhookEvents: defineTable({
    teamId: v.optional(v.id("teams")),         // null if locationId didn't resolve
    locationId: v.string(),
    ghlEventId: v.optional(v.string()),
    receivedAt: v.number(),
    eventType: v.string(),
    signatureValid: v.boolean(),
    processed: v.boolean(),
    processingError: v.optional(v.string()),
    processingDurationMs: v.optional(v.number()),
    payload: v.any(),                          // full body, capped at ~1MB
  })
    .index("by_received_at", ["receivedAt"])
    .index("by_team_and_received_at", ["teamId", "receivedAt"])
    .index("by_processed", ["processed"]),

  // Hyros webhook audit log (Phase 5 read direction). Raw payload is
  // stored BEFORE any parsing logic so we can iterate on shape mismatches
  // without losing data. Mirrors setterWebhookEvents's pattern. Pruned at
  // 30 days by a follow-up cron (same pattern as pruneWebhookAudit).
  hyrosWebhookEvents: defineTable({
    teamId: v.optional(v.id("teams")),
    eventType: v.string(),
    rawPayload: v.string(),
    signatureValid: v.boolean(),
    receivedAt: v.number(),
    processed: v.boolean(),
    processError: v.optional(v.string()),
    // Dedup hash so retried deliveries become no-ops. sha256 of payload.
    payloadHash: v.optional(v.string()),
  })
    .index("by_received_at", ["receivedAt"])
    .index("by_team_and_received_at", ["teamId", "receivedAt"])
    .index("by_processed", ["processed"])
    .index("by_payload_hash", ["payloadHash"]),

  // Phase 2 — Synced GHL appointments. Setter "show rate" is computed
  // off this table: of the appointments a setter booked, how many
  // resulted in status=Showed vs No Show. Lead-level snapshot fields
  // (appointmentCount, showedCount, noShowCount on setterLeads) are
  // recomputed by the appointment webhook handlers on every status
  // transition.
  //
  // bookedByGhlUserId vs assignedToGhlUserId: in GHL's data model the
  // person who BOOKED the appointment (typically the setter) and the
  // person it's ASSIGNED to (typically the closer who runs the call)
  // can be different. We track both — show rate metrics use bookedBy.
  setterAppointments: defineTable({
    teamId: v.id("teams"),
    ghlAppointmentId: v.string(),
    ghlContactId: v.string(),
    ghlCalendarId: v.optional(v.string()),
    bookedByGhlUserId: v.optional(v.string()),
    assignedToGhlUserId: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    // GHL appointment statuses — verbatim from their workflow doc.
    // (Close meetings map into this enum: upcoming/completed→Confirmed,
    // declined-by-*→Cancelled — Close's "completed" only means the time
    // passed, never "Showed".)
    status: v.union(
      v.literal("Confirmed"),
      v.literal("Showed"),
      v.literal("No Show"),
      v.literal("Cancelled"),
      v.literal("Invalid"),
      v.literal("Unconfirmed"),
    ),
    // Raw provider-side status (e.g. Close "completed"/"declined-by-lead")
    // for transparency/debugging. GHL rows omit it.
    providerStatus: v.optional(v.string()),
    bookedAt: v.number(),
    lastUpdatedAt: v.number(),
    /**
     * Attendance verdict — what actually happened at this appointment,
     * classified automatically (nightly sweep + CRM-status stamping) or by a
     * human. `manual` outranks everything and is never overwritten by
     * automation, mirroring the speaker-flip contract. Absent = not yet
     * classified (pre-feature rows, future slots, non-beta teams).
     */
    attendance: v.optional(v.union(
      v.literal("showed"),
      v.literal("no_show"),
      v.literal("cancelled"),
      v.literal("rescheduled"),
      v.literal("unverifiable"),
    )),
    /** Who produced the verdict — the outcomeSource pattern. */
    attendanceSource: v.optional(v.union(
      v.literal("crm_status"),
      v.literal("call_evidence"),
      v.literal("reschedule_link"),
      v.literal("assumed"),
      v.literal("manual"),
    )),
    attendanceAt: v.optional(v.number()),
    /** Evidence pointer when attendanceSource is call_evidence. */
    attendanceCallId: v.optional(v.id("calls")),
    /** The rebook this cancelled appointment turned into — makes a
     *  reschedule a TRANSITION between rows, not a terminal state. */
    rescheduledToAppointmentId: v.optional(v.id("setterAppointments")),
  })
    .index("by_team", ["teamId"])
    .index("by_team_and_setter", ["teamId", "bookedByGhlUserId"])
    .index("by_team_and_status", ["teamId", "status"])
    .index("by_team_and_contact", ["teamId", "ghlContactId"])
    .index("by_team_and_start_time", ["teamId", "startTime"])
    // Range-bounded "bookings in window" reads (replaces the old all-time
    // by_team collect in the scorecard — that scan grew with org lifetime).
    .index("by_team_and_booked_at", ["teamId", "bookedAt"])
    // Idempotency for webhook redeliveries — handlers look up by
    // ghlAppointmentId before insert.
    .index("by_team_and_appointment_id", ["teamId", "ghlAppointmentId"]),

  // ---------------------------------------------------------------------
  // Setter Data — daily rollup sidecar. One row per (team, UTC day, setter)
  // so per-setter dial/connect counts read ≤ days×setters docs at ANY range
  // instead of scanning every setterLeadEvents row (Convex caps a
  // transaction at 32k documents scanned — a 90-day event scan on a large
  // org exceeds it). Per-SETTER rows (not one team-day doc) keep OCC write
  // contention per-dialer; setterId "" buckets unattributed dials so
  // sum(rows) equals true team totals. Maintained transactionally in
  // recordCallEvent; repaired/backfilled via setterRollups.recountDay.
  // ---------------------------------------------------------------------
  setterDailyStats: defineTable({
    teamId: v.id("teams"),
    dayKey: v.string(), // UTC "YYYY-MM-DD"
    setterId: v.string(), // provider user id; "" = unattributed
    dials: v.number(),
    connects: v.number(),
    callsInbound: v.number(),
  })
    .index("by_team_and_day", ["teamId", "dayKey"])
    .index("by_team_day_setter", ["teamId", "dayKey", "setterId"]),

  // Phase 3 — Cached pipeline metadata. Pipelines and their stages
  // change rarely; we cache the names so the UI doesn't have to make
  // a per-render API call to render a funnel chart with stage labels.
  // The full sync refreshes this table whenever opportunities are
  // synced and discovers a stageId we don't have a name for yet.
  setterPipelines: defineTable({
    teamId: v.id("teams"),
    ghlPipelineId: v.string(),
    name: v.string(),
    stages: v.array(
      v.object({
        ghlStageId: v.string(),
        name: v.string(),
        position: v.number(),
      }),
    ),
    lastSyncedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_and_pipeline_id", ["teamId", "ghlPipelineId"]),

  // Phase 3 — Synced GHL opportunities. The current-state mirror for
  // pipeline stage funnels. Stage transitions over time are tracked in
  // setterStageTransitions (separate append-only table) — this row is
  // patched in place as the opportunity moves through the pipeline.
  setterOpportunities: defineTable({
    teamId: v.id("teams"),
    ghlOpportunityId: v.string(),
    ghlContactId: v.string(),
    ghlPipelineId: v.string(),
    ghlStageId: v.string(),
    // GHL's opportunity status enum: open / won / lost / abandoned.
    // Stored as v.string() rather than a strict union so we don't need
    // a schema migration if GHL ever adds a new status.
    status: v.string(),
    monetaryValue: v.optional(v.number()),
    assignedToGhlUserId: v.optional(v.string()),
    name: v.optional(v.string()),
    source: v.optional(v.string()),
    dateAdded: v.number(),
    lastUpdatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_and_pipeline", ["teamId", "ghlPipelineId"])
    .index("by_team_and_setter", ["teamId", "assignedToGhlUserId"])
    .index("by_team_and_contact", ["teamId", "ghlContactId"])
    .index("by_team_and_stage", ["teamId", "ghlStageId"])
    .index("by_team_and_status", ["teamId", "status"])
    // Idempotency for webhook redeliveries.
    .index("by_team_and_opp_id", ["teamId", "ghlOpportunityId"]),

  // Phase 3 — Append-only stage transition log. GHL doesn't expose a
  // stage-history endpoint, so we synthesize one from Opportunity.Update
  // webhooks: when stageId changes, we record the transition with the
  // duration the opportunity spent in the previous stage. Powers the
  // "average time in each stage" metric and stage-progression-over-time
  // charts that current-state opportunities can't answer.
  setterStageTransitions: defineTable({
    teamId: v.id("teams"),
    ghlOpportunityId: v.string(),
    ghlContactId: v.string(),
    ghlPipelineId: v.string(),
    fromStageId: v.optional(v.string()),  // null on creation
    toStageId: v.string(),
    transitionedAt: v.number(),
    durationInPreviousStageSec: v.optional(v.number()),
    triggeredByGhlUserId: v.optional(v.string()),
  })
    .index("by_team", ["teamId"])
    .index("by_team_and_opportunity", ["teamId", "ghlOpportunityId"])
    .index("by_team_and_pipeline", ["teamId", "ghlPipelineId"])
    .index("by_team_and_to_stage", ["teamId", "toStageId"])
    .index("by_team_and_transitioned_at", ["teamId", "transitionedAt"]),

  // ==========================================================================
  // Who each CRM user is to us.
  //
  // Separate from `setterReps` deliberately. That table is synced from the CRM
  // and holds whoever the CRM currently returns — on one live team that is
  // eight people including the manager and a support account, while EIGHT other
  // user ids were making outbound touches without appearing in it at all
  // (people who have since left, most likely). A sync-owned table cannot hold a
  // human judgement, because the next sync would drop it.
  //
  // Three roles rather than a setter/not-setter flag, because closers dial too:
  // confirming a Zoom, chasing a no-show. That activity is real and worth
  // keeping — it just isn't setter performance, and averaging it into a setter
  // leaderboard is how the leaderboard stops meaning anything.
  // ==========================================================================
  setterRoleAssignments: defineTable({
    teamId: v.id("teams"),
    /** The CRM's user id, whichever CRM it came from. */
    crmUserId: v.string(),
    role: v.union(
      v.literal("setter"),
      v.literal("closer"),
      /** Managers, support accounts, integrations — real, and not sales floor. */
      v.literal("other"),
    ),
    /** Kept so a departed user still reads as a person, not an id. */
    displayName: v.optional(v.string()),
    assignedBy: v.optional(v.string()),
    assignedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_and_user", ["teamId", "crmUserId"]),

  // ==========================================================================
  // What a setter actually does here.
  //
  // Setter Data was built on one assumed funnel: lead arrives, setter dials it,
  // maybe texts it, meeting gets booked. Every business that works differently
  // gets quietly wrong numbers — a business whose setters live in Instagram DMs
  // currently records zero activity, because ghlMessageType.ts understands two
  // things and neither of them is a DM.
  //
  // A funnel binds our abstract slots (a lead arrived; someone reached out; a
  // meeting happened) to what those mean at ONE business. Metrics then read the
  // binding instead of assuming.
  //
  // Plural per team on purpose. A business running paid ads to a booking link
  // AND organic DMs has two funnels with different setter behaviour and
  // different definitions of good; modelling one funnel per business is exactly
  // how we hit this wall the first time.
  // ==========================================================================
  setterFunnels: defineTable({
    teamId: v.id("teams"),
    name: v.string(),
    /** Off by default so a half-configured funnel never reaches a dashboard. */
    active: v.boolean(),

    /**
     * The bindings. Each is `{ kind, params?, source, evidenceCount }`:
     *
     *   kind          which rule, from a deliberately small vocabulary
     *   params        rule-specific detail (which tag, which custom field)
     *   source        "detected" | "confirmed" | "manual" — confirmed means a
     *                 human looked at real rows and agreed
     *   evidenceCount how many real records back it, so nothing is ever
     *                 proposed on zero data (the funnel probe once concluded
     *                 "no power dialer" from a 100-record sample of an org
     *                 running 1,700 automated dials a day)
     *
     * `v.any()` here is deliberate and is NOT an absence of validation: the
     * shape is enforced in code by setterFunnels.ts on every write, the same
     * way extraction sanitises the model's output before storing it. A rigid
     * union in the schema is what made the old model unable to describe a
     * funnel it hadn't anticipated.
     */
    bindings: v.any(),

    /**
     * Which leads belong to this funnel. Absent = all of them, which is correct
     * for the single-funnel businesses that are the common case.
     */
    leadScope: v.optional(v.any()),

    /**
     * Outside these hours the clock stops for speed-style metrics. Without it a
     * lead arriving 11pm Friday and answered 9am Monday reads as a 58-hour
     * failure, which is the kind of number that makes a customer stop believing
     * the whole tab.
     */
    businessHours: v.optional(v.any()),

    /**
     * Bumped on every material change. Historical numbers stay attributable to
     * the definition that produced them — otherwise a funnel change silently
     * rewrites history and a chart lies with no way to tell why.
     */
    version: v.number(),
    /** English, shown to the manager for approval. The definition they agreed. */
    summary: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    approvedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_and_active", ["teamId", "active"]),

  // Founder/admin action audit trail. Impersonating a customer account is
  // the most powerful action in the app; every one is recorded here so
  // there's accountability (the whole reason this beats sharing logins).
  adminAuditLog: defineTable({
    action: v.string(), // e.g. "impersonate"
    targetClerkId: v.optional(v.string()),
    targetEmail: v.optional(v.string()),
    targetTeamId: v.optional(v.id("teams")),
    targetTeamName: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  // =========================================================================
  // Team Performance Sheet — closer-side daily scoreboard
  // Funnel: Slots -> Booked -> Taken -> Offers -> Closes -> Cash
  // =========================================================================

  /**
   * DERIVED per-closer daily rollup. Recomputed from `calls` + `calendarEvents`
   * by setterless recount (closerPerformanceRollups.recountCloserDay) — treat
   * every row as disposable: a recount overwrites it with absolute values.
   * Manual edits live in closerDailyOverrides so they survive recounts.
   *
   * dayKey is the TEAM-LOCAL date ("YYYY-MM-DD" in team.timezone), not UTC —
   * an 8pm call belongs to the day the rep worked it, which is what a daily
   * sales scoreboard means by "today".
   *
   * Exists (rather than aggregating calls on read) because the Year view
   * spans 12 months; Convex caps a transaction at 32k documents scanned.
   */
  closerDailyStats: defineTable({
    teamId: v.id("teams"),
    dayKey: v.string(),
    closerId: v.id("closers"),
    slots: v.number(),          // capacity: booked + open working time / call length
    booked: v.number(),         // calendar events classified as sales calls
    taken: v.number(),          // completed calls with an outcome
    offers: v.number(),         // calls where a price was pitched (contractValue > 0)
    closes: v.number(),         // outcome === "closed"
    cash: v.number(),           // sum cashCollected
    contractValue: v.number(),  // sum contractValue (commitments, not collected)
    // Calls we recorded where the closer never completed the post-call form.
    // Closes/Cash/Offers can only come from that form, so surfacing this
    // turns an invisible data gap into a visible coaching prompt.
    missingOutcomes: v.optional(v.number()),
    /**
     * Whether we could actually observe this closer's free time on this day.
     * False when they have no calendar of their own to read, in which case
     * `slots` falls back to bookings and Booked% would be a meaningless 100%.
     * The dashboard suppresses the rate rather than assert a number we
     * invented. Undefined on rows written before this field existed.
     */
    capacityKnown: v.optional(v.boolean()),
    /**
     * The capacity inputs behind `slots`, kept so a manager can see WHY a
     * Booked% is low. A rep who leaves 7h open and books 36% of it is a
     * different problem from one who works a tight 3h window and books 60%,
     * and the rate alone cannot tell them apart.
     */
    blockedMinutes: v.optional(v.number()),
    openMinutes: v.optional(v.number()),
    recountedAt: v.number(),
  })
    .index("by_team_and_day", ["teamId", "dayKey"])
    .index("by_team_day_closer", ["teamId", "dayKey", "closerId"]),

  /**
   * MANUAL overrides for a given closer-day. Never written by the recount.
   * Any field present here wins over the derived value at read time, and the
   * UI marks the cell as edited. This is how a manager corrects a number the
   * automation got wrong without us losing the underlying measurement.
   */
  closerDailyOverrides: defineTable({
    teamId: v.id("teams"),
    dayKey: v.string(),
    closerId: v.id("closers"),
    slots: v.optional(v.number()),
    booked: v.optional(v.number()),
    taken: v.optional(v.number()),
    offers: v.optional(v.number()),
    closes: v.optional(v.number()),
    cash: v.optional(v.number()),
    updatedByClerkId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_team_and_day", ["teamId", "dayKey"])
    .index("by_team_day_closer", ["teamId", "dayKey", "closerId"]),

  /**
   * Team-level daily figures that genuinely belong to nobody in particular.
   * Bookings on a SHARED calendar can't always be attributed to one closer
   * (teams often subscribe to each other's calendars), and inventing an
   * owner would corrupt per-rep numbers. These land here instead so team
   * totals stay correct while per-closer stays honest.
   */
  closerDailyTeamStats: defineTable({
    teamId: v.id("teams"),
    dayKey: v.string(),
    bookedUnattributed: v.number(),
    /**
     * Of the unattributed bookings, those whose title names a rep who holds
     * no Sequ3nce seat. Lets the dashboard say "210 bookings belong to
     * Callum B, who isn't on Sequ3nce" instead of showing an anonymous gap —
     * the difference between a data defect and an actionable roster fact.
     */
    unknownReps: v.optional(
      v.array(v.object({ name: v.string(), count: v.number() })),
    ),
    recountedAt: v.number(),
  }).index("by_team_and_day", ["teamId", "dayKey"]),

  /**
   * What a closer reported for one of their days.
   *
   * Sits between the derived rollup and manager corrections:
   *
   *     manager override  >  closer entry  >  measured
   *
   * A separate table rather than writing into closerDailyOverrides, because a
   * manager correcting a rep must not destroy what the rep originally said —
   * the gap between the two is the signal a manager acts on.
   *
   * Fields are optional so a closer can report the parts they know. A row with
   * confirmedAt and no changed values means "I looked, the measured numbers
   * are right" — which is different from never having opened the day, and the
   * board counts only days that have a row.
   */
  closerDailyEntries: defineTable({
    teamId: v.id("teams"),
    dayKey: v.string(), // team-local "YYYY-MM-DD"
    closerId: v.id("closers"),
    slots: v.optional(v.number()),
    booked: v.optional(v.number()),
    taken: v.optional(v.number()),
    offers: v.optional(v.number()),
    closes: v.optional(v.number()),
    cash: v.optional(v.number()),
    /** Total contract value written, so avg DEAL size is distinguishable from
     *  avg cash collected — a $12k contract with $3k upfront is not a $3k deal. */
    contractValue: v.optional(v.number()),
    /** Set whenever the closer submits the day, changed or unchanged. */
    confirmedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team_and_day", ["teamId", "dayKey"])
    .index("by_team_day_closer", ["teamId", "dayKey", "closerId"])
    // The desktop app reads one closer's own month.
    .index("by_closer_and_day", ["closerId", "dayKey"]),

  /**
   * Ad spend recorded against a specific month.
   *
   * teams.closerAdSpendMonthly is a single CURRENT figure, so applying it to
   * past months made the Year view assert things that never happened — nine
   * dormant months each showing a $62k loss, and a half-month of data charged
   * a full month's spend, putting cost-per-booked at $1,107 against $153 the
   * month after.
   *
   * A row here is what was ACTUALLY spent that month. Months with no row fall
   * back to the team default, so nothing breaks for teams that never set it
   * and the Year view can say which months are recorded and which are assumed.
   */
  closerAdSpend: defineTable({
    teamId: v.id("teams"),
    monthKey: v.string(), // "YYYY-MM", team-local
    amount: v.number(),
    updatedAt: v.number(),
    updatedByClerkId: v.optional(v.string()),
  }).index("by_team_and_month", ["teamId", "monthKey"]),

  /**
   * Per-closer monthly cash goal, keyed by month so history stays truthful —
   * the Year view compares each month against the goal that was actually set
   * at the time, not today's number.
   */
  closerGoals: defineTable({
    teamId: v.id("teams"),
    closerId: v.id("closers"),
    monthKey: v.string(), // "YYYY-MM", team-local
    cashGoal: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team_and_month", ["teamId", "monthKey"])
    .index("by_team_month_closer", ["teamId", "monthKey", "closerId"]),

  // ==========================================================================
  // Manager Mode
  //
  // A sales manager's own meetings: one-to-ones, team meetings, leadership
  // calls and interviews. None of them is a sales call, and none of them may
  // ever reach a close rate.
  //
  // These are separate tables rather than a manager flag on `closers` and
  // `calls`, and the reason is arithmetic. 83 places in this codebase
  // enumerate closers, 57 of them scoped by team — leaderboards, seat counts
  // for billing, the end-of-day nudge, the daily scoreboard, the team page. A
  // manager hidden among closers needs an exclusion at every single one, and a
  // missed one shows up as a manager on a leaderboard or an extra seat on an
  // invoice. Worse, it stays a trap for anyone writing a new query next year.
  //
  // Nothing here can leak, because no closer-scoped query can reach a table
  // that has no closerId in it.
  // ==========================================================================

  /**
   * One-time tokens for starting a manager's Google OAuth flow.
   *
   * The OAuth callback runs on our Next.js server and reaches Convex through
   * ConvexHttpClient, which can only call PUBLIC functions. So the mutation
   * that stores a refresh token is necessarily public — and a public mutation
   * taking `(userId, refreshToken)` would let anyone point any manager's
   * calendar at a Google account they control, or wipe a real connection.
   *
   * The closer equivalent has precisely that hole. Rather than copy it: the
   * signed-in manager mints a nonce, it travels through Google as the OAuth
   * `state`, and the callback spends it. Single use, short lived, and it
   * carries the identity so the callback never has to be told who to trust.
   */
  managerOAuthNonces: defineTable({
    nonce: v.string(),
    userId: v.id("users"),
    createdAt: v.number(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  }).index("by_nonce", ["nonce"]),

  /** Which of a manager's Google calendars we watch. */
  managerCalendarSubscriptions: defineTable({
    userId: v.id("users"),
    teamId: v.id("teams"),
    /**
     * Google's own identifier for the calendar. We send this straight to
     * their API, so it is never rewritten by us — if a Workspace is renamed,
     * Google reissues these and the connection has to be remade.
     */
    googleCalendarId: v.string(),
    label: v.string(),
    enabled: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_team", ["teamId"]),

  /** Upcoming meetings read from those calendars. */
  managerCalendarEvents: defineTable({
    userId: v.id("users"),
    teamId: v.id("teams"),
    /** Google's event id — the dedup key across repeated syncs. */
    uid: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    meetingUrl: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    isAllDay: v.optional(v.boolean()),
    /** Raw JSON. Only ~16% of real events carry any attendees at all. */
    attendees: v.optional(v.string()),
    /** Manager pressed "don't record this one". Survives every later sync. */
    excluded: v.optional(v.boolean()),
    /**
     * Which rep this meeting is with, worked out from the invite or the title.
     *
     * Only 16% of real calendar events carry any attendee list, and the ones
     * observed were prospects rather than colleagues — so this is frequently
     * null and the UI has to cope rather than assume.
     */
    matchedCloserId: v.optional(v.id("closers")),
    /** How we worked it out, so a wrong guess is explainable: "attendee" | "title" */
    matchedBy: v.optional(v.string()),
    /**
     * Set by the manager when we got it wrong or couldn't tell. Always wins
     * over matchedCloserId, and survives every later sync.
     */
    taggedCloserId: v.optional(v.id("closers")),
    fetchedAt: v.number(),
  })
    .index("by_user_and_start", ["userId", "startTime"])
    .index("by_uid", ["uid"]),

  /** A meeting that was actually recorded. */
  managerMeetings: defineTable({
    userId: v.id("users"),
    teamId: v.id("teams"),
    calendarEventId: v.optional(v.id("managerCalendarEvents")),
    title: v.string(),
    meetingUrl: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    duration: v.optional(v.number()), // seconds
    recordingUrl: v.optional(v.string()),
    status: v.string(), // "recording" | "completed" | "failed"
    /**
     * Why a recording produced nothing, when it produced nothing. A bot that
     * sat in a waiting room for twenty minutes and left must say so rather
     * than leave a silent gap someone later reads as "no meeting happened".
     */
    failureReason: v.optional(v.string()),
    /**
     * What KIND of meeting this was — the tabs in Manager Mode. Denormalized
     * from the analysis's `kind` (judged from the conversation, not the
     * title) so the meetings list never joins the analysis table. Manual
     * re-filing outranks the AI and is never overwritten, the same contract
     * as every other human-vs-model field.
     */
    meetingType: v.optional(v.union(
      v.literal("one_to_one"),
      v.literal("team"),
      v.literal("leadership"),
      v.literal("interview"),
      v.literal("other"),
    )),
    meetingTypeSource: v.optional(v.union(v.literal("ai"), v.literal("manual"))),
    createdAt: v.number(),
  })
    .index("by_user_and_created", ["userId", "createdAt"])
    .index("by_team", ["teamId"]),

  /**
   * Transcripts, in their own table rather than reusing `transcriptSegments`.
   *
   * That table keys on `callId: v.id("calls")`, and a Convex id is typed to
   * its table, so it physically cannot hold a manager meeting. Widening that
   * pointer is deliberate later work; phase 1 must not depend on it.
   */
  managerMeetingTranscripts: defineTable({
    meetingId: v.id("managerMeetings"),
    userId: v.id("users"),
    speaker: v.string(),
    text: v.string(),
    startSeconds: v.number(),
    endSeconds: v.optional(v.number()),
  }).index("by_meeting", ["meetingId"]),

  /**
   * What the AI read off a manager's meeting.
   *
   * Separate from managerMeetings so a re-analysis rewrites one row rather
   * than mutating the recording's own record, and so a meeting with no
   * analysis is distinguishable from one whose analysis came back empty.
   */
  managerMeetingAnalysis: defineTable({
    meetingId: v.id("managerMeetings"),
    userId: v.id("users"),
    teamId: v.id("teams"),
    /** one_to_one | team | leadership | interview | other */
    kind: v.string(),
    summary: v.string(),
    topics: v.array(v.string()),
    actionItems: v.array(v.object({ who: v.string(), what: v.string() })),
    /**
     * What someone said they would do.
     *
     * `measurable` is the load-bearing field: true only when a number could
     * settle it ("twenty dials a day", "fill in my end of day"). Behaviour and
     * effort are always false. Getting this wrong is the one way the feature
     * lies — it would put evidence next to a promise we cannot check.
     */
    agreements: v.array(
      v.object({ who: v.string(), what: v.string(), measurable: v.boolean() }),
    ),
    /** Interviews only. */
    candidateName: v.optional(v.string()),
    role: v.optional(v.string()), // "closer" | "setter"
    talkingPoints: v.array(v.string()),
    analysedAt: v.number(),
  })
    .index("by_meeting", ["meetingId"])
    .index("by_user_and_kind", ["userId", "kind"]),

  /**
   * A clip cut out of a manager's meeting — usually a coaching moment being
   * turned into training.
   *
   * Its own table rather than reusing `highlights`, which keys on
   * `callId: v.id("calls")`. The design originally said to widen that pointer;
   * measuring changed the answer. `sharedLinks` and `highlights` are touched by
   * nine files including the PUBLIC share page, compliance links carrying
   * AI-redacted transcripts, and B2C shares. Making all of those handle "this
   * might not be a call" risks a customer-facing page and the compliance path
   * to save a table.
   *
   * It also isn't really a duplicate: a manager clip needs less (no compliance
   * redaction, no B2C variants) and two things the existing one lacks — an
   * expiry and a view count.
   */
  managerMeetingClips: defineTable({
    meetingId: v.id("managerMeetings"),
    userId: v.id("users"),
    teamId: v.id("teams"),
    title: v.string(),
    notes: v.optional(v.string()),
    startSeconds: v.number(),
    endSeconds: v.number(),
    /** The words in the clip, captured at cut time so it reads without the video. */
    transcriptText: v.optional(v.string()),
    /** Set when the clip has been pushed into a training playlist. */
    playlistId: v.optional(v.id("trainingPlaylists")),
    createdAt: v.number(),
  })
    .index("by_meeting", ["meetingId"])
    .index("by_user", ["userId"]),

  /**
   * A link to a manager's meeting or a clip of one.
   *
   * These are more sensitive than a sales-call share — a one-to-one about
   * someone's performance shouldn't live on a URL forever with nobody knowing
   * it was opened. Hence `expiresAt` and `viewCount`, which the closer share
   * mechanism has never had.
   */
  managerMeetingShares: defineTable({
    token: v.string(),
    meetingId: v.id("managerMeetings"),
    clipId: v.optional(v.id("managerMeetingClips")),
    userId: v.id("users"),
    teamId: v.id("teams"),
    passwordHash: v.optional(v.string()), // SHA-256, never the password
    /** Null means no expiry, which is allowed but never the default. */
    expiresAt: v.optional(v.number()),
    viewCount: v.number(),
    lastViewedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_meeting", ["meetingId"]),

  /** Bot lifecycle. Far simpler than the closer bot's — no attribution. */
  managerMeetingBots: defineTable({
    userId: v.id("users"),
    teamId: v.id("teams"),
    /** Absent for quick bots — a pasted link has no calendar event behind it. */
    calendarEventId: v.optional(v.id("managerCalendarEvents")),
    meetingId: v.optional(v.id("managerMeetings")),
    recallBotId: v.string(),
    meetingUrl: v.string(),
    meetingTitle: v.string(),
    scheduledStartTime: v.number(),
    status: v.string(), // "scheduled" | "joining" | "active" | "completed" | "failed" | "cancelled"
    joinedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_recall_bot_id", ["recallBotId"])
    .index("by_user", ["userId"])
    /**
     * Dedup is on the calendar EVENT, never the meeting URL. One personal
     * meeting room hosts many different meetings — keying on the URL once
     * made the closer bot skip 13 of 14 real meetings as duplicates.
     */
    .index("by_calendar_event", ["calendarEventId"]),
});
