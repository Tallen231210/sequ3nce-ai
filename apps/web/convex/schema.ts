import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Teams (companies using the platform)
  teams: defineTable({
    name: v.string(),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    plan: v.string(), // "active", "cancelled", "trialing", etc.
    subscriptionStatus: v.optional(v.string()), // "active", "past_due", "canceled", "unpaid", "trialing"
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
  })
    .index("by_stripe_customer", ["stripeCustomerId"]),

  // Users (admins/managers who access the web dashboard)
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    teamId: v.id("teams"),
    role: v.string(), // "admin", "manager"
    createdAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_team", ["teamId"]),

  // Closers (sales reps who use the desktop app)
  closers: defineTable({
    email: v.string(),
    name: v.string(),
    teamId: v.id("teams"),
    status: v.string(), // "pending", "active", "deactivated"
    clerkId: v.optional(v.string()), // Set when they complete signup
    passwordHash: v.optional(v.string()), // Hashed password for desktop app login
    calendarConnected: v.boolean(),
    calendarRefreshToken: v.optional(v.string()), // Encrypted
    invitedAt: v.number(),
    activatedAt: v.optional(v.number()),
    lastLoginAt: v.optional(v.number()), // Track last desktop app login
  })
    .index("by_team", ["teamId"])
    .index("by_email", ["email"])
    .index("by_clerk_id", ["clerkId"]),

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
    status: v.string(), // "scheduled", "waiting", "on_call", "completed", "no_show", "cancelled"
    outcome: v.optional(v.string()), // "closed", "not_closed", "no_show", "rescheduled"
    dealValue: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    duration: v.optional(v.number()), // In seconds
    speakerCount: v.number(), // 1 = waiting, 2+ = on call
    recordingUrl: v.optional(v.string()), // S3 URL
    transcriptText: v.optional(v.string()), // Full transcript
    // Talk-to-listen ratio (from Deepgram speaker diarization)
    closerTalkTime: v.optional(v.number()), // Closer talk time in seconds
    prospectTalkTime: v.optional(v.number()), // Prospect talk time in seconds
    // Speaker mapping (maps Deepgram speakers to closer/prospect)
    speakerMapping: v.optional(v.object({
      closerSpeaker: v.string(), // "speaker_0" or "speaker_1" from Deepgram
      confirmed: v.boolean(), // Whether the closer has confirmed/corrected this mapping
    })),
    // Post-call data (from closer questionnaire)
    notes: v.optional(v.string()), // Optional notes from closer
    completedAt: v.optional(v.number()), // Timestamp when closer submitted questionnaire
    createdAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_closer", ["closerId"])
    .index("by_team_and_status", ["teamId", "status"])
    .index("by_team_and_date", ["teamId", "createdAt"]),

  // Ammo (key moments extracted from calls)
  ammo: defineTable({
    callId: v.id("calls"),
    teamId: v.id("teams"),
    text: v.string(), // The actual quote
    type: v.string(), // "emotional", "urgency", "budget", "commitment", "objection_preview", "pain_point"
    timestamp: v.optional(v.number()), // When in the call this was said (seconds from start)
    createdAt: v.number(),
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
});
