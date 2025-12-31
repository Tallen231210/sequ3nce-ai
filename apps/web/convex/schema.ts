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
    dealValue: v.optional(v.number()), // Legacy field - kept for backward compatibility
    cashCollected: v.optional(v.number()), // Amount paid on the call (upfront payment)
    contractValue: v.optional(v.number()), // Total contract commitment
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
    // AI-generated summary
    summary: v.optional(v.string()), // AI summary of the call for quick manager review

    // Post-call questionnaire fields (enhanced)
    primaryObjection: v.optional(v.string()), // Selected objection from dropdown
    primaryObjectionOther: v.optional(v.string()), // Free text if "Other" was selected
    leadQualityScore: v.optional(v.number()), // 1-10 rating
    prospectWasDecisionMaker: v.optional(v.string()), // "yes" | "no" | "unclear"

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
});
