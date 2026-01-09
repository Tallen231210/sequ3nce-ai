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
// POST-CALL QUESTIONNAIRE ENDPOINT (for desktop app)
// ============================================

// POST endpoint to save post-call questionnaire data
http.route({
  path: "/completeCallWithOutcome",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const {
        callId,
        prospectName,
        outcome,
        dealValue,
        cashCollected,
        contractValue,
        notes,
        // Enhanced questionnaire fields
        primaryObjection,
        primaryObjectionOther,
        leadQualityScore,
        prospectWasDecisionMaker,
      } = body;

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
        // Enhanced questionnaire fields
        primaryObjection: primaryObjection || undefined,
        primaryObjectionOther: primaryObjectionOther || undefined,
        leadQualityScore: leadQualityScore || undefined,
        prospectWasDecisionMaker: prospectWasDecisionMaker || undefined,
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
// END CALL (for connection lost scenarios)
// ============================================

// POST endpoint to end a call when connection is lost
http.route({
  path: "/endCall",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId, reason } = body;

      if (!callId) {
        return new Response(JSON.stringify({ error: "callId is required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runMutation(api.calls.endCallOnConnectionLost, {
        callId,
        reason: reason || "connection_lost",
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error ending call:", error);
      return new Response(
        JSON.stringify({ error: "Failed to end call" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  }),
});

// Handle CORS preflight for endCall
http.route({
  path: "/endCall",
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

// ============================================
// TRAINING PLAYLISTS ENDPOINTS (for desktop app)
// ============================================

// GET endpoint to fetch training playlists assigned to a closer
http.route({
  path: "/getAssignedTraining",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const closerId = url.searchParams.get("closerId");

    if (!closerId) {
      return new Response(JSON.stringify({ error: "closerId is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const playlists = await ctx.runQuery(api.trainingPlaylists.getAssignedPlaylists, {
        closerId: closerId as any,
      });
      return new Response(JSON.stringify(playlists || []), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Error fetching assigned training:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch training" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getAssignedTraining
http.route({
  path: "/getAssignedTraining",
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

// GET endpoint to fetch a training playlist with all its items (for desktop app player)
http.route({
  path: "/getTrainingPlaylistDetails",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const playlistId = url.searchParams.get("playlistId");
    const closerId = url.searchParams.get("closerId");

    if (!playlistId || !closerId) {
      return new Response(JSON.stringify({ error: "playlistId and closerId are required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      // Verify closer is assigned to this playlist
      const assignments = await ctx.runQuery(api.trainingPlaylists.getAssignedPlaylists, {
        closerId: closerId as any,
      });

      const isAssigned = assignments?.some((p: any) => p._id === playlistId);
      if (!isAssigned) {
        return new Response(JSON.stringify({ error: "Playlist not assigned to this closer" }), {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Get playlist with items - we need to get the full details
      // Since we can't directly call getPlaylistWithItems (requires clerkId),
      // we'll build the response from the data we have
      const playlist = assignments?.find((p: any) => p._id === playlistId);

      if (!playlist) {
        return new Response(JSON.stringify({ error: "Playlist not found" }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Get the items for this playlist
      const items = await ctx.runQuery(internal.trainingPlaylists.getPlaylistItemsInternal, {
        playlistId: playlistId as any,
      });

      return new Response(JSON.stringify({
        ...playlist,
        items: items || [],
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Error fetching training playlist details:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch playlist" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getTrainingPlaylistDetails
http.route({
  path: "/getTrainingPlaylistDetails",
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
// SMART NUDGES ENDPOINTS (for desktop app)
// ============================================

// GET endpoint to fetch nudges for a call
http.route({
  path: "/getNudgesByCall",
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
      const nudges = await ctx.runQuery(api.calls.getNudgesByCall, { callId });
      return new Response(JSON.stringify(nudges || []), {
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

// Handle CORS preflight for getNudgesByCall
http.route({
  path: "/getNudgesByCall",
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

// POST endpoint to update nudge status (save or dismiss)
http.route({
  path: "/updateNudgeStatus",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { nudgeId, status } = body;

      if (!nudgeId || !status) {
        return new Response(JSON.stringify({ error: "nudgeId and status are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      if (!["saved", "dismissed"].includes(status)) {
        return new Response(JSON.stringify({ error: "status must be 'saved' or 'dismissed'" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      await ctx.runMutation(api.calls.updateNudgeStatus, {
        nudgeId: nudgeId as any,
        status,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Error updating nudge status:", error);
      return new Response(JSON.stringify({ error: "Failed to update nudge" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for updateNudgeStatus
http.route({
  path: "/updateNudgeStatus",
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
// CLOSER RESOURCES ENDPOINTS (for desktop app)
// ============================================

// GET endpoint to fetch active resources for a team
http.route({
  path: "/getActiveResources",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId");

    if (!teamId) {
      return new Response(JSON.stringify({ error: "teamId is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const resources = await ctx.runQuery(api.resources.getActiveResources, {
        teamId: teamId as any,
      });
      return new Response(JSON.stringify(resources || []), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Error fetching active resources:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch resources" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getActiveResources
http.route({
  path: "/getActiveResources",
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
// Client Error Logging (for remote debugging)
// ============================================

// POST endpoint to log client errors from desktop app
http.route({
  path: "/logClientError",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();

      await ctx.runMutation(api.clientErrors.logError, {
        closerEmail: body.closerEmail,
        errorType: body.errorType || "unknown",
        errorMessage: body.errorMessage || "No message provided",
        errorStack: body.errorStack,
        appVersion: body.appVersion,
        platform: body.platform,
        osVersion: body.osVersion,
        architecture: body.architecture,
        screenPermission: body.screenPermission,
        microphonePermission: body.microphonePermission,
        captureStep: body.captureStep,
        context: body.context,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Error logging client error:", error);
      // Still return success - we don't want to cause more errors
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for logClientError
http.route({
  path: "/logClientError",
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
// AMMO V2: Real-time AI Analysis (for audio processor and desktop app)
// ============================================

// POST endpoint to update ammo analysis for a call (called by audio processor)
http.route({
  path: "/updateAmmoAnalysis",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId, analysis } = body;

      if (!callId || !analysis) {
        return new Response(JSON.stringify({ error: "callId and analysis are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runMutation(api.calls.updateAmmoAnalysis, {
        callId,
        analysis,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error updating ammo analysis:", error);
      return new Response(JSON.stringify({ error: "Failed to update analysis" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for updateAmmoAnalysis
http.route({
  path: "/updateAmmoAnalysis",
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

// GET endpoint to check if Ammo V2 is enabled for a team (called by audio processor)
http.route({
  path: "/isAmmoV2Enabled",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId");

    if (!teamId) {
      return new Response(JSON.stringify({ error: "teamId is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const enabled = await ctx.runQuery(api.calls.isAmmoV2Enabled, { teamId });
      return new Response(JSON.stringify({ enabled }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error checking Ammo V2 status:", error);
      return new Response(JSON.stringify({ error: "Failed to check status" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for isAmmoV2Enabled
http.route({
  path: "/isAmmoV2Enabled",
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

// GET endpoint to fetch current ammo analysis for a call (for desktop app)
http.route({
  path: "/getAmmoAnalysis",
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
      const analysis = await ctx.runQuery(api.calls.getAmmoAnalysis, { callId });
      return new Response(JSON.stringify(analysis), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error fetching ammo analysis:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch analysis" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getAmmoAnalysis
http.route({
  path: "/getAmmoAnalysis",
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
// ROLE PLAY ROOM ENDPOINTS (for desktop app)
// ============================================

// POST endpoint to get or create a role play room for a team
http.route({
  path: "/getOrCreateRolePlayRoom",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { teamId } = body;

      if (!teamId) {
        return new Response(JSON.stringify({ error: "teamId is required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runAction(api.rolePlayRoom.getOrCreateRolePlayRoom, {
        teamId,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error getting/creating role play room:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to get room";
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getOrCreateRolePlayRoom
http.route({
  path: "/getOrCreateRolePlayRoom",
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

// POST endpoint to join a role play room
http.route({
  path: "/joinRolePlayRoom",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { teamId, closerId, userName } = body;

      if (!teamId || !closerId || !userName) {
        return new Response(JSON.stringify({ error: "teamId, closerId, and userName are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runMutation(api.rolePlayRoom.joinRolePlayRoom, {
        teamId,
        closerId,
        userName,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error joining role play room:", error);
      return new Response(JSON.stringify({ error: "Failed to join room" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for joinRolePlayRoom
http.route({
  path: "/joinRolePlayRoom",
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

// POST endpoint to leave a role play room
http.route({
  path: "/leaveRolePlayRoom",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { teamId, closerId } = body;

      if (!teamId || !closerId) {
        return new Response(JSON.stringify({ error: "teamId and closerId are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runMutation(api.rolePlayRoom.leaveRolePlayRoom, {
        teamId,
        closerId,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error leaving role play room:", error);
      return new Response(JSON.stringify({ error: "Failed to leave room" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for leaveRolePlayRoom
http.route({
  path: "/leaveRolePlayRoom",
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

// GET endpoint to get role play room participants
http.route({
  path: "/getRolePlayRoomParticipants",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId");

    if (!teamId) {
      return new Response(JSON.stringify({ error: "teamId is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const participants = await ctx.runQuery(api.rolePlayRoom.getRolePlayRoomParticipants, {
        teamId,
      });

      return new Response(JSON.stringify(participants), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error getting role play room participants:", error);
      return new Response(JSON.stringify({ error: "Failed to get participants" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getRolePlayRoomParticipants
http.route({
  path: "/getRolePlayRoomParticipants",
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

export default http;
