import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const http = httpRouter();

// GET endpoint to look up closer by email (used by desktop app)
http.route({
  path: "/getCloserByEmail",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const email = url.searchParams.get("email");

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Run the existing query
    const closer = await ctx.runQuery(api.closers.getCloserByEmail, { email });

    return new Response(JSON.stringify(closer), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

// Handle CORS preflight for getCloserByEmail
http.route({
  path: "/getCloserByEmail",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// POST endpoint to activate a closer (called when they log in from desktop app)
http.route({
  path: "/activateCloser",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const email = body.email;

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const result = await ctx.runMutation(api.closers.activateCloserByEmail, { email });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

// Handle CORS preflight for activateCloser
http.route({
  path: "/activateCloser",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// ============================================
// CLOSER LOGIN (for desktop app email/password auth)
// ============================================

// POST endpoint to login a closer with email and password
http.route({
  path: "/loginCloser",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { email, password } = body;

      if (!email || !password) {
        return new Response(JSON.stringify({ success: false, error: "Email and password are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runMutation(api.closers.loginCloser, { email, password });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
    } catch (error) {
      console.error("Error logging in closer:", error);
      return new Response(JSON.stringify({ success: false, error: "Login failed" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
    }
  }),
});

// Handle CORS preflight for loginCloser
http.route({
  path: "/loginCloser",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// POST endpoint to change closer password (from desktop app)
http.route({
  path: "/changePassword",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId, currentPassword, newPassword } = body;

      console.log("[changePassword] Request received for closerId:", closerId);

      if (!closerId || !currentPassword || !newPassword) {
        console.log("[changePassword] Missing fields:", { hasCloserId: !!closerId, hasCurrentPassword: !!currentPassword, hasNewPassword: !!newPassword });
        return new Response(JSON.stringify({ success: false, error: "All fields are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Cast closerId string to the expected Convex ID type
      const result = await ctx.runMutation(api.closers.changeCloserPassword, {
        closerId: closerId as any, // Convex will validate the ID format
        currentPassword,
        newPassword,
      });

      console.log("[changePassword] Mutation result:", result);

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[changePassword] Error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to change password";
      return new Response(JSON.stringify({ success: false, error: errorMessage }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for changePassword
http.route({
  path: "/changePassword",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// GET endpoint to fetch ammo for a specific call (used by desktop app floating tracker)
http.route({
  path: "/getAmmoByCall",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const callId = url.searchParams.get("callId");

    if (!callId) {
      return new Response(JSON.stringify({ error: "callId is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const ammo = await ctx.runQuery(api.calls.getAmmoByCall, { callId: callId as any });
      return new Response(JSON.stringify(ammo || []), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Invalid callId" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getAmmoByCall
http.route({
  path: "/getAmmoByCall",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// DEBUG: List all closers (remove in production)
http.route({
  path: "/debug/closers",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const closers = await ctx.runQuery(api.closers.listAllClosers);
    return new Response(JSON.stringify(closers, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

// ============================================
// SPEAKER MAPPING ENDPOINTS (for desktop app)
// ============================================

// GET endpoint to fetch call info including speaker mapping
http.route({
  path: "/getCallInfo",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const callId = url.searchParams.get("callId");

    if (!callId) {
      return new Response(JSON.stringify({ error: "callId is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const call = await ctx.runQuery(api.calls.getCallWithAmmo, { callId: callId as any });
      if (!call) {
        return new Response(JSON.stringify({ error: "Call not found" }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Get the first transcript segment from the detected closer speaker
      let closerSnippet: string | undefined;
      if (call.speakerMapping && !call.speakerMapping.confirmed) {
        // Fetch transcript segments to find the first thing the closer said
        const segments = await ctx.runQuery(api.calls.getTranscriptSegments, { callId: callId as any });
        if (segments && segments.length > 0) {
          // Find the first segment from the detected closer speaker
          const closerSpeaker = call.speakerMapping.closerSpeaker;
          // The speaker label in segments is "closer" or "prospect"
          // If closerSpeaker is "speaker_0", closer = Speaker 1, so we look for "closer" label
          // Our transcriptSegments already have "closer" or "prospect" labels
          const closerSegment = segments.find(seg => seg.speaker.toLowerCase() === "closer");
          if (closerSegment) {
            closerSnippet = closerSegment.text;
          }
        }
      }

      return new Response(JSON.stringify({
        _id: call._id,
        speakerMapping: call.speakerMapping,
        closerTalkTime: call.closerTalkTime,
        prospectTalkTime: call.prospectTalkTime,
        status: call.status,
        closerSnippet,
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Invalid callId" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getCallInfo
http.route({
  path: "/getCallInfo",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// POST endpoint to swap speaker mapping
http.route({
  path: "/swapSpeakerMapping",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const callId = body.callId;

      if (!callId) {
        return new Response(JSON.stringify({ error: "callId is required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      await ctx.runMutation(api.calls.swapSpeakerMapping, { callId: callId as any });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Failed to swap speaker mapping" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for swapSpeakerMapping
http.route({
  path: "/swapSpeakerMapping",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// POST endpoint to confirm speaker mapping
http.route({
  path: "/confirmSpeakerMapping",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const callId = body.callId;

      if (!callId) {
        return new Response(JSON.stringify({ error: "callId is required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      await ctx.runMutation(api.calls.confirmSpeakerMapping, { callId: callId as any });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Failed to confirm speaker mapping" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for confirmSpeakerMapping
http.route({
  path: "/confirmSpeakerMapping",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// ============================================
// POST-CALL QUESTIONNAIRE ENDPOINT (for desktop app)
// ============================================

// POST endpoint to save post-call questionnaire data
http.route({
  path: "/completeCallWithOutcome",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId, prospectName, outcome, dealValue, cashCollected, contractValue, notes } = body;

      if (!callId) {
        return new Response(JSON.stringify({ error: "callId is required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      if (!prospectName || !outcome) {
        return new Response(JSON.stringify({ error: "prospectName and outcome are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      await ctx.runMutation(api.calls.completeCallWithOutcome, {
        callId: callId as any,
        prospectName,
        outcome,
        dealValue: dealValue || undefined,
        cashCollected: cashCollected || undefined,
        contractValue: contractValue || undefined,
        notes: notes || undefined,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Error completing call with outcome:", error);
      return new Response(JSON.stringify({ error: "Failed to complete call" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for completeCallWithOutcome
http.route({
  path: "/completeCallWithOutcome",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// ============================================
// NOTES ENDPOINTS (for desktop app)
// ============================================

// POST endpoint to update call notes
http.route({
  path: "/updateCallNotes",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId, notes } = body;

      if (!callId) {
        return new Response(JSON.stringify({ error: "callId is required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      await ctx.runMutation(api.calls.updateCallNotes, {
        callId: callId as any,
        notes: notes || "",
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Error updating call notes:", error);
      return new Response(JSON.stringify({ error: "Failed to update notes" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for updateCallNotes
http.route({
  path: "/updateCallNotes",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// GET endpoint to fetch call notes
http.route({
  path: "/getCallNotes",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const callId = url.searchParams.get("callId");

    if (!callId) {
      return new Response(JSON.stringify({ error: "callId is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const call = await ctx.runQuery(api.calls.getCallWithAmmo, { callId: callId as any });
      return new Response(JSON.stringify({ notes: call?.notes || null }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Invalid callId" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getCallNotes
http.route({
  path: "/getCallNotes",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// GET endpoint to fetch transcript segments for a call
http.route({
  path: "/getTranscriptSegments",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const callId = url.searchParams.get("callId");

    if (!callId) {
      return new Response(JSON.stringify({ error: "callId is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const segments = await ctx.runQuery(api.calls.getTranscriptSegments, { callId: callId as any });
      return new Response(JSON.stringify(segments || []), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Invalid callId" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getTranscriptSegments
http.route({
  path: "/getTranscriptSegments",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// ============================================
// PROSPECT NAME / SCHEDULED CALL MATCHING (for desktop app)
// ============================================

// GET endpoint to find a matching scheduled call for a closer within ±15 minutes
http.route({
  path: "/findMatchingScheduledCall",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const closerId = url.searchParams.get("closerId");
    const teamId = url.searchParams.get("teamId");

    if (!closerId || !teamId) {
      return new Response(JSON.stringify({ error: "closerId and teamId are required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const match = await ctx.runQuery(api.calls.findMatchingScheduledCall, {
        closerId: closerId as any,
        teamId: teamId as any,
      });

      return new Response(JSON.stringify(match), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Error finding matching scheduled call:", error);
      return new Response(JSON.stringify({ error: "Failed to find matching call" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for findMatchingScheduledCall
http.route({
  path: "/findMatchingScheduledCall",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// POST endpoint to update prospect name on an existing call
http.route({
  path: "/updateProspectName",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId, prospectName, scheduledCallId } = body;

      if (!callId || !prospectName) {
        return new Response(JSON.stringify({ error: "callId and prospectName are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      await ctx.runMutation(api.calls.updateProspectName, {
        callId: callId as any,
        prospectName,
        scheduledCallId: scheduledCallId as any || undefined,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Error updating prospect name:", error);
      return new Response(JSON.stringify({ error: "Failed to update prospect name" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for updateProspectName
http.route({
  path: "/updateProspectName",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// ============================================
// CALENDLY WEBHOOK
// ============================================

// Calendly webhook endpoint - receives events when bookings are created or cancelled
http.route({
  path: "/calendly-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();

      // Log webhook event for debugging
      console.log("Calendly webhook received:", body.event, body.payload?.event?.uri);

      const event = body.event;
      const payload = body.payload;

      if (!event || !payload) {
        return new Response(JSON.stringify({ error: "Invalid webhook payload" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Extract organization URI to find the team
      const organizationUri = payload.event?.event_memberships?.[0]?.user_email
        ? null // We'll look up by event URI instead
        : null;

      if (event === "invitee.created") {
        // New booking created
        const invitee = payload.invitee;
        const scheduledEvent = payload.event;

        if (!scheduledEvent || !invitee) {
          return new Response(JSON.stringify({ error: "Missing event data" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Find the team by checking which team has this organization
        // We need to look up by the event membership user email
        const hostEmail = scheduledEvent.event_memberships?.[0]?.user_email;

        // For now, we'll try to find an existing scheduled call or team by the event URI pattern
        // The proper way would be to store team info in webhook metadata

        // Try to find a closer matching the host email to get the team
        let teamId = null;
        let closerId = null;

        if (hostEmail) {
          // Find closer by email to get team
          const closerResult = await ctx.runQuery(api.closers.getCloserByEmail, { email: hostEmail });
          if (closerResult) {
            teamId = closerResult.teamId;
            closerId = closerResult.closerId;
          }
        }

        // If we couldn't find a team, we can't process this webhook
        // In production, you'd want to store team ID in webhook metadata
        if (!teamId) {
          console.log("Could not find team for Calendly webhook, host email:", hostEmail);
          // Return 200 to acknowledge receipt (Calendly expects this)
          return new Response(JSON.stringify({ received: true, processed: false, reason: "Team not found" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Create or update the scheduled call
        await ctx.runMutation(internal.calendly.upsertScheduledCall, {
          teamId,
          calendarEventId: scheduledEvent.uri,
          prospectName: invitee.name,
          prospectEmail: invitee.email,
          scheduledAt: new Date(scheduledEvent.start_time).getTime(),
          meetingLink: scheduledEvent.location?.join_url || undefined,
          closerId: closerId || undefined,
          calendlyInviteeUri: invitee.uri,
        });

        console.log("Created/updated scheduled call from Calendly webhook");

      } else if (event === "invitee.canceled") {
        // Booking cancelled
        const scheduledEvent = payload.event;

        if (!scheduledEvent) {
          return new Response(JSON.stringify({ error: "Missing event data" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Mark the scheduled call as cancelled
        await ctx.runMutation(internal.calendly.cancelScheduledCall, {
          calendarEventId: scheduledEvent.uri,
        });

        console.log("Cancelled scheduled call from Calendly webhook");
      }

      return new Response(JSON.stringify({ received: true, processed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      console.error("Error processing Calendly webhook:", error);
      // Return 200 to prevent Calendly from retrying
      return new Response(JSON.stringify({ received: true, error: "Processing error" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// Handle OPTIONS for Calendly webhook (CORS preflight)
http.route({
  path: "/calendly-webhook",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Calendly-Webhook-Signature",
      },
    });
  }),
});

export default http;
