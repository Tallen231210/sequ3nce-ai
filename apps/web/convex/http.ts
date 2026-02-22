import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

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
        objectionsOvercome,
        objectionsOvercomeOther,
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
        objectionsOvercome: objectionsOvercome || undefined,
        objectionsOvercomeOther: objectionsOvercomeOther || undefined,
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
        closerIdString: body.closerId,  // Swift app sends closerId
        teamIdString: body.teamId,      // Swift app sends teamId
        callId: body.callId,            // Swift app sends callId
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

// ============================================
// CALENDAR ENDPOINTS (for desktop app schedule window)
// ============================================

// GET endpoint to get calendar status for a closer by email and team
http.route({
  path: "/getCloserCalendarStatusByEmail",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const email = url.searchParams.get("email");
    const teamId = url.searchParams.get("teamId");

    if (!email || !teamId) {
      return new Response(JSON.stringify({ error: "email and teamId are required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const status = await ctx.runQuery(api.calendar.getCloserCalendarStatusByEmail, {
        email,
        teamId: teamId as Id<"teams">,
      });
      return new Response(JSON.stringify(status), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error getting calendar status:", error);
      return new Response(JSON.stringify({ error: "Failed to get calendar status" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getCloserCalendarStatusByEmail
http.route({
  path: "/getCloserCalendarStatusByEmail",
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

// POST endpoint to connect calendar with ICS URL (requires teamId)
http.route({
  path: "/connectCalendarByEmail",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { email, teamId, icsUrl } = body;

      if (!email || !teamId || !icsUrl) {
        return new Response(JSON.stringify({ error: "email, teamId, and icsUrl are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runMutation(api.calendar.connectCalendarByEmail, {
        email,
        teamId: teamId as Id<"teams">,
        icsUrl,
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error connecting calendar:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to connect calendar";
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

// Handle CORS preflight for connectCalendarByEmail
http.route({
  path: "/connectCalendarByEmail",
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

// POST endpoint to disconnect calendar (requires teamId)
http.route({
  path: "/disconnectCalendarByEmail",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { email, teamId } = body;

      if (!email || !teamId) {
        return new Response(JSON.stringify({ error: "email and teamId are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runMutation(api.calendar.disconnectCalendarByEmail, {
        email,
        teamId: teamId as Id<"teams">,
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error disconnecting calendar:", error);
      return new Response(JSON.stringify({ error: "Failed to disconnect calendar" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for disconnectCalendarByEmail
http.route({
  path: "/disconnectCalendarByEmail",
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

// POST endpoint to sync calendar (requires teamId)
http.route({
  path: "/syncCalendarByEmail",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { email, teamId } = body;

      if (!email || !teamId) {
        return new Response(JSON.stringify({ error: "email and teamId are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runAction(api.calendar.syncCalendarByEmail, {
        email,
        teamId: teamId as Id<"teams">,
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error syncing calendar:", error);
      return new Response(JSON.stringify({ error: "Failed to sync calendar" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for syncCalendarByEmail
http.route({
  path: "/syncCalendarByEmail",
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

// GET endpoint to get events for a closer by email and team
http.route({
  path: "/getCloserEventsByEmail",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const email = url.searchParams.get("email");
    const teamId = url.searchParams.get("teamId");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    if (!email || !teamId || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "email, teamId, startDate, and endDate are required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const events = await ctx.runQuery(api.calendar.getCloserEventsByEmail, {
        email,
        teamId: teamId as Id<"teams">,
        startDate: parseInt(startDate, 10),
        endDate: parseInt(endDate, 10),
      });
      return new Response(JSON.stringify(events || []), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error getting events:", error);
      return new Response(JSON.stringify({ error: "Failed to get events" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getCloserEventsByEmail
http.route({
  path: "/getCloserEventsByEmail",
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
// LIVE STREAMING ENDPOINTS (for audio processor and web dashboard)
// ============================================

// POST endpoint to create a live stream when a call starts
http.route({
  path: "/createLiveStream",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId, visitorCallId, teamId, closerId } = body;

      if (!callId || !visitorCallId || !teamId || !closerId) {
        return new Response(JSON.stringify({ error: "callId, visitorCallId, teamId, and closerId are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const streamId = await ctx.runMutation(api.liveStreams.createLiveStream, {
        callId,
        visitorCallId,
        teamId,
        closerId,
      });

      return new Response(JSON.stringify({ success: true, streamId }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error creating live stream:", error);
      return new Response(JSON.stringify({ error: "Failed to create live stream" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for createLiveStream
http.route({
  path: "/createLiveStream",
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

// POST endpoint to end a live stream when a call ends
http.route({
  path: "/endLiveStream",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { visitorCallId } = body;

      if (!visitorCallId) {
        return new Response(JSON.stringify({ error: "visitorCallId is required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runMutation(api.liveStreams.endLiveStream, {
        visitorCallId,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error ending live stream:", error);
      return new Response(JSON.stringify({ error: "Failed to end live stream" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for endLiveStream
http.route({
  path: "/endLiveStream",
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

// POST endpoint to update listener count
http.route({
  path: "/updateLiveStreamListenerCount",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { visitorCallId, delta } = body;

      if (!visitorCallId || delta === undefined) {
        return new Response(JSON.stringify({ error: "visitorCallId and delta are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runMutation(api.liveStreams.updateListenerCount, {
        visitorCallId,
        delta,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error updating listener count:", error);
      return new Response(JSON.stringify({ error: "Failed to update listener count" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for updateLiveStreamListenerCount
http.route({
  path: "/updateLiveStreamListenerCount",
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

// GET endpoint to check if live streaming is enabled for a team
http.route({
  path: "/isLiveStreamingEnabled",
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
      const enabled = await ctx.runQuery(api.liveStreams.isLiveStreamingEnabled, {
        teamId,
      });

      return new Response(JSON.stringify({ enabled }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error checking live streaming status:", error);
      return new Response(JSON.stringify({ error: "Failed to check live streaming status" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for isLiveStreamingEnabled
http.route({
  path: "/isLiveStreamingEnabled",
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

// GET endpoint to get live stream by visitorCallId (for audio processor to verify manager connections)
http.route({
  path: "/getLiveStreamByVisitorCallId",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const visitorCallId = url.searchParams.get("visitorCallId");

    if (!visitorCallId) {
      return new Response(JSON.stringify({ error: "visitorCallId is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const stream = await ctx.runQuery(api.liveStreams.getLiveStreamByVisitorCallId, {
        visitorCallId,
      });

      return new Response(JSON.stringify(stream), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error getting live stream:", error);
      return new Response(JSON.stringify({ error: "Failed to get live stream" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getLiveStreamByVisitorCallId
http.route({
  path: "/getLiveStreamByVisitorCallId",
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
// LIVE MESSAGING ENDPOINTS (for desktop app and web dashboard)
// ============================================

// GET endpoint to get messages for a closer (for desktop app polling)
http.route({
  path: "/getMessagesForCloser",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const closerId = url.searchParams.get("closerId");
    const limitParam = url.searchParams.get("limit");

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
      // Update lastSeenAt to track when closer's app is actively polling
      await ctx.runMutation(internal.closers.updateLastSeenAt, {
        closerId: closerId as Id<"closers">,
      });

      const messages = await ctx.runQuery(api.liveMessages.getMessagesForCloser, {
        closerId,
        limit: limitParam ? parseInt(limitParam, 10) : undefined,
      });

      return new Response(JSON.stringify(messages || []), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error getting messages for closer:", error);
      return new Response(JSON.stringify({ error: "Failed to get messages" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getMessagesForCloser
http.route({
  path: "/getMessagesForCloser",
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

// GET endpoint to get unread count for a closer (for badge on chat icon)
http.route({
  path: "/getUnreadCountForCloser",
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
      const result = await ctx.runQuery(api.liveMessages.getUnreadCountForCloser, {
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
      console.error("[HTTP] Error getting unread count:", error);
      return new Response(JSON.stringify({ error: "Failed to get unread count" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getUnreadCountForCloser
http.route({
  path: "/getUnreadCountForCloser",
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

// GET endpoint to get latest unread message for notification banner
http.route({
  path: "/getLatestUnreadForCloser",
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
      const message = await ctx.runQuery(api.liveMessages.getLatestUnreadForCloser, {
        closerId,
      });

      return new Response(JSON.stringify(message), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error getting latest unread:", error);
      return new Response(JSON.stringify({ error: "Failed to get latest unread" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getLatestUnreadForCloser
http.route({
  path: "/getLatestUnreadForCloser",
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

// POST endpoint to send a message (from closer or manager)
http.route({
  path: "/sendMessage",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const {
        teamId,
        senderType,
        senderUserId,
        senderCloserId,
        senderName,
        recipientType,
        recipientUserId,
        recipientCloserId,
        message,
      } = body;

      if (!teamId || !senderType || !senderName || !recipientType || !message) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const messageId = await ctx.runMutation(api.liveMessages.sendMessage, {
        teamId,
        senderType,
        senderUserId,
        senderCloserId,
        senderName,
        recipientType,
        recipientUserId,
        recipientCloserId,
        message,
      });

      return new Response(JSON.stringify({ success: true, messageId }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error sending message:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to send message";
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

// Handle CORS preflight for sendMessage
http.route({
  path: "/sendMessage",
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

// POST endpoint to mark all messages as read for a closer (when chat panel opens)
http.route({
  path: "/markAllAsReadForCloser",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId } = body;

      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runMutation(api.liveMessages.markAllAsReadForCloser, {
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
      console.error("[HTTP] Error marking messages as read:", error);
      return new Response(JSON.stringify({ error: "Failed to mark as read" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for markAllAsReadForCloser
http.route({
  path: "/markAllAsReadForCloser",
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
// REINFORCEMENT REQUESTS ENDPOINTS (for desktop app and web dashboard)
// ============================================

// POST endpoint to create a reinforcement request (closer needs help)
http.route({
  path: "/requestReinforcement",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { teamId, closerId, closerName, callId, message } = body;

      if (!teamId || !closerId || !closerName) {
        return new Response(JSON.stringify({ error: "teamId, closerId, and closerName are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runMutation(api.reinforcements.createRequest, {
        teamId: teamId as Id<"teams">,
        closerId: closerId as Id<"closers">,
        closerName,
        callId: callId ? (callId as Id<"calls">) : undefined,
        message: message || undefined,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error creating reinforcement request:", error);
      return new Response(JSON.stringify({ error: "Failed to create request" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for requestReinforcement
http.route({
  path: "/requestReinforcement",
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

// GET endpoint to get active reinforcement requests for a team
http.route({
  path: "/getActiveReinforcements",
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
      const requests = await ctx.runQuery(api.reinforcements.getActiveRequestsForTeam, {
        teamId: teamId as Id<"teams">,
      });

      return new Response(JSON.stringify(requests || []), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error getting active reinforcements:", error);
      return new Response(JSON.stringify({ error: "Failed to get requests" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for getActiveReinforcements
http.route({
  path: "/getActiveReinforcements",
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

// POST endpoint to acknowledge a reinforcement request
http.route({
  path: "/acknowledgeReinforcement",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { requestId, userId } = body;

      if (!requestId || !userId) {
        return new Response(JSON.stringify({ error: "requestId and userId are required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runMutation(api.reinforcements.acknowledgeRequest, {
        requestId: requestId as Id<"reinforcementRequests">,
        userId: userId as Id<"users">,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error acknowledging reinforcement:", error);
      return new Response(JSON.stringify({ error: "Failed to acknowledge request" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for acknowledgeReinforcement
http.route({
  path: "/acknowledgeReinforcement",
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

// POST endpoint to resolve a reinforcement request
http.route({
  path: "/resolveReinforcement",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { requestId } = body;

      if (!requestId) {
        return new Response(JSON.stringify({ error: "requestId is required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const result = await ctx.runMutation(api.reinforcements.resolveRequest, {
        requestId: requestId as Id<"reinforcementRequests">,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error resolving reinforcement:", error);
      return new Response(JSON.stringify({ error: "Failed to resolve request" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for resolveReinforcement
http.route({
  path: "/resolveReinforcement",
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

// POST endpoint to submit diagnostic report from macOS app
http.route({
  path: "/submitDiagnosticReport",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();

      // Validate required fields
      if (!body.reportId) {
        return new Response(JSON.stringify({ error: "reportId is required" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Transform the report for storage
      // Convert Date objects to ISO strings for nested objects
      const transformedReport = {
        reportId: body.reportId,
        closerId: body.closerId || undefined,
        teamId: body.teamId || undefined,
        closerEmail: body.closerEmail || undefined,
        userDescription: body.userDescription || undefined,
        system: body.system,
        audio: body.audio,
        websocket: {
          ...body.websocket,
          reconnectionHistory: (body.websocket?.reconnectionHistory || []).map((event: { timestamp: string; reason: string }) => ({
            timestamp: typeof event.timestamp === 'string' ? event.timestamp : new Date(event.timestamp).toISOString(),
            reason: event.reason,
          })),
        },
        call: body.call,
        meetingBot: body.meetingBot ? {
          ...body.meetingBot,
          lastBotErrorAt: body.meetingBot.lastBotErrorAt
            ? (typeof body.meetingBot.lastBotErrorAt === 'string'
                ? body.meetingBot.lastBotErrorAt
                : new Date(body.meetingBot.lastBotErrorAt).toISOString())
            : undefined,
        } : undefined,
        ammoPanel: body.ammoPanel || undefined,
        api: body.api ? {
          ...body.api,
          lastApiErrorAt: body.api.lastApiErrorAt
            ? (typeof body.api.lastApiErrorAt === 'string'
                ? body.api.lastApiErrorAt
                : new Date(body.api.lastApiErrorAt).toISOString())
            : undefined,
        } : undefined,
        permissions: body.permissions,
        logs: {
          ...body.logs,
          recentLogs: (body.logs?.recentLogs || []).map((log: { timestamp: string; level: string; category: string; message: string }) => ({
            timestamp: typeof log.timestamp === 'string' ? log.timestamp : new Date(log.timestamp).toISOString(),
            level: log.level,
            category: log.category,
            message: log.message,
          })),
          lastErrorTimestamp: body.logs?.lastErrorTimestamp
            ? (typeof body.logs.lastErrorTimestamp === 'string'
                ? body.logs.lastErrorTimestamp
                : new Date(body.logs.lastErrorTimestamp).toISOString())
            : undefined,
        },
        createdAt: Date.now(),
      };

      // Store the diagnostic report
      await ctx.runMutation(internal.diagnostics.storeDiagnosticReport, transformedReport);

      console.log(`[HTTP] Diagnostic report stored: ${body.reportId} from closer ${body.closerId || 'unknown'}`);

      return new Response(JSON.stringify({ success: true, reportId: body.reportId }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP] Error storing diagnostic report:", error);
      return new Response(JSON.stringify({ error: "Failed to store diagnostic report" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight for submitDiagnosticReport
http.route({
  path: "/submitDiagnosticReport",
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
// CALL GOING LONG NOTIFICATION
// ============================================

// POST endpoint for closers to notify that their call is running long
http.route({
  path: "/callGoingLong",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId, callId, teamId, estimatedMinutes } = body;

      if (!closerId || !teamId) {
        return new Response(
          JSON.stringify({ error: "closerId and teamId are required" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      // Schedule the notification
      await ctx.scheduler.runAfter(0, internal.slack.sendCallGoingLongNotification, {
        closerId: closerId as Id<"closers">,
        callId: callId as Id<"calls"> | undefined,
        teamId: teamId as Id<"teams">,
        estimatedMinutes: typeof estimatedMinutes === "number" ? estimatedMinutes : undefined,
      });

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } catch (error) {
      console.error("[HTTP] Error in callGoingLong:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
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

// Handle CORS preflight for callGoingLong
http.route({
  path: "/callGoingLong",
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
// MEETING BAAS WEBHOOK HANDLER
// ============================================

http.route({
  path: "/webhooks/meetingbaas",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let body: any;
    try {
      body = await request.json();
    } catch (error) {
      console.error("[webhook] Failed to parse body:", error);
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const eventType = body.event || body.type;
    const botData = body.data || body;
    // Meeting BaaS v2 puts bot_id at top level, not nested in data
    const meetingBaasId = body.bot_id || botData.bot_id || botData.id;

    // Log full payload for debugging (first 1000 chars)
    console.log(`[webhook] Full payload: ${JSON.stringify(body).substring(0, 1000)}`);

    if (!meetingBaasId) {
      console.error("[webhook] No bot ID in payload:", JSON.stringify(body));
      return new Response(JSON.stringify({ error: "Missing bot ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[webhook] Event: ${eventType} for bot: ${meetingBaasId}`);

    // Normalize event type — Meeting BaaS v2 uses "meeting.started", "meeting.completed", etc.
    // while earlier versions used "complete", "failed", "bot.in_call", etc.
    const normalizedEvent = (() => {
      switch (eventType) {
        // Meeting BaaS v2 event names
        case "meeting.started": return "bot_active";
        case "meeting.completed": return "bot_completed";
        case "meeting.failed": return "bot_failed";
        case "transcription.available": return "transcription";
        case "transcription.updated": return "transcription";
        // Meeting BaaS v1/legacy event names
        case "complete": return "bot_completed";
        case "failed": return "bot_failed";
        case "transcription_complete": return "transcription";
        // Original handler event names (kept for compatibility)
        case "bot.joining": return "bot_joining";
        case "bot.in_call": return "bot_active";
        case "bot.recording": return "bot_recording";
        case "bot.completed": return "bot_completed";
        case "bot.failed": return "bot_failed";
        case "bot.left": return "bot_left";
        // Status change wrapper (v2 may also send this)
        case "bot.status_change": return "bot_status_change";
        default: return "unknown";
      }
    })();

    console.log(`[webhook] Normalized event: ${normalizedEvent} (raw: ${eventType})`);

    try {
      switch (normalizedEvent) {
        case "bot_joining": {
          await ctx.runMutation(api.meetingBot.updateBotStatus, {
            meetingBaasId,
            status: "joining",
          });
          break;
        }

        case "bot_active": {
          // Bot has joined the meeting — set status to "active"
          await ctx.runMutation(api.meetingBot.updateBotStatus, {
            meetingBaasId,
            status: "active",
            joinedAt: Date.now(),
          });

          // Check if audio processor already created and linked a call
          const botRecord = await ctx.runQuery(api.meetingBot.getBotByMeetingBaasId, {
            meetingBaasId,
          });

          if (botRecord?.callId) {
            // Audio processor already linked a call — use it (has ammo/transcript data)
            console.log(`[webhook] Bot active, call already linked by audio processor: ${botRecord.callId}`);
          } else if (botRecord) {
            // No call linked yet — create one as fallback (audio processor may be slow)
            const callId = await ctx.runMutation(api.meetingBot.createCallFromBot, {
              closerId: botRecord.closerId,
              teamId: botRecord.teamId,
              meetingBotId: botRecord._id,
              prospectName: botRecord.prospectName,
            });

            await ctx.runMutation(api.meetingBot.updateBotStatus, {
              meetingBaasId,
              callId,
            });

            console.log(`[webhook] Bot active, created fallback call: ${callId}`);
          }
          break;
        }

        case "bot_recording": {
          // Recording event may carry the recording URL
          const recUrl = body.recording_url || body.mp4 || botData.recording_url || botData.mp4 || botData.recording || botData.video_url;
          console.log(`[webhook] Bot recording event: ${meetingBaasId}, url: ${recUrl || "NONE"}`);
          console.log(`[webhook] recording event payload: ${JSON.stringify(body).substring(0, 2000)}`);

          if (recUrl) {
            await ctx.runMutation(api.meetingBot.updateBotStatus, {
              meetingBaasId,
              status: "active",
              recordingUrl: recUrl,
            });
          }
          break;
        }

        case "bot_completed": {
          // Log full payload to debug recording URL extraction
          console.log(`[webhook] completed body keys: ${Object.keys(body).join(", ")}`);
          console.log(`[webhook] completed botData keys: ${Object.keys(botData).join(", ")}`);
          console.log(`[webhook] completed full payload: ${JSON.stringify(body).substring(0, 2000)}`);

          // Check all possible field names across Meeting BaaS v1 and v2
          // v2 uses "video" and "audio" fields for recording URLs
          const recordingUrl = body.video || body.recording_url || body.mp4 || body.recording || body.video_url
            || botData.video || botData.recording_url || botData.mp4 || botData.recording || botData.mp4_url || botData.video_url;
          const recordingDuration = body.recording_duration || body.duration || body.duration_seconds
            || botData.recording_duration || botData.duration || botData.duration_seconds;

          console.log(`[webhook] Extracted recordingUrl: ${recordingUrl || "NONE"}, duration: ${recordingDuration || "NONE"}`);
          const endedAt = Date.now();

          await ctx.runMutation(api.meetingBot.updateBotStatus, {
            meetingBaasId,
            status: "completed",
            endedAt,
            recordingUrl,
            recordingDuration,
            questionnaireCompleted: false,
          });

          // Complete linked call
          const completedBot = await ctx.runQuery(api.meetingBot.getBotByMeetingBaasId, {
            meetingBaasId,
          });

          if (completedBot?.callId) {
            await ctx.runMutation(api.meetingBot.completeCallFromBot, {
              callId: completedBot.callId,
              endedAt,
              recordingUrl,
              duration: recordingDuration,
            });
            console.log(`[webhook] Completed call: ${completedBot.callId}`);
          }

          // If no recording URL in webhook payload, schedule a delayed API fetch
          if (!recordingUrl) {
            console.log(`[webhook] No recording URL in bot_completed payload, scheduling API fetch for ${meetingBaasId}`);
            await ctx.runMutation(internal.meetingBot.scheduleRecordingFetch, {
              meetingBaasId,
              delayMs: 30000, // 30 seconds — give Meeting BaaS time to process recording
            });
          }
          break;
        }

        case "bot_failed": {
          const failureReason = body.error || body.message || botData.error || botData.failure_reason || botData.message || "Unknown failure";
          await ctx.runMutation(api.meetingBot.updateBotStatus, {
            meetingBaasId,
            status: "failed",
            failureReason,
          });
          console.error(`[webhook] Bot failed: ${meetingBaasId}, reason: ${failureReason}`);
          break;
        }

        case "bot_left": {
          const leftBot = await ctx.runQuery(api.meetingBot.getBotByMeetingBaasId, {
            meetingBaasId,
          });

          if (leftBot && leftBot.status !== "completed") {
            const wasKicked = botData.reason === "kicked" || botData.kicked === true;
            await ctx.runMutation(api.meetingBot.updateBotStatus, {
              meetingBaasId,
              status: wasKicked ? "kicked" : "completed",
              endedAt: Date.now(),
            });

            if (leftBot.callId) {
              await ctx.runMutation(api.meetingBot.completeCallFromBot, {
                callId: leftBot.callId,
                endedAt: Date.now(),
              });
            }

            // Schedule recording URL fetch — bot_left doesn't include recording URL
            await ctx.runMutation(internal.meetingBot.scheduleRecordingFetch, {
              meetingBaasId,
              delayMs: 30000,
            });
          }
          break;
        }

        case "bot_status_change": {
          // v2 may send a status_change wrapper with a nested status field
          const status = botData.status || body.status;
          console.log(`[webhook] bot.status_change — status: ${status}`);
          if (status === "joining") {
            await ctx.runMutation(api.meetingBot.updateBotStatus, { meetingBaasId, status: "joining" });
          } else if (status === "in_call" || status === "active" || status === "recording") {
            await ctx.runMutation(api.meetingBot.updateBotStatus, { meetingBaasId, status: "active", joinedAt: Date.now() });
          } else if (status === "ended" || status === "completed") {
            await ctx.runMutation(api.meetingBot.updateBotStatus, { meetingBaasId, status: "completed", endedAt: Date.now() });
          }
          break;
        }

        case "transcription": {
          console.log(`[webhook] Transcription event for bot: ${meetingBaasId}`);
          break;
        }

        default: {
          console.log(`[webhook] Unhandled event: ${eventType} (normalized: ${normalizedEvent}), full body: ${JSON.stringify(body).substring(0, 500)}`);
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error(`[webhook] Error processing ${eventType}:`, error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

http.route({
  path: "/webhooks/meetingbaas",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-meeting-baas-api-key",
      },
    });
  }),
});

// ============================================
// RECALL.AI WEBHOOK HANDLER
// ============================================

http.route({
  path: "/webhooks/recall",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let body: any;
    try {
      body = await request.json();
    } catch (error) {
      console.error("[recall-webhook] Failed to parse body:", error);
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Recall.ai Svix webhook format
    const eventType = body.event;
    const recallBotId = body.data?.bot?.id;
    const eventData = body.data?.data;

    // Log full payload for debugging (first 1000 chars)
    console.log(`[recall-webhook] Full payload: ${JSON.stringify(body).substring(0, 1000)}`);

    if (!recallBotId) {
      console.error("[recall-webhook] No bot ID in payload:", JSON.stringify(body));
      return new Response(JSON.stringify({ error: "Missing bot ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[recall-webhook] Event: ${eventType} for bot: ${recallBotId}`);

    try {
      switch (eventType) {
        case "bot.joining_call": {
          await ctx.runMutation(api.meetingBot.updateBotStatus, {
            recallBotId,
            status: "joining",
          });
          break;
        }

        case "bot.in_waiting_room": {
          console.log(`[recall-webhook] Bot in waiting room: ${recallBotId}`);
          break;
        }

        case "bot.in_call_not_recording":
        case "bot.in_call_recording": {
          // Bot has joined — set status to "active"
          // The audio processor creates the call record via callHandler.start()
          // and links it via linkCallToBot, so no fallback call needed here.
          await ctx.runMutation(api.meetingBot.updateBotStatus, {
            recallBotId,
            status: "active",
            joinedAt: Date.now(),
          });

          const botRecord = await ctx.runQuery(api.meetingBot.getBotByRecallId, {
            recallBotId,
          });

          if (botRecord?.callId) {
            console.log(`[recall-webhook] Bot active, call linked by audio processor: ${botRecord.callId}`);
          } else {
            console.log(`[recall-webhook] Bot active, waiting for audio processor to create call`);
          }
          break;
        }

        case "bot.call_ended": {
          // Bot detected call ended, recording being processed
          console.log(`[recall-webhook] Call ended for bot: ${recallBotId}, waiting for bot.done`);
          break;
        }

        case "bot.done": {
          // Bot fully done — recording available
          const endedAt = Date.now();
          await ctx.runMutation(api.meetingBot.updateBotStatus, {
            recallBotId,
            status: "completed",
            endedAt,
            questionnaireCompleted: false,
          });

          // Complete linked call
          const completedBot = await ctx.runQuery(api.meetingBot.getBotByRecallId, {
            recallBotId,
          });

          if (completedBot?.callId) {
            await ctx.runMutation(api.meetingBot.completeCallFromBot, {
              callId: completedBot.callId,
              endedAt,
            });
            console.log(`[recall-webhook] Completed call: ${completedBot.callId}`);
          }

          // Schedule recording URL fetch (Recall doesn't include it in webhook)
          await ctx.runMutation(internal.meetingBot.scheduleRecordingFetch, {
            recallBotId,
            delayMs: 3000, // Recall is fast, 3s should be enough
          });
          break;
        }

        case "bot.fatal": {
          const failureReason = eventData?.sub_code || eventData?.code || "Unknown failure";
          await ctx.runMutation(api.meetingBot.updateBotStatus, {
            recallBotId,
            status: "failed",
            failureReason,
          });
          console.error(`[recall-webhook] Bot fatal: ${recallBotId}, reason: ${failureReason}`);
          break;
        }

        default: {
          console.log(`[recall-webhook] Unhandled event: ${eventType}, full body: ${JSON.stringify(body).substring(0, 500)}`);
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error(`[recall-webhook] Error processing ${eventType}:`, error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

http.route({
  path: "/webhooks/recall",
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
// MEETING BOT HTTP ROUTES
// ============================================

// Check if team has meeting bot enabled
http.route({
  path: "/isMeetingBotEnabled",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const teamId = body.teamId;

      if (!teamId) {
        return new Response(JSON.stringify({ error: "teamId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const enabled = await ctx.runQuery(api.meetingBot.isMeetingBotEnabled, {
        teamId: teamId as Id<"teams">,
      });

      return new Response(JSON.stringify({ enabled }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in isMeetingBotEnabled:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/isMeetingBotEnabled",
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

// Check if closer needs calendar onboarding
http.route({
  path: "/needsCalendarOnboarding",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const closerId = body.closerId;

      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const needsOnboarding = await ctx.runQuery(api.meetingBot.needsCalendarOnboarding, {
        closerId: closerId as Id<"closers">,
      });

      return new Response(JSON.stringify({ needsOnboarding }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in needsCalendarOnboarding:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/needsCalendarOnboarding",
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

// Get active bot call for closer
http.route({
  path: "/getActiveCallForCloserBot",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const closerId = body.closerId;

      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const result = await ctx.runMutation(api.meetingBot.getActiveCallForCloserBot, {
        closerId: closerId as Id<"closers">,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in getActiveCallForCloserBot:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getActiveCallForCloserBot",
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

// Get pending questionnaire count for closer
http.route({
  path: "/getPendingQuestionnaireCount",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const closerId = body.closerId;

      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const pendingBots = await ctx.runQuery(api.meetingBot.getPendingQuestionnaires, {
        closerId: closerId as Id<"closers">,
      });

      // Find the first pending bot that has a linked callId (some old bots may not)
      const firstBotWithCall = pendingBots.find((bot: any) => bot.callId) || null;
      const firstBot = firstBotWithCall || (pendingBots.length > 0 ? pendingBots[0] : null);
      return new Response(JSON.stringify({
        count: pendingBots.length,
        firstCallId: firstBot?.callId ?? null,
        firstProspectName: firstBot?.prospectName ?? firstBot?.meetingTitle ?? null,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in getPendingQuestionnaireCount:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getPendingQuestionnaireCount",
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

// Get upcoming bots for closer
http.route({
  path: "/getUpcomingBotsForCloser",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const closerId = body.closerId;

      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const bots = await ctx.runQuery(api.meetingBot.getUpcomingBots, {
        closerId: closerId as Id<"closers">,
      });

      return new Response(JSON.stringify({ bots }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in getUpcomingBotsForCloser:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getUpcomingBotsForCloser",
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

// Cancel/kick a bot
http.route({
  path: "/cancelBot",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const botId = body.botId;

      if (!botId) {
        return new Response(JSON.stringify({ error: "botId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const result = await ctx.runAction(api.meetingBot.cancelBot, {
        botId: botId as Id<"meetingBots">,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in cancelBot:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/cancelBot",
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

// Create a quick bot (ad-hoc meeting)
http.route({
  path: "/createQuickBot",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { meetingUrl, closerId, teamId, prospectName } = body;

      if (!meetingUrl || !closerId || !teamId) {
        return new Response(JSON.stringify({ error: "meetingUrl, closerId, and teamId are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const result = await ctx.runAction(api.meetingBot.createQuickBot, {
        meetingUrl,
        closerId: closerId as Id<"closers">,
        teamId: teamId as Id<"teams">,
        prospectName: prospectName || undefined,
      });

      return new Response(JSON.stringify({ success: true, botId: result.botId }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in createQuickBot:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/createQuickBot",
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

// Exclude a calendar event from bot auto-join
http.route({
  path: "/excludeCalendarEvent",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId, calendarEventId, eventTitle } = body;

      if (!closerId || !calendarEventId) {
        return new Response(JSON.stringify({ error: "closerId and calendarEventId are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      await ctx.runMutation(api.meetingBot.excludeCalendarEvent, {
        closerId: closerId as Id<"closers">,
        calendarEventId,
        eventTitle: eventTitle || undefined,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in excludeCalendarEvent:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/excludeCalendarEvent",
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

// Get closer dashboard stats
http.route({
  path: "/getCloserStats",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId, period } = body;

      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const stats = await ctx.runQuery(api.meetingBot.getCloserDashboardStats, {
        closerId: closerId as Id<"closers">,
        period: period || "week",
      });

      return new Response(JSON.stringify(stats), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in getCloserStats:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getCloserStats",
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

// Mark calendar onboarding as completed
http.route({
  path: "/markOnboardingCompleted",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const closerId = body.closerId;

      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      await ctx.runMutation(api.calendarOAuth.markOnboardingCompleted, {
        closerId: closerId as Id<"closers">,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in markOnboardingCompleted:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/markOnboardingCompleted",
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

// Save meeting platform preference
http.route({
  path: "/saveMeetingPlatform",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId, platform } = body;

      if (!closerId || !platform) {
        return new Response(JSON.stringify({ error: "closerId and platform are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      await ctx.runMutation(api.meetingBot.saveMeetingPlatform, {
        closerId: closerId as Id<"closers">,
        platform,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in saveMeetingPlatform:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/saveMeetingPlatform",
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

// Get call history for closer
http.route({
  path: "/getCallHistory",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId, limit } = body;

      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const calls = await ctx.runQuery(api.meetingBot.getCallHistoryForCloser, {
        closerId: closerId as Id<"closers">,
        limit: typeof limit === "number" ? limit : undefined,
      });

      return new Response(JSON.stringify({ calls }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in getCallHistory:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getCallHistory",
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

// Create a meeting bot on demand (called when closer clicks "Join & Record")
http.route({
  path: "/createBotForMeeting",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId, teamId, meetingUrl, meetingTitle, prospectName } = body;

      if (!closerId || !teamId || !meetingUrl) {
        return new Response(JSON.stringify({ error: "closerId, teamId, and meetingUrl are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const result = await ctx.runAction(api.meetingBot.createBot, {
        meetingUrl,
        closerId: closerId as Id<"closers">,
        teamId: teamId as Id<"teams">,
        meetingTitle: meetingTitle || undefined,
        prospectName: prospectName || undefined,
      });

      return new Response(JSON.stringify({ success: true, botId: result.botId, recallBotId: result.recallBotId }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in createBotForMeeting:", error);
      return new Response(JSON.stringify({ error: "Failed to create bot" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/createBotForMeeting",
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

// Helper to map desktop period names to analytics date ranges
function mapPeriodToDateRange(period: string): string {
  switch (period) {
    case "today": return "last_7_days";
    case "week": return "this_week";
    case "month": return "this_month";
    case "last30": return "last_30_days";
    default: return "last_30_days";
  }
}

// Get closer analytics summary (money view)
http.route({
  path: "/getCloserAnalyticsSummary",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId, teamId, period } = body;

      if (!closerId || !teamId) {
        return new Response(JSON.stringify({ error: "closerId and teamId are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const result = await ctx.runQuery(api.analytics.getAnalyticsSummary, {
        teamId: teamId as Id<"teams">,
        dateRange: mapPeriodToDateRange(period || "week"),
        closerId: closerId as Id<"closers">,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in getCloserAnalyticsSummary:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getCloserAnalyticsSummary",
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

// Get closer lost deals by objection
http.route({
  path: "/getCloserLostDeals",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId, teamId, period } = body;

      if (!closerId || !teamId) {
        return new Response(JSON.stringify({ error: "closerId and teamId are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const result = await ctx.runQuery(api.analytics.getLostDealsByObjection, {
        teamId: teamId as Id<"teams">,
        dateRange: mapPeriodToDateRange(period || "week"),
        closerId: closerId as Id<"closers">,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in getCloserLostDeals:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getCloserLostDeals",
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

// Get closer objection analysis
http.route({
  path: "/getCloserObjectionAnalysis",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId, teamId, period } = body;

      if (!closerId || !teamId) {
        return new Response(JSON.stringify({ error: "closerId and teamId are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const result = await ctx.runQuery(api.analytics.getObjectionAnalysis, {
        teamId: teamId as Id<"teams">,
        dateRange: mapPeriodToDateRange(period || "week"),
        closerId: closerId as Id<"closers">,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in getCloserObjectionAnalysis:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getCloserObjectionAnalysis",
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

// ──────────────────────────────────────────────
// Call Reviews HTTP Endpoints (desktop app)
// ──────────────────────────────────────────────

// Get calls with manager feedback for a closer (Coaching > Your Feedback)
http.route({
  path: "/getFeedbackForCloser",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId, limit } = body;

      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const feedback = await ctx.runQuery(api.callReviews.getFeedbackForCloser, {
        closerId: closerId as Id<"closers">,
        limit: typeof limit === "number" ? limit : undefined,
      });

      return new Response(JSON.stringify({ calls: feedback }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in getFeedbackForCloser:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getFeedbackForCloser",
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

// Get comments for a specific call
http.route({
  path: "/getCommentsForCall",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId } = body;

      if (!callId) {
        return new Response(JSON.stringify({ error: "callId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const comments = await ctx.runQuery(api.callReviews.getCommentsForCall, {
        callId: callId as Id<"calls">,
      });

      return new Response(JSON.stringify({ comments }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in getCommentsForCall:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getCommentsForCall",
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

// Add a comment to a call
http.route({
  path: "/addCallComment",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId, teamId, authorType, authorId, authorName, content, timestampSeconds, parentCommentId } = body;

      if (!callId || !authorType || !authorId || !authorName || !content) {
        return new Response(JSON.stringify({ error: "callId, authorType, authorId, authorName, and content are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // Look up teamId from the call if not provided (desktop app doesn't send it)
      let resolvedTeamId = teamId;
      if (!resolvedTeamId) {
        const call = await ctx.runQuery(api.callReviews.getCallForReview, {
          callId: callId as Id<"calls">,
        });
        if (!call) {
          return new Response(JSON.stringify({ error: "Call not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
        resolvedTeamId = call.teamId;
      }

      const commentId = await ctx.runMutation(api.callReviews.addComment, {
        callId: callId as Id<"calls">,
        teamId: resolvedTeamId as Id<"teams">,
        authorType,
        authorId,
        authorName,
        content,
        timestampSeconds: typeof timestampSeconds === "number" ? timestampSeconds : undefined,
        parentCommentId: parentCommentId ? parentCommentId as Id<"callComments"> : undefined,
      });

      return new Response(JSON.stringify({ success: true, commentId }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in addCallComment:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/addCallComment",
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

// Flag a call for review
http.route({
  path: "/flagCallForReview",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId } = body;

      if (!callId) {
        return new Response(JSON.stringify({ error: "callId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      await ctx.runMutation(api.callReviews.flagCallForReview, {
        callId: callId as Id<"calls">,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in flagCallForReview:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/flagCallForReview",
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

// Unflag a call
http.route({
  path: "/unflagCall",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId } = body;

      if (!callId) {
        return new Response(JSON.stringify({ error: "callId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      await ctx.runMutation(api.callReviews.unflagCall, {
        callId: callId as Id<"calls">,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in unflagCall:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/unflagCall",
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

// Get shared moments for a closer's team (Coaching > Shared with You)
http.route({
  path: "/getSharedMoments",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId, limit } = body;

      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // Look up the closer's team
      const closer = await ctx.runQuery(api.closers.getCloserById, {
        closerId: closerId as string,
      }) as { teamId: string } | null;

      if (!closer) {
        return new Response(JSON.stringify({ error: "Closer not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const moments = await ctx.runQuery(api.callReviews.getSharedMoments, {
        teamId: closer.teamId as Id<"teams">,
        closerId: closerId as string,
        limit: typeof limit === "number" ? limit : undefined,
      });

      return new Response(JSON.stringify({ moments }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in getSharedMoments:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getSharedMoments",
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

// Get unread shared moments count for a closer
http.route({
  path: "/getUnreadSharedMomentsCount",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId } = body;
      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      const result = await ctx.runQuery(api.callReviews.getUnreadSharedMomentsCount, {
        closerId: closerId as Id<"closers">,
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in getUnreadSharedMomentsCount:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getUnreadSharedMomentsCount",
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

// Mark shared moments as seen for a closer
http.route({
  path: "/markSharedMomentsSeen",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId } = body;
      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      await ctx.runMutation(api.callReviews.markSharedMomentsSeen, {
        closerId: closerId as Id<"closers">,
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in markSharedMomentsSeen:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/markSharedMomentsSeen",
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

// Get unread feedback count for a closer (badge count)
http.route({
  path: "/getUnreadFeedbackCount",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId } = body;

      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const result = await ctx.runQuery(api.callReviews.getUnreadFeedbackCount, {
        closerId: closerId as Id<"closers">,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in getUnreadFeedbackCount:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getUnreadFeedbackCount",
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

// Mark feedback as read for a closer
http.route({
  path: "/markFeedbackRead",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId } = body;

      if (!callId) {
        return new Response(JSON.stringify({ error: "callId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      await ctx.runMutation(api.callReviews.markFeedbackRead, {
        callId: callId as Id<"calls">,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in markFeedbackRead:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/markFeedbackRead",
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

// Refresh recording URL (re-fetch from Recall.ai for expired signed URLs)
http.route({
  path: "/refreshRecordingUrl",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId } = body;
      if (!callId) {
        return new Response(JSON.stringify({ error: "callId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      const result = await ctx.runAction(api.meetingBot.refreshRecordingUrl, {
        callId: callId as Id<"calls">,
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in refreshRecordingUrl:", error);
      return new Response(JSON.stringify({ error: "Failed to refresh recording URL" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/refreshRecordingUrl",
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

// ──────────────────────────────────────────────
// SHARED LINKS (public share URLs for call recordings)
// ──────────────────────────────────────────────

// Create a shared link (used by desktop app and web dashboard)
http.route({
  path: "/createSharedLink",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId, teamId, shareType, startSeconds, endSeconds, includeComments, createdBy, createdByType } = body;

      if (!callId || !teamId) {
        return new Response(JSON.stringify({ error: "callId and teamId are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const result = await ctx.runMutation(api.sharedLinks.createSharedLink, {
        callId: callId as Id<"calls">,
        teamId: teamId as Id<"teams">,
        shareType: shareType || "full",
        startSeconds: startSeconds ?? undefined,
        endSeconds: endSeconds ?? undefined,
        includeComments: includeComments ?? false,
        createdBy: createdBy || "unknown",
        createdByType: createdByType || "closer",
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error: any) {
      console.error("[HTTP] Error in createSharedLink:", error);
      return new Response(JSON.stringify({ error: error?.message || "Failed to create shared link" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/createSharedLink",
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

// Get shared link data for the public page (called by fetch() from the public share page)
http.route({
  path: "/getSharedLinkData",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { token } = body;

      if (!token || typeof token !== "string") {
        return new Response(JSON.stringify({ error: "token is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const data = await ctx.runQuery(internal.sharedLinks.getSharedLinkByToken, { token });

      if (!data) {
        return new Response(JSON.stringify({ error: "Shared link not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      if (data.revoked) {
        return new Response(JSON.stringify({ error: "This shared link has been revoked" }), {
          status: 410,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // At this point data.revoked is false, so call data is present
      const callData = data.call!;

      // Refresh the recording URL (Recall.ai signed URLs expire after ~24h)
      let freshRecordingUrl = callData.recordingUrl;
      if (callData.recordingUrl && data.callId) {
        try {
          const refreshResult = await ctx.runAction(api.meetingBot.refreshRecordingUrl, {
            callId: data.callId as Id<"calls">,
          });
          if (refreshResult.recordingUrl) {
            freshRecordingUrl = refreshResult.recordingUrl;
          }
        } catch (err) {
          console.error("[HTTP] Failed to refresh recording URL for shared link:", err);
          // Fall back to stored URL
        }
      }

      // Strip internal callId from public response
      const { callId: _callId, ...publicData } = data;
      return new Response(JSON.stringify({
        ...publicData,
        call: {
          ...callData,
          recordingUrl: freshRecordingUrl,
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error: any) {
      console.error("[HTTP] Error in getSharedLinkData:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getSharedLinkData",
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

export default http;
