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
    // Ammo V2 feature flag
    ammoV2Enabled: v.optional(v.boolean()), // Enable AI-powered real-time ammo analysis
    // Meeting Bot feature flag
    meetingBotEnabled: v.optional(v.boolean()), // Enable meeting bot auto-join via Meeting BaaS
    meetingBotName: v.optional(v.string()), // Configurable bot display name (what other participants see)
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
    // GoHighLevel CRM integration
    ghlApiKey: v.optional(v.string()),
    ghlEnabled: v.optional(v.boolean()),
    ghlConnectedAt: v.optional(v.number()),
    ghlLocationId: v.optional(v.string()),
    ghlCreateContacts: v.optional(v.boolean()),
    ghlAddNotes: v.optional(v.boolean()),
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
  })
    .index("by_team", ["teamId"])
    .index("by_email", ["email"])
    .index("by_clerk_id", ["clerkId"]),

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
    meetingUrl: v.optional(v.string()), // Extracted Zoom/Meet/Teams URL for one-click join
    fetchedAt: v.number(), // When this event was last synced
    // Attendee data (populated by Google Calendar API, not available from ICS feeds)
    attendees: v.optional(v.array(v.object({
      email: v.string(),
      name: v.optional(v.string()),
      isOrganizer: v.optional(v.boolean()),
    }))),
  })
    .index("by_closer", ["closerId"])
    .index("by_team_and_time", ["teamId", "startTime"])
    .index("by_closer_and_uid", ["closerId", "uid"]),

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
    recordingUrl: v.optional(v.string()), // S3 URL or Meeting BaaS video URL
    recordingType: v.optional(v.string()), // "audio" (legacy desktop) | "video" (meeting bot)
    transcriptText: v.optional(v.string()), // Full transcript
    meetingBotId: v.optional(v.id("meetingBots")), // Link to meeting bot that recorded this call
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

    // AI deep analysis (chapters + sales process scoring)
    callAnalysis: v.optional(v.object({
      chapters: v.array(v.object({
        title: v.string(),
        startTime: v.number(),   // seconds from call start
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

    // Ammo V2: Real-time AI analysis (replaces traditional ammo extraction)
    ammoAnalysis: v.optional(v.object({
      engagement: v.object({
        level: v.string(), // "high" | "medium" | "low"
        reason: v.string(), // Why this level was determined
      }),
      beliefs: v.object({
        problem: v.number(),    // 0-100 - Do they believe they have the problem?
        solution: v.number(),   // 0-100 - Do they believe a solution exists?
        vehicle: v.number(),    // 0-100 - Do they believe YOUR solution is the vehicle?
        self: v.number(),       // 0-100 - Do they believe they can do it?
        time: v.number(),       // 0-100 - Do they believe now is the right time?
        money: v.number(),      // 0-100 - Do they believe it's worth the investment?
        urgency: v.number(),    // 0-100 - Is there urgency to act?
      }),
      objectionPrediction: v.array(v.object({
        type: v.string(),       // "think_about_it", "spouse", "money", "time", etc.
        probability: v.number(), // 0-100
      })),
      painPoints: v.array(v.string()), // Exact quotes from prospect about their pain
      liveSummary: v.optional(v.string()), // Brief 2-3 sentence live summary of the call
      analyzedAt: v.number(),   // Timestamp of last analysis
    })),

    // Post-call questionnaire fields (enhanced)
    primaryObjection: v.optional(v.string()), // Selected objection from dropdown (for lost/follow_up)
    primaryObjectionOther: v.optional(v.string()), // Free text if "Other" was selected
    objectionsOvercome: v.optional(v.string()), // For closed deals: "none", objection type, or "other"
    objectionsOvercomeOther: v.optional(v.string()), // Free text if "Other" was selected
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
    calendarEventId: v.optional(v.id("calendarEvents")), // Link to Google Calendar event (for prospect email)
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

  // Slack Notifications (tracking sent notifications to prevent duplicates)
  slackNotifications: defineTable({
    teamId: v.id("teams"),
    callId: v.optional(v.id("calls")),
    type: v.string(), // "call_started" | "summary_30" | "summary_60" | "reinforcement" | "call_going_long"
    sentAt: v.number(),
  })
    .index("by_call_and_type", ["callId", "type"])
    .index("by_team", ["teamId"]),

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
    .index("by_call", ["callId"]),

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
    phone: v.string(),                    // SMS-verified, primary identity key
    phoneVerified: v.boolean(),
    name: v.string(),
    passwordHash: v.string(),
    personalWorkspaceId: v.id("teams"),   // Their "team of one"
    stripeCustomerId: v.optional(v.string()),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("cancelled"),
      v.literal("past_due"),
      v.literal("none"),
    ),
    subscriptionId: v.optional(v.string()),
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
    .index("by_stripe_customer", ["stripeCustomerId"]),

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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_channel", ["channelId", "createdAt"])
    .index("by_author", ["authorId", "createdAt"])
    .index("by_channel_pinned", ["channelId", "isPinned"])
    .index("by_created", ["createdAt"]),

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

  // DM threads between two users
  b2cDirectMessageThreads: defineTable({
    participantKey: v.string(),
    participant1Id: v.id("b2cUsers"),
    participant2Id: v.id("b2cUsers"),
    lastMessageAt: v.optional(v.number()),
    lastMessagePreview: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_participant_key", ["participantKey"])
    .index("by_participant1", ["participant1Id", "lastMessageAt"])
    .index("by_participant2", ["participant2Id", "lastMessageAt"]),

  // Individual DM messages
  b2cDirectMessages: defineTable({
    threadId: v.id("b2cDirectMessageThreads"),
    senderId: v.id("b2cUsers"),
    body: v.string(),
    isRead: v.boolean(),
    readAt: v.optional(v.number()),
    isDeleted: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId", "createdAt"])
    .index("by_recipient_unread", ["threadId", "isRead"]),

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
});
