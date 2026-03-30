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

// POST endpoint to submit diagnostic report
http.route({
  path: "/submitDiagnosticReport",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const corsHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    };
    // Convex v.optional() accepts undefined but NOT null.
    // JSON from Electron serializes null values, so strip them recursively.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function stripNulls(obj: any): any {
      if (obj === null || obj === undefined) return undefined;
      if (Array.isArray(obj)) return obj.map(stripNulls);
      if (typeof obj === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cleaned: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value !== null && value !== undefined) {
            cleaned[key] = stripNulls(value);
          }
        }
        return cleaned;
      }
      return obj;
    }

    try {
      const rawBody = await request.json();
      const body = stripNulls(rawBody);

      if (!body.reportId) {
        return new Response(JSON.stringify({ error: "reportId is required" }), {
          status: 400, headers: corsHeaders,
        });
      }

      // Build report with only present sections (per-section try/catch)
      const report = {
        reportId: body.reportId as string,
        appType: (body.appType || undefined) as string | undefined,
        closerId: (body.closerId || undefined) as string | undefined,
        teamId: (body.teamId || undefined) as string | undefined,
        closerEmail: (body.closerEmail || undefined) as string | undefined,
        userDescription: (body.userDescription || undefined) as string | undefined,
        createdAt: Date.now(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // System — pass through as-is (all fields optional)
      if (body.system) {
        try { report.system = body.system; } catch (e) {
          console.error("[HTTP] Error transforming system diagnostics:", e);
        }
      }

      // Audio — pass through as-is
      if (body.audio) {
        try { report.audio = body.audio; } catch (e) {
          console.error("[HTTP] Error transforming audio diagnostics:", e);
        }
      }

      // WebSocket — normalize reconnectionHistory timestamps
      if (body.websocket) {
        try {
          const ws = { ...body.websocket };
          if (ws.reconnectionHistory) {
            ws.reconnectionHistory = ws.reconnectionHistory.map(
              (event: { timestamp: string | number; reason: string }) => ({
                timestamp: typeof event.timestamp === 'string'
                  ? event.timestamp : new Date(event.timestamp).toISOString(),
                reason: event.reason,
              })
            );
          }
          report.websocket = ws;
        } catch (e) {
          console.error("[HTTP] Error transforming websocket diagnostics:", e);
        }
      }

      // Call — pass through
      if (body.call) {
        try { report.call = body.call; } catch (e) {
          console.error("[HTTP] Error transforming call diagnostics:", e);
        }
      }

      // Permissions — pass through
      if (body.permissions) {
        try { report.permissions = body.permissions; } catch (e) {
          console.error("[HTTP] Error transforming permissions diagnostics:", e);
        }
      }

      // Logs — normalize timestamps
      if (body.logs) {
        try {
          const logs = { ...body.logs };
          if (logs.recentLogs) {
            logs.recentLogs = logs.recentLogs.map(
              (log: { timestamp: string | number; level: string; category: string; message: string }) => ({
                timestamp: typeof log.timestamp === 'string'
                  ? log.timestamp : new Date(log.timestamp).toISOString(),
                level: log.level,
                category: log.category,
                message: log.message,
              })
            );
          }
          if (logs.lastErrorTimestamp && typeof logs.lastErrorTimestamp !== 'string') {
            logs.lastErrorTimestamp = new Date(logs.lastErrorTimestamp).toISOString();
          }
          report.logs = logs;
        } catch (e) {
          console.error("[HTTP] Error transforming logs diagnostics:", e);
        }
      }

      // Meeting bot — normalize timestamps
      if (body.meetingBot) {
        try {
          const mb = { ...body.meetingBot };
          if (mb.lastBotErrorAt && typeof mb.lastBotErrorAt !== 'string') {
            mb.lastBotErrorAt = new Date(mb.lastBotErrorAt).toISOString();
          }
          report.meetingBot = mb;
        } catch (e) {
          console.error("[HTTP] Error transforming meetingBot diagnostics:", e);
        }
      }

      // Ammo panel — pass through
      if (body.ammoPanel) {
        try { report.ammoPanel = body.ammoPanel; } catch (e) {
          console.error("[HTTP] Error transforming ammoPanel diagnostics:", e);
        }
      }

      // API errors — normalize timestamps
      if (body.api) {
        try {
          const api = { ...body.api };
          if (api.lastApiErrorAt && typeof api.lastApiErrorAt !== 'string') {
            api.lastApiErrorAt = new Date(api.lastApiErrorAt).toISOString();
          }
          report.api = api;
        } catch (e) {
          console.error("[HTTP] Error transforming api diagnostics:", e);
        }
      }

      await ctx.runMutation(internal.diagnostics.storeDiagnosticReport, report);
      console.log(`[HTTP] Diagnostic report stored: ${body.reportId} from ${body.appType || 'unknown'} closer ${body.closerId || 'unknown'}`);

      return new Response(JSON.stringify({ success: true, reportId: body.reportId }), {
        status: 200, headers: corsHeaders,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[HTTP] Error storing diagnostic report:", errorMessage);
      return new Response(JSON.stringify({ error: "Failed to store diagnostic report", detail: errorMessage }), {
        status: 500, headers: corsHeaders,
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
// RECALL.AI TRANSCRIPT WEBHOOK (real-time transcription via webhook)
// ============================================

http.route({
  path: "/recall-transcript-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      // Verify webhook token
      const url = new URL(request.url);
      const token = url.searchParams.get("token");
      const expectedToken = process.env.RECALL_TRANSCRIPT_WEBHOOK_SECRET;
      if (!token || !expectedToken || token !== expectedToken) {
        console.error("[TranscriptWebhook] Invalid or missing token");
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }

      const body = await request.json();
      const eventType = body.event;

      if (eventType !== "transcript.data") {
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // Extract transcript data
      const transcriptData = body.data?.data || body.data;
      const words = transcriptData?.words || [];
      const text = words.map((w: any) => w.text).join(" ");
      const participantName = transcriptData?.participant?.name || "Unknown";
      const startTimestamp = words[0]?.start_timestamp?.relative || 0;

      if (!text.trim()) {
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // Look up bot by Recall bot UUID
      const recallBotId = body.data?.bot?.id;
      if (!recallBotId) {
        console.error("[TranscriptWebhook] Missing bot.id in payload");
        return new Response(JSON.stringify({ error: "Missing bot.id" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      // Find our meetingBot record by Recall bot UUID
      const bot = await ctx.runQuery(api.meetingBot.getBotByRecallId, { recallBotId });
      if (!bot || !bot.callId) {
        console.warn(`[TranscriptWebhook] Bot not found or no callId for recallBotId: ${recallBotId}`);
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // Determine speaker: match participant name to closer name
      const closerName = bot.closerName || "";
      const isCloser = closerName && participantName.toLowerCase().includes(closerName.toLowerCase().substring(0, Math.min(closerName.length, 5)));
      const speaker = isCloser ? "closer" : "prospect";

      // Save transcript segment
      await ctx.runMutation(api.calls.addTranscriptSegment, {
        callId: bot.callId as string,
        teamId: bot.teamId as string,
        speaker,
        text,
        timestamp: Math.floor(startTimestamp),
      });

      // Update call status to "on_call" on first transcript (triggers live calls dashboard + notifications)
      await ctx.runMutation(api.calls.updateCallStatus, {
        callId: bot.callId as string,
        status: "on_call",
        speakerCount: 1,
      });

      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (error) {
      console.error("[TranscriptWebhook] Error processing transcript:", error);
      return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }),
});

http.route({
  path: "/recall-transcript-webhook",
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
          // Log departure reason for debugging bot-leaves-early issues
          const subCode = eventData?.data?.sub_code || eventData?.sub_code || "unknown";
          console.log(`[recall-webhook] bot.call_ended for ${recallBotId}, sub_code: ${subCode}`);

          // Immediately mark bot completed so apps detect the call ended
          // (bot.done fires later after recording processing — could take minutes for long calls)
          const callEndedAt = Date.now();
          await ctx.runMutation(api.meetingBot.updateBotStatus, {
            recallBotId,
            status: "completed",
            endedAt: callEndedAt,
            questionnaireCompleted: false,
          });

          // Complete linked call if it exists
          const callEndedBot = await ctx.runQuery(api.meetingBot.getBotByRecallId, {
            recallBotId,
          });

          if (callEndedBot?.callId) {
            await ctx.runMutation(internal.meetingBot.completeCallFromBot, {
              callId: callEndedBot.callId,
              endedAt: callEndedAt,
            });
            console.log(`[recall-webhook] Call completed on call_ended: ${callEndedBot.callId}`);
          } else {
            console.log(`[recall-webhook] Call ended but no linked call for bot: ${recallBotId}`);
          }
          break;
        }

        case "bot.done": {
          // Recording is now available — fetch it
          // bot.call_ended already marked the bot completed and triggered the post-call form.
          // This handler is a fallback in case bot.call_ended didn't fire, AND ensures the
          // linked call gets completed even if it wasn't linked at bot.call_ended time.
          const doneAt = Date.now();
          const doneBot = await ctx.runQuery(api.meetingBot.getBotByRecallId, {
            recallBotId,
          });

          if (doneBot?.status !== "completed") {
            // bot.call_ended didn't fire — complete bot now as fallback
            console.log(`[recall-webhook] bot.call_ended missed, completing on bot.done: ${recallBotId}`);
            await ctx.runMutation(api.meetingBot.updateBotStatus, {
              recallBotId,
              status: "completed",
              endedAt: doneAt,
              questionnaireCompleted: false,
            });
          }

          // Always try to complete the linked call — it may have been linked AFTER
          // bot.call_ended fired. completeCallFromBot is idempotent (safe to call twice).
          if (doneBot?.callId) {
            await ctx.runMutation(internal.meetingBot.completeCallFromBot, {
              callId: doneBot.callId,
              endedAt: doneBot.endedAt || doneAt,
            });
          }

          // Always schedule recording URL fetch (this is the main purpose of bot.done)
          await ctx.runMutation(internal.meetingBot.scheduleRecordingFetch, {
            recallBotId,
            delayMs: 3000,
          });
          console.log(`[recall-webhook] Scheduled recording fetch for bot: ${recallBotId}`);
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

// Manual end call — user clicks "End Call" in desktop app
http.route({
  path: "/endCallManually",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId } = body;
      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId required" }), {
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        });
      }
      const result = await ctx.runMutation(api.meetingBot.endCallManually, {
        closerId: closerId as any,
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message || "Failed to end call" }), {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      });
    }
  }),
});

http.route({
  path: "/endCallManually",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
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

// Dismiss orphaned questionnaires (bots without linked call records)
http.route({
  path: "/dismissOrphanedQuestionnaires",
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

      const result = await ctx.runMutation(api.meetingBot.dismissOrphanedQuestionnaires, {
        closerId: closerId as Id<"closers">,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in dismissOrphanedQuestionnaires:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/dismissOrphanedQuestionnaires",
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

// Get call analysis for a single call (used by Electron app to poll for pending analysis)
http.route({
  path: "/getCallAnalysis",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const callId = url.searchParams.get("callId");

      if (!callId) {
        return new Response(JSON.stringify({ error: "callId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const call = await ctx.runQuery(api.calls.getCallAnalysis, {
        callId: callId as Id<"calls">,
      });

      return new Response(JSON.stringify({ callAnalysis: call }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in getCallAnalysis:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getCallAnalysis",
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
    case "today": return "today";
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

// Create a shared link (used by desktop app, personal app, and web dashboard)
http.route({
  path: "/createSharedLink",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId, teamId, shareType, startSeconds, endSeconds, includeComments, createdBy, createdByType, accessType, password } = body;

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
        accessType: accessType ?? undefined,
        password: password ?? undefined,
      });

      // If compliance link, run AI redaction synchronously
      if (accessType === "compliance" && result.linkId) {
        try {
          const segments = await ctx.runQuery(internal.sharedLinks.getTranscriptForRedaction, {
            callId: callId as Id<"calls">,
          });
          if (segments.length > 0) {
            const redacted = await ctx.runAction(internal.ai.redactTranscript, { segments });
            await ctx.runMutation(internal.sharedLinks.storeRedactedTranscript, {
              linkId: result.linkId,
              redactedTranscript: redacted,
            });
          }
        } catch (redactErr) {
          console.error("[HTTP] Redaction failed (link still created):", redactErr);
          // Link is still usable — will fall back to full transcript
        }
      }

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
      const { token, password } = body;

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

      // Password protection check
      if (data.hasPassword) {
        if (!password) {
          return new Response(JSON.stringify({ passwordRequired: true }), {
            status: 401,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
        // Hash the provided password and verify against stored hash
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(password));
        const passwordHash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const verified = await ctx.runQuery(internal.sharedLinks.verifySharedLinkPassword, {
          token,
          passwordHash,
        });
        if (!verified.valid) {
          return new Response(JSON.stringify({ passwordRequired: true, passwordIncorrect: true }), {
            status: 401,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
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

      // Strip internal fields from public response
      const { callId: _callId, revoked: _revoked, hasPassword: _hasPassword, ...publicData } = data;
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

// Get all shared links for a call (used by share modal to list existing links)
http.route({
  path: "/getSharedLinksForCall",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const callId = url.searchParams.get("callId");

      if (!callId) {
        return new Response(JSON.stringify({ error: "callId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const links = await ctx.runQuery(api.sharedLinks.getSharedLinksForCall, {
        callId: callId as Id<"calls">,
      });

      return new Response(JSON.stringify(links), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error: any) {
      console.error("[HTTP] Error in getSharedLinksForCall:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/getSharedLinksForCall",
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

// Revoke a shared link
http.route({
  path: "/revokeSharedLink",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { linkId } = body;

      if (!linkId) {
        return new Response(JSON.stringify({ error: "linkId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      await ctx.runMutation(api.sharedLinks.toggleSharedLink, {
        linkId: linkId as Id<"sharedLinks">,
        isActive: false,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error: any) {
      console.error("[HTTP] Error in revokeSharedLink:", error);
      return new Response(JSON.stringify({ error: error?.message || "Failed to revoke link" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/revokeSharedLink",
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

// ==================== B2C Endpoints ====================

// Helper for consistent B2C CORS + JSON responses
const b2cJsonResponse = (data: unknown, status = 200, noCache = false) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
  if (noCache) {
    headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
    headers["Pragma"] = "no-cache";
    headers["Expires"] = "0";
  }
  return new Response(JSON.stringify(data), { status, headers });
};

const b2cCorsPreflightHandler = (methods: string) =>
  httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": methods,
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  });

// POST endpoint for B2C user signup
http.route({
  path: "/b2c/signup",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { email, phone, password, name } = body;

      // Type validation
      if (typeof email !== "string" || typeof phone !== "string" ||
          typeof password !== "string" || typeof name !== "string") {
        return b2cJsonResponse({ success: false, error: "All fields must be strings" }, 400);
      }

      if (!email || !phone || !password || !name) {
        return b2cJsonResponse({ success: false, error: "All fields are required" }, 400);
      }

      // Length guards
      if (email.length > 254 || name.length > 100 || phone.length > 20 || password.length > 128) {
        return b2cJsonResponse({ success: false, error: "Field length exceeds maximum" }, 400);
      }

      if (password.length < 8) {
        return b2cJsonResponse({ success: false, error: "Password must be at least 8 characters" }, 400);
      }

      const result = await ctx.runMutation(api.b2cAuth.signupB2CUser, {
        email,
        phone,
        password,
        name,
      });

      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      console.error("Error in B2C signup:", error);
      return b2cJsonResponse({ success: false, error: "Signup failed" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/signup",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST endpoint for B2C user login
http.route({
  path: "/b2c/login",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { email, password } = body;

      if (typeof email !== "string" || typeof password !== "string") {
        return b2cJsonResponse({ success: false, error: "Email and password must be strings" }, 400);
      }

      if (!email || !password) {
        return b2cJsonResponse({ success: false, error: "Email and password are required" }, 400);
      }

      const result = await ctx.runMutation(api.b2cAuth.loginB2CUser, {
        email,
        password,
      });

      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      console.error("Error in B2C login:", error);
      return b2cJsonResponse({ success: false, error: "Login failed" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/login",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST endpoint for B2C forgot password (request reset code)
http.route({
  path: "/b2c/forgot-password",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { email } = body;

      if (typeof email !== "string" || !email.trim()) {
        return b2cJsonResponse({ success: false, error: "Email is required" }, 400);
      }

      if (email.length > 254) {
        return b2cJsonResponse({ success: false, error: "Invalid email" }, 400);
      }

      const result = await ctx.runAction(api.b2cAuth.requestPasswordReset, {
        email,
      });

      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      console.error("Error in forgot password:", error);
      return b2cJsonResponse({ success: false, error: "Failed to process request" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/forgot-password",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST endpoint for B2C reset password (verify code + set new password)
http.route({
  path: "/b2c/reset-password",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { email, code, newPassword } = body;

      if (typeof email !== "string" || typeof code !== "string" || typeof newPassword !== "string") {
        return b2cJsonResponse({ success: false, error: "All fields must be strings" }, 400);
      }

      if (!email.trim() || !code.trim() || !newPassword) {
        return b2cJsonResponse({ success: false, error: "All fields are required" }, 400);
      }

      const result = await ctx.runMutation(api.b2cAuth.resetPassword, {
        email,
        code,
        newPassword,
      });

      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      console.error("Error in reset password:", error);
      return b2cJsonResponse({ success: false, error: "Failed to reset password" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/reset-password",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST endpoint for B2C email verification — send code
http.route({
  path: "/b2c/send-verification",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { email } = body;

      if (typeof email !== "string" || !email.trim()) {
        return b2cJsonResponse({ success: false, error: "Email is required" }, 400);
      }

      const result = await ctx.runAction(api.b2cEmailVerification.sendEmailVerificationCode, {
        email,
      });

      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      console.error("Error in send-verification:", error);
      return b2cJsonResponse({ success: false, error: "Failed to send verification code" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/send-verification",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST endpoint for B2C email verification — verify code
http.route({
  path: "/b2c/verify-email",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { email, code } = body;

      if (typeof email !== "string" || typeof code !== "string") {
        return b2cJsonResponse({ success: false, error: "Email and code must be strings" }, 400);
      }

      if (!email.trim() || !code.trim()) {
        return b2cJsonResponse({ success: false, error: "Email and code are required" }, 400);
      }

      const result = await ctx.runMutation(api.b2cEmailVerification.verifyEmailCode, {
        email,
        code,
      });

      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      console.error("Error in verify-email:", error);
      return b2cJsonResponse({ success: false, error: "Failed to verify email" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/verify-email",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// GET endpoint to look up B2C user by email (internal use only)
http.route({
  path: "/b2c/user",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const email = url.searchParams.get("email");

    if (!email) {
      return b2cJsonResponse({ error: "Email is required" }, 400);
    }

    const user = await ctx.runQuery(internal.b2cAuth.getB2CUserByEmail, { email });

    if (!user) {
      return b2cJsonResponse({ error: "User not found" }, 404);
    }

    return b2cJsonResponse(user);
  }),
});

http.route({
  path: "/b2c/user",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// ==================== B2C Profile Endpoints ====================

// GET /b2c/profile — Load own profile for editor
http.route({
  path: "/b2c/profile",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) {
        return b2cJsonResponse({ error: "userId is required" }, 400);
      }
      const profile = await ctx.runQuery(api.b2cProfiles.getMyProfile, {
        userId: userId as any,
      });
      return b2cJsonResponse(profile);
    } catch (error) {
      console.error("Error getting profile:", error);
      return b2cJsonResponse({ error: "Failed to load profile" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/profile",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, POST, OPTIONS"),
});

// POST /b2c/profile — Upsert profile fields
http.route({
  path: "/b2c/profile",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, ...fields } = body;
      if (!userId) {
        return b2cJsonResponse({ error: "userId is required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cProfiles.upsertProfile, {
        userId: userId as any,
        ...fields,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error upserting profile:", error);
      const msg = error?.message || "Failed to save profile";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

// POST /b2c/profile/upload-url — Get signed photo upload URL
http.route({
  path: "/b2c/profile/upload-url",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId) {
        return b2cJsonResponse({ error: "userId is required" }, 400);
      }
      const result = await ctx.runMutation(
        api.b2cProfiles.generateProfileUploadUrl,
        { userId: body.userId as any }
      );
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      console.error("Error generating upload URL:", error);
      return b2cJsonResponse({ error: "Failed to generate upload URL" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/profile/upload-url",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/profile/photo — Save photo storage reference
http.route({
  path: "/b2c/profile/photo",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.storageId) {
        return b2cJsonResponse({ error: "userId and storageId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cProfiles.saveProfilePhoto, {
        userId: body.userId as any,
        storageId: body.storageId,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      console.error("Error saving photo:", error);
      return b2cJsonResponse({ error: "Failed to save photo" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/profile/photo",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/profile/slug — Claim profile URL slug
http.route({
  path: "/b2c/profile/slug",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.slug) {
        return b2cJsonResponse({ error: "userId and slug are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cProfiles.claimProfileSlug, {
        userId: body.userId as any,
        slug: body.slug,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error claiming slug:", error);
      const msg = error?.message || "Failed to claim URL";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/profile/slug",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ==================== B2C Community Endpoints ====================

// GET /b2c/community/channels — List all channels
http.route({
  path: "/b2c/community/channels",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const channels = await ctx.runQuery(api.b2cCommunity.listChannels, {});
      return b2cJsonResponse(channels);
    } catch (error) {
      console.error("Error listing channels:", error);
      return b2cJsonResponse({ error: "Failed to load channels" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/community/channels",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/community/feed — Aggregated feed
http.route({
  path: "/b2c/community/feed",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const cursor = url.searchParams.get("cursor");
      const limit = url.searchParams.get("limit");
      const userId = url.searchParams.get("userId");
      const friendsOnly = url.searchParams.get("friendsOnly");
      const result = await ctx.runQuery(api.b2cCommunity.getFeed, {
        cursor: cursor ? Number(cursor) : undefined,
        limit: limit ? Number(limit) : undefined,
        userId: userId ? (userId as any) : undefined,
        friendsOnly: friendsOnly === "true" ? true : undefined,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error getting feed:", error);
      return b2cJsonResponse({ error: "Failed to load feed" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/community/feed",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/community/posts — Channel posts
http.route({
  path: "/b2c/community/posts",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const channelId = url.searchParams.get("channelId");
      if (!channelId) return b2cJsonResponse({ error: "channelId is required" }, 400);
      const cursor = url.searchParams.get("cursor");
      const limit = url.searchParams.get("limit");
      const userId = url.searchParams.get("userId");
      const result = await ctx.runQuery(api.b2cCommunity.listPosts, {
        channelId: channelId as any,
        cursor: cursor ? Number(cursor) : undefined,
        limit: limit ? Number(limit) : undefined,
        userId: userId ? (userId as any) : undefined,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error listing posts:", error);
      return b2cJsonResponse({ error: "Failed to load posts" }, 500);
    }
  }),
});

// POST /b2c/community/posts — Create post
http.route({
  path: "/b2c/community/posts",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.channelId || !body.body) {
        return b2cJsonResponse({ error: "userId, channelId, and body are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCommunity.createPost, {
        userId: body.userId as any,
        channelId: body.channelId as any,
        body: body.body,
        visibility: body.visibility || undefined,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error creating post:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to create post" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/community/posts",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, POST, OPTIONS"),
});

// POST /b2c/community/post/edit — Edit post
http.route({
  path: "/b2c/community/post/edit",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.postId || !body.body) {
        return b2cJsonResponse({ error: "userId, postId, and body are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCommunity.editPost, {
        userId: body.userId as any,
        postId: body.postId as any,
        body: body.body,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error editing post:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to edit post" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/community/post/edit",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/community/post/delete — Soft-delete post
http.route({
  path: "/b2c/community/post/delete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.postId) {
        return b2cJsonResponse({ error: "userId and postId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCommunity.deletePost, {
        userId: body.userId as any,
        postId: body.postId as any,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error deleting post:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to delete post" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/community/post/delete",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/community/post/like — Toggle post like
http.route({
  path: "/b2c/community/post/like",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.postId) {
        return b2cJsonResponse({ error: "userId and postId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCommunity.togglePostLike, {
        userId: body.userId as any,
        postId: body.postId as any,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error toggling post like:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to toggle like" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/community/post/like",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// GET /b2c/community/comments — Post comments
http.route({
  path: "/b2c/community/comments",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const postId = url.searchParams.get("postId");
      if (!postId) return b2cJsonResponse({ error: "postId is required" }, 400);
      const cursor = url.searchParams.get("cursor");
      const limit = url.searchParams.get("limit");
      const userId = url.searchParams.get("userId");
      const result = await ctx.runQuery(api.b2cCommunity.listComments, {
        postId: postId as any,
        cursor: cursor ? Number(cursor) : undefined,
        limit: limit ? Number(limit) : undefined,
        userId: userId ? (userId as any) : undefined,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error listing comments:", error);
      return b2cJsonResponse({ error: "Failed to load comments" }, 500);
    }
  }),
});

// POST /b2c/community/comments — Create comment
http.route({
  path: "/b2c/community/comments",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.postId || !body.body) {
        return b2cJsonResponse({ error: "userId, postId, and body are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCommunity.createComment, {
        userId: body.userId as any,
        postId: body.postId as any,
        body: body.body,
        parentCommentId: body.parentCommentId ? (body.parentCommentId as any) : undefined,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error creating comment:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to create comment" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/community/comments",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, POST, OPTIONS"),
});

// POST /b2c/community/comment/edit — Edit comment
http.route({
  path: "/b2c/community/comment/edit",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.commentId || !body.body) {
        return b2cJsonResponse({ error: "userId, commentId, and body are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCommunity.editComment, {
        userId: body.userId as any,
        commentId: body.commentId as any,
        body: body.body,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error editing comment:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to edit comment" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/community/comment/edit",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/community/comment/delete — Soft-delete comment
http.route({
  path: "/b2c/community/comment/delete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.commentId) {
        return b2cJsonResponse({ error: "userId and commentId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCommunity.deleteComment, {
        userId: body.userId as any,
        commentId: body.commentId as any,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error deleting comment:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to delete comment" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/community/comment/delete",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/community/comment/like — Toggle comment like
http.route({
  path: "/b2c/community/comment/like",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.commentId) {
        return b2cJsonResponse({ error: "userId and commentId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCommunity.toggleCommentLike, {
        userId: body.userId as any,
        commentId: body.commentId as any,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error toggling comment like:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to toggle like" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/community/comment/like",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// GET /b2c/community/members — Member directory
http.route({
  path: "/b2c/community/members",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const cursor = url.searchParams.get("cursor");
      const limit = url.searchParams.get("limit");
      const search = url.searchParams.get("search");
      const result = await ctx.runQuery(api.b2cCommunity.listMembers, {
        cursor: cursor ? Number(cursor) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search || undefined,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error listing members:", error);
      return b2cJsonResponse({ error: "Failed to load members" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/community/members",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/community/new-count — New post count since timestamp
http.route({
  path: "/b2c/community/new-count",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const since = url.searchParams.get("since");
      if (!since) return b2cJsonResponse({ error: "since is required" }, 400);
      const count = await ctx.runQuery(api.b2cCommunity.getNewPostCount, {
        since: Number(since),
      });
      return b2cJsonResponse({ count });
    } catch (error) {
      console.error("Error getting new post count:", error);
      return b2cJsonResponse({ error: "Failed to get count" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/community/new-count",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// ==================== B2C Community Reactions ====================

// POST /b2c/community/reaction/add — Add emoji reaction
http.route({
  path: "/b2c/community/reaction/add",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.targetType || !body.targetId || !body.emoji) {
        return b2cJsonResponse({ error: "userId, targetType, targetId, and emoji are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCommunityReactions.addReaction, {
        userId: body.userId as any,
        targetType: body.targetType,
        targetId: body.targetId,
        emoji: body.emoji,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error adding reaction:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to add reaction" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/community/reaction/add",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/community/reaction/remove — Remove emoji reaction
http.route({
  path: "/b2c/community/reaction/remove",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.targetType || !body.targetId || !body.emoji) {
        return b2cJsonResponse({ error: "userId, targetType, targetId, and emoji are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCommunityReactions.removeReaction, {
        userId: body.userId as any,
        targetType: body.targetType,
        targetId: body.targetId,
        emoji: body.emoji,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error removing reaction:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to remove reaction" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/community/reaction/remove",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ==================== B2C Channel Read State ====================

// POST /b2c/community/channel/mark-read — Mark channel as read
http.route({
  path: "/b2c/community/channel/mark-read",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.channelId) {
        return b2cJsonResponse({ error: "userId and channelId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCommunity.markChannelRead, {
        userId: body.userId as any,
        channelId: body.channelId as any,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error marking channel read:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to mark channel read" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/community/channel/mark-read",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// GET /b2c/community/channel/unread — Get unread channel IDs
http.route({
  path: "/b2c/community/channel/unread",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const result = await ctx.runQuery(api.b2cCommunity.getUnreadChannels, {
        userId: userId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error getting unread channels:", error);
      return b2cJsonResponse({ error: "Failed to get unread channels" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/community/channel/unread",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// ==================== B2C Pin / Unpin Posts ====================

// POST /b2c/community/post/pin — Pin a post (admin only)
http.route({
  path: "/b2c/community/post/pin",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.postId) {
        return b2cJsonResponse({ error: "userId and postId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCommunity.pinPost, {
        userId: body.userId as any,
        postId: body.postId as any,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error pinning post:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to pin post" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/community/post/pin",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/community/post/unpin — Unpin a post (admin only)
http.route({
  path: "/b2c/community/post/unpin",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.postId) {
        return b2cJsonResponse({ error: "userId and postId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCommunity.unpinPost, {
        userId: body.userId as any,
        postId: body.postId as any,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error unpinning post:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to unpin post" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/community/post/unpin",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ==================== B2C Community Search ====================

// GET /b2c/community/search — Search posts by text
http.route({
  path: "/b2c/community/search",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const q = url.searchParams.get("q");
      if (!q) return b2cJsonResponse({ error: "q (search query) is required" }, 400);
      const channelId = url.searchParams.get("channelId");
      const cursor = url.searchParams.get("cursor");
      const limit = url.searchParams.get("limit");
      const result = await ctx.runQuery(api.b2cCommunity.searchPosts, {
        query: q,
        channelId: channelId ? (channelId as any) : undefined,
        cursor: cursor ? Number(cursor) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error searching posts:", error);
      return b2cJsonResponse({ error: "Failed to search posts" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/community/search",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// ==================== B2C DM Typing Indicators ====================

// POST /b2c/dm/typing — Set typing indicator
http.route({
  path: "/b2c/dm/typing",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.threadId) {
        return b2cJsonResponse({ error: "userId and threadId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cDirectMessages.setTyping, {
        userId: body.userId as any,
        threadId: body.threadId as any,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error setting typing indicator:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to set typing" }, 400);
    }
  }),
});

// GET /b2c/dm/typing — Get typing users
http.route({
  path: "/b2c/dm/typing",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      const threadId = url.searchParams.get("threadId");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      if (!threadId) return b2cJsonResponse({ error: "threadId is required" }, 400);
      const result = await ctx.runQuery(api.b2cDirectMessages.getTypingUsers, {
        userId: userId as any,
        threadId: threadId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error getting typing users:", error);
      return b2cJsonResponse({ error: "Failed to get typing users" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/dm/typing",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, POST, OPTIONS"),
});

// GET /b2c/training/modules — List published training modules
http.route({
  path: "/b2c/training/modules",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const modules = await ctx.runQuery(api.b2cTraining.listPublishedModules, {});
      return b2cJsonResponse(modules);
    } catch (error) {
      console.error("Error listing training modules:", error);
      return b2cJsonResponse({ error: "Failed to load modules" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/training/modules",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/training/lessons — Lessons for a module
http.route({
  path: "/b2c/training/lessons",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const moduleId = url.searchParams.get("moduleId");
      if (!moduleId) return b2cJsonResponse({ error: "moduleId is required" }, 400);
      const lessons = await ctx.runQuery(api.b2cTraining.listModuleLessons, {
        moduleId: moduleId as any,
      });
      return b2cJsonResponse(lessons);
    } catch (error) {
      console.error("Error listing training lessons:", error);
      return b2cJsonResponse({ error: "Failed to load lessons" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/training/lessons",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/public-profile — Public profile + stats by slug (no auth)
http.route({
  path: "/b2c/public-profile",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const slug = url.searchParams.get("slug");
      if (!slug) {
        return b2cJsonResponse({ error: "slug is required" }, 400);
      }
      const profile = await ctx.runQuery(
        internal.b2cProfiles.getPublicProfile,
        { slug }
      );
      if (!profile) {
        return b2cJsonResponse({ error: "Profile not found" }, 404);
      }
      return b2cJsonResponse(profile);
    } catch (error) {
      console.error("Error getting public profile:", error);
      return b2cJsonResponse({ error: "Failed to load profile" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/public-profile",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// ==================== B2C Admin Endpoints ====================

// POST /b2c/admin/verify-profile — Admin-only: set manual verification after pay stub review
http.route({
  path: "/b2c/admin/verify-profile",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, isVerified, adminKey } = body;

      // Check admin secret
      const secret = process.env.ADMIN_SECRET;
      if (!secret || adminKey !== secret) {
        return b2cJsonResponse({ error: "Unauthorized" }, 401);
      }

      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);

      await ctx.runMutation(internal.b2cProfiles.adminSetVerification, {
        userId: userId as any,
        isVerified: isVerified ?? true,
      });

      return b2cJsonResponse({ success: true });
    } catch (error: any) {
      console.error("Error verifying profile:", error);
      const msg = error?.message || "Failed to verify profile";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/admin/verify-profile",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ==================== B2C Direct Message Endpoints ====================

// GET /b2c/dm/threads — List DM threads for a user
http.route({
  path: "/b2c/dm/threads",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const cursor = url.searchParams.get("cursor");
      const limit = url.searchParams.get("limit");
      const result = await ctx.runQuery(api.b2cDirectMessages.listThreads, {
        userId: userId as any,
        cursor: cursor ? Number(cursor) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error listing DM threads:", error);
      return b2cJsonResponse({ error: "Failed to load threads" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/dm/threads",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/dm/messages — Get messages in a thread
http.route({
  path: "/b2c/dm/messages",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      const threadId = url.searchParams.get("threadId");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      if (!threadId) return b2cJsonResponse({ error: "threadId is required" }, 400);
      const cursor = url.searchParams.get("cursor");
      const limit = url.searchParams.get("limit");
      const result = await ctx.runQuery(api.b2cDirectMessages.getMessages, {
        userId: userId as any,
        threadId: threadId as any,
        cursor: cursor ? Number(cursor) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error getting DM messages:", error);
      return b2cJsonResponse({ error: "Failed to load messages" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/dm/messages",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/dm/unread-count — Total unread DM count for sidebar badge
http.route({
  path: "/b2c/dm/unread-count",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const result = await ctx.runQuery(api.b2cDirectMessages.getUnreadCount, {
        userId: userId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error getting DM unread count:", error);
      return b2cJsonResponse({ error: "Failed to get unread count" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/dm/unread-count",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// POST /b2c/dm/send — Send a direct message
http.route({
  path: "/b2c/dm/send",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { senderId, recipientId, body: msgBody } = body;
      if (!senderId || !recipientId || !msgBody) {
        return b2cJsonResponse({ error: "senderId, recipientId, and body are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cDirectMessages.sendMessage, {
        senderId: senderId as any,
        recipientId: recipientId as any,
        body: msgBody,
      });
      return b2cJsonResponse(result);
    } catch (error: any) {
      console.error("Error sending DM:", error);
      return b2cJsonResponse({ error: error.message || "Failed to send message" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/dm/send",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/dm/mark-read — Mark a thread as read
http.route({
  path: "/b2c/dm/mark-read",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, threadId } = body;
      if (!userId || !threadId) {
        return b2cJsonResponse({ error: "userId and threadId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cDirectMessages.markThreadRead, {
        userId: userId as any,
        threadId: threadId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error marking DM thread read:", error);
      return b2cJsonResponse({ error: "Failed to mark thread read" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/dm/mark-read",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/dm/delete — Soft-delete a message
http.route({
  path: "/b2c/dm/delete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, messageId } = body;
      if (!userId || !messageId) {
        return b2cJsonResponse({ error: "userId and messageId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cDirectMessages.deleteMessage, {
        userId: userId as any,
        messageId: messageId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error deleting DM:", error);
      return b2cJsonResponse({ error: "Failed to delete message" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/dm/delete",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ==================== B2C Presence Endpoints ====================

// POST /b2c/heartbeat — Update user's lastSeenAt for online presence
http.route({
  path: "/b2c/heartbeat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId } = body;
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const result = await ctx.runMutation(api.b2cPresence.heartbeat, {
        userId: userId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error in heartbeat:", error);
      return b2cJsonResponse({ error: "Failed to update presence" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/heartbeat",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// GET /b2c/online-users — Get list of currently online user IDs
http.route({
  path: "/b2c/online-users",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const result = await ctx.runQuery(api.b2cPresence.getOnlineUserIds, {});
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error getting online users:", error);
      return b2cJsonResponse({ error: "Failed to get online users" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/online-users",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// ==================== B2C Friendship Endpoints ====================

// GET /b2c/friends — List accepted friends
http.route({
  path: "/b2c/friends",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const cursor = url.searchParams.get("cursor");
      const limit = url.searchParams.get("limit");
      const result = await ctx.runQuery(api.b2cFriendships.listFriends, {
        userId: userId as any,
        cursor: cursor ? Number(cursor) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error listing friends:", error);
      return b2cJsonResponse({ error: "Failed to load friends" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/friends",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/friends/requests — Incoming friend requests
http.route({
  path: "/b2c/friends/requests",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const result = await ctx.runQuery(api.b2cFriendships.listIncomingRequests, {
        userId: userId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error listing friend requests:", error);
      return b2cJsonResponse({ error: "Failed to load requests" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/friends/requests",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/friends/request-count — Pending request count for badge
http.route({
  path: "/b2c/friends/request-count",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const result = await ctx.runQuery(api.b2cFriendships.getPendingRequestCount, {
        userId: userId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error getting request count:", error);
      return b2cJsonResponse({ error: "Failed to get count" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/friends/request-count",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/friends/status — Friendship status between two users
http.route({
  path: "/b2c/friends/status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      const otherUserId = url.searchParams.get("otherUserId");
      if (!userId || !otherUserId) {
        return b2cJsonResponse({ error: "userId and otherUserId are required" }, 400);
      }
      const result = await ctx.runQuery(api.b2cFriendships.getFriendshipStatus, {
        userId: userId as any,
        otherUserId: otherUserId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error getting friendship status:", error);
      return b2cJsonResponse({ error: "Failed to get status" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/friends/status",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// POST /b2c/friends/request — Send a friend request
http.route({
  path: "/b2c/friends/request",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { requesterId, recipientId } = body;
      if (!requesterId || !recipientId) {
        return b2cJsonResponse({ error: "requesterId and recipientId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cFriendships.sendRequest, {
        requesterId: requesterId as any,
        recipientId: recipientId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error sending friend request:", error);
      return b2cJsonResponse({ error: "Failed to send request" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/friends/request",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/friends/accept — Accept a friend request
http.route({
  path: "/b2c/friends/accept",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, requesterId } = body;
      if (!userId || !requesterId) {
        return b2cJsonResponse({ error: "userId and requesterId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cFriendships.acceptRequest, {
        userId: userId as any,
        requesterId: requesterId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error accepting friend request:", error);
      return b2cJsonResponse({ error: "Failed to accept request" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/friends/accept",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/friends/decline — Decline a friend request
http.route({
  path: "/b2c/friends/decline",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, requesterId } = body;
      if (!userId || !requesterId) {
        return b2cJsonResponse({ error: "userId and requesterId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cFriendships.declineRequest, {
        userId: userId as any,
        requesterId: requesterId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error declining friend request:", error);
      return b2cJsonResponse({ error: "Failed to decline request" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/friends/decline",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/friends/remove — Remove a friend
http.route({
  path: "/b2c/friends/remove",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, friendId } = body;
      if (!userId || !friendId) {
        return b2cJsonResponse({ error: "userId and friendId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cFriendships.removeFriend, {
        userId: userId as any,
        friendId: friendId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error removing friend:", error);
      return b2cJsonResponse({ error: "Failed to remove friend" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/friends/remove",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ==================== B2C Resource Endpoints ====================

// POST /b2c/resources — Create a resource
http.route({
  path: "/b2c/resources",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId) {
        return b2cJsonResponse({ error: "userId is required" }, 400);
      }
      if (!body.type || !body.title) {
        return b2cJsonResponse({ error: "type and title are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cResources.addResource, {
        userId: body.userId as any,
        type: body.type,
        title: body.title,
        description: body.description,
        content: body.content,
        url: body.url,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error creating resource:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to create resource" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/resources",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, PATCH, DELETE, OPTIONS"),
});

// PATCH /b2c/resources — Update a resource
http.route({
  path: "/b2c/resources/update",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.resourceId) {
        return b2cJsonResponse({ error: "userId and resourceId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cResources.updateResource, {
        userId: body.userId as any,
        resourceId: body.resourceId as any,
        title: body.title,
        description: body.description,
        content: body.content,
        url: body.url,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error updating resource:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to update resource" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/resources/update",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/resources/delete — Delete a resource
http.route({
  path: "/b2c/resources/delete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.resourceId) {
        return b2cJsonResponse({ error: "userId and resourceId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cResources.deleteResource, {
        userId: body.userId as any,
        resourceId: body.resourceId as any,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error deleting resource:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to delete resource" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/resources/delete",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ==================== B2C Highlight Clip Endpoints ====================

// GET /b2c/highlight-clips — Get user's clips
http.route({
  path: "/b2c/highlight-clips",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const clips = await ctx.runQuery(
        internal.b2cHighlightClips.getClipsByUser,
        { userId: userId as Id<"b2cUsers"> }
      );
      return b2cJsonResponse(clips);
    } catch (error) {
      console.error("Error getting highlight clips:", error);
      return b2cJsonResponse({ error: "Failed to load clips" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/highlight-clips",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, POST, OPTIONS"),
});

// GET /b2c/highlight-clips/by-call — Get clips for a call
http.route({
  path: "/b2c/highlight-clips/by-call",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const callId = url.searchParams.get("callId");
      if (!callId) return b2cJsonResponse({ error: "callId is required" }, 400);
      const clips = await ctx.runQuery(
        internal.b2cHighlightClips.getClipsByCall,
        { callId: callId as Id<"calls"> }
      );
      return b2cJsonResponse(clips);
    } catch (error) {
      console.error("Error getting clips by call:", error);
      return b2cJsonResponse({ error: "Failed to load clips" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/highlight-clips/by-call",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// POST /b2c/highlight-clips — Add a clip
http.route({
  path: "/b2c/highlight-clips",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, callId, label, startTime, endTime, isFullCall, blurRegion } = body;
      if (!userId || !callId || !label || startTime === undefined || endTime === undefined || isFullCall === undefined || !blurRegion) {
        return b2cJsonResponse({ error: "Missing required fields" }, 400);
      }
      const result = await ctx.runMutation(api.b2cHighlightClips.addClip, {
        userId: userId as Id<"b2cUsers">,
        callId: callId as Id<"calls">,
        label: String(label),
        startTime: Number(startTime),
        endTime: Number(endTime),
        isFullCall: Boolean(isFullCall),
        blurRegion: String(blurRegion),
      });
      return b2cJsonResponse({ success: true, clipId: result.clipId });
    } catch (error: any) {
      console.error("Error adding highlight clip:", error);
      return b2cJsonResponse({ error: error.message || "Failed to add clip" }, 400);
    }
  }),
});

// POST /b2c/highlight-clips/update — Update a clip
http.route({
  path: "/b2c/highlight-clips/update",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { clipId, userId, ...updates } = body;
      if (!clipId || !userId) {
        return b2cJsonResponse({ error: "clipId and userId are required" }, 400);
      }
      const args: Record<string, unknown> = {
        clipId: clipId as Id<"b2cHighlightClips">,
        userId: userId as Id<"b2cUsers">,
      };
      if (updates.label !== undefined) args.label = String(updates.label);
      if (updates.startTime !== undefined) args.startTime = Number(updates.startTime);
      if (updates.endTime !== undefined) args.endTime = Number(updates.endTime);
      if (updates.isFullCall !== undefined) args.isFullCall = Boolean(updates.isFullCall);
      if (updates.blurRegion !== undefined) args.blurRegion = String(updates.blurRegion);

      const result = await ctx.runMutation(api.b2cHighlightClips.updateClip, args as any);
      return b2cJsonResponse(result);
    } catch (error: any) {
      console.error("Error updating highlight clip:", error);
      return b2cJsonResponse({ error: error.message || "Failed to update clip" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/highlight-clips/update",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/highlight-clips/delete — Delete a clip
http.route({
  path: "/b2c/highlight-clips/delete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { clipId, userId } = body;
      if (!clipId || !userId) {
        return b2cJsonResponse({ error: "clipId and userId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cHighlightClips.deleteClip, {
        clipId: clipId as Id<"b2cHighlightClips">,
        userId: userId as Id<"b2cUsers">,
      });
      return b2cJsonResponse(result);
    } catch (error: any) {
      console.error("Error deleting highlight clip:", error);
      return b2cJsonResponse({ error: error.message || "Failed to delete clip" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/highlight-clips/delete",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/highlight-clips/reorder — Reorder clips
http.route({
  path: "/b2c/highlight-clips/reorder",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, clipIds } = body;
      if (!userId || !Array.isArray(clipIds)) {
        return b2cJsonResponse({ error: "userId and clipIds array are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cHighlightClips.reorderClips, {
        userId: userId as Id<"b2cUsers">,
        clipIds: clipIds as Id<"b2cHighlightClips">[],
      });
      return b2cJsonResponse(result);
    } catch (error: any) {
      console.error("Error reordering highlight clips:", error);
      return b2cJsonResponse({ error: error.message || "Failed to reorder clips" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/highlight-clips/reorder",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// GET /b2c/highlight-clips/public — Public clips by slug with fresh recording URLs
http.route({
  path: "/b2c/highlight-clips/public",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const slug = url.searchParams.get("slug");
      if (!slug) return b2cJsonResponse({ error: "slug is required" }, 400);

      // Look up user by slug
      const user = await ctx.runQuery(
        internal.b2cHighlightClips.getUserBySlug,
        { slug }
      );
      if (!user) return b2cJsonResponse({ error: "Profile not found" }, 404);

      // Verify profile is public
      const profile = await ctx.runQuery(
        internal.b2cProfiles.getPublicProfile,
        { slug }
      );
      if (!profile) return b2cJsonResponse({ error: "Profile not found" }, 404);

      // Get clips
      const clips = await ctx.runQuery(
        internal.b2cHighlightClips.getPublicClips,
        { userId: user._id }
      );

      if (clips.length === 0) return b2cJsonResponse([]);

      // Refresh recording URLs for each unique callId
      const uniqueCallIds = [...new Set(clips.map((c: { callId: string }) => c.callId))];
      const urlMap: Record<string, string> = {};

      for (const callId of uniqueCallIds) {
        try {
          const result = await ctx.runAction(api.meetingBot.refreshRecordingUrl, {
            callId: callId as Id<"calls">,
          });
          if (result.recordingUrl) {
            urlMap[callId] = result.recordingUrl;
          }
        } catch {
          // Skip — clip will have no URL
        }
      }

      // Enrich clips with fresh URLs
      const enriched = clips.map((clip: { callId: string; [key: string]: unknown }) => ({
        ...clip,
        recordingUrl: urlMap[clip.callId] || null,
      }));

      return b2cJsonResponse(enriched);
    } catch (error) {
      console.error("Error getting public highlight clips:", error);
      return b2cJsonResponse({ error: "Failed to load clips" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/highlight-clips/public",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// ==================== B2C Content Submission Endpoints ====================

// POST /b2c/content/submit-clip — Submit a highlight clip for content
http.route({
  path: "/b2c/content/submit-clip",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, clipId, category, note, paymentHandle, paymentMethod, consentGiven } = body;
      if (!userId || !clipId) return b2cJsonResponse({ error: "userId and clipId are required" }, 400);
      const result = await ctx.runMutation(api.b2cContentSubmissions.submitClip, {
        userId: userId as any, clipId: clipId as any, category, note, paymentHandle, paymentMethod, consentGiven: consentGiven === true,
      });
      return b2cJsonResponse({ success: true, ...result });
    } catch (error: any) {
      return b2cJsonResponse({ error: error.message || "Failed to submit clip" }, 400);
    }
  }),
});
http.route({ path: "/b2c/content/submit-clip", method: "OPTIONS", handler: b2cCorsPreflightHandler("POST, OPTIONS") });

// POST /b2c/content/submit-testimonial — Submit a testimonial video
http.route({
  path: "/b2c/content/submit-testimonial",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, label, videoUrl, category, note, paymentHandle, paymentMethod, consentGiven } = body;
      if (!userId || !label || !videoUrl) return b2cJsonResponse({ error: "userId, label, and videoUrl are required" }, 400);
      const result = await ctx.runMutation(api.b2cContentSubmissions.submitTestimonial, {
        userId: userId as any, label, videoUrl, category, note, paymentHandle, paymentMethod, consentGiven: consentGiven === true,
      });
      return b2cJsonResponse({ success: true, ...result });
    } catch (error: any) {
      return b2cJsonResponse({ error: error.message || "Failed to submit testimonial" }, 400);
    }
  }),
});
http.route({ path: "/b2c/content/submit-testimonial", method: "OPTIONS", handler: b2cCorsPreflightHandler("POST, OPTIONS") });

// GET /b2c/content/my-submissions — User's own submissions
http.route({
  path: "/b2c/content/my-submissions",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const submissions = await ctx.runQuery(internal.b2cContentSubmissions.getMySubmissions, { userId: userId as any });
      return b2cJsonResponse({ submissions });
    } catch (error) {
      return b2cJsonResponse({ error: "Failed to load submissions" }, 500);
    }
  }),
});
http.route({ path: "/b2c/content/my-submissions", method: "OPTIONS", handler: b2cCorsPreflightHandler("GET, OPTIONS") });

// GET /b2c/content/pending — Founder: pending review queue
http.route({
  path: "/b2c/content/pending",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const reviewerUserId = url.searchParams.get("reviewerUserId");
      if (!reviewerUserId) return b2cJsonResponse({ error: "reviewerUserId is required" }, 400);
      const submissions = await ctx.runQuery(internal.b2cContentSubmissions.getPendingSubmissions, { reviewerUserId: reviewerUserId as any });
      return b2cJsonResponse({ submissions });
    } catch (error) {
      return b2cJsonResponse({ error: "Failed to load pending submissions" }, 500);
    }
  }),
});
http.route({ path: "/b2c/content/pending", method: "OPTIONS", handler: b2cCorsPreflightHandler("GET, OPTIONS") });

// GET /b2c/content/all — Founder: all submissions with optional status filter
http.route({
  path: "/b2c/content/all",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const reviewerUserId = url.searchParams.get("reviewerUserId");
      const status = url.searchParams.get("status") || undefined;
      if (!reviewerUserId) return b2cJsonResponse({ error: "reviewerUserId is required" }, 400);
      const submissions = await ctx.runQuery(internal.b2cContentSubmissions.getAllSubmissions, { reviewerUserId: reviewerUserId as any, status });
      return b2cJsonResponse({ submissions });
    } catch (error) {
      return b2cJsonResponse({ error: "Failed to load submissions" }, 500);
    }
  }),
});
http.route({ path: "/b2c/content/all", method: "OPTIONS", handler: b2cCorsPreflightHandler("GET, OPTIONS") });

// POST /b2c/content/review — Founder: approve or reject a submission
http.route({
  path: "/b2c/content/review",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { submissionId, reviewerUserId, action, rejectionReason } = body;
      if (!submissionId || !reviewerUserId || !action) return b2cJsonResponse({ error: "submissionId, reviewerUserId, and action are required" }, 400);
      const result = await ctx.runMutation(api.b2cContentSubmissions.reviewSubmission, {
        submissionId: submissionId as any, reviewerUserId: reviewerUserId as any, action, rejectionReason,
      });
      return b2cJsonResponse(result);
    } catch (error: any) {
      return b2cJsonResponse({ error: error.message || "Failed to review submission" }, 400);
    }
  }),
});
http.route({ path: "/b2c/content/review", method: "OPTIONS", handler: b2cCorsPreflightHandler("POST, OPTIONS") });

// POST /b2c/content/mark-paid — Founder: mark an approved submission as paid
http.route({
  path: "/b2c/content/mark-paid",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { submissionId, reviewerUserId, paidAmount } = body;
      if (!submissionId || !reviewerUserId || !paidAmount) return b2cJsonResponse({ error: "submissionId, reviewerUserId, and paidAmount are required" }, 400);
      const result = await ctx.runMutation(api.b2cContentSubmissions.markPaid, {
        submissionId: submissionId as any, reviewerUserId: reviewerUserId as any, paidAmount: Number(paidAmount),
      });
      return b2cJsonResponse(result);
    } catch (error: any) {
      return b2cJsonResponse({ error: error.message || "Failed to mark as paid" }, 400);
    }
  }),
});
http.route({ path: "/b2c/content/mark-paid", method: "OPTIONS", handler: b2cCorsPreflightHandler("POST, OPTIONS") });

// ==================== B2C Highlight Share Endpoints ====================

// POST /b2c/highlight-shares — Create a share link for a clip
http.route({
  path: "/b2c/highlight-shares",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { clipId, userId, password } = body;
      if (!clipId || !userId) return b2cJsonResponse({ error: "clipId and userId are required" }, 400);
      const result = await ctx.runMutation(api.b2cHighlightShares.createShare, {
        clipId: clipId as any,
        userId: userId as any,
        password: password || undefined,
      });
      return b2cJsonResponse({ ...result, url: `https://sequ3nce.ai/h/${result.token}` });
    } catch (error: any) {
      console.error("Error creating highlight share:", error);
      return b2cJsonResponse({ error: error.message || "Failed to create share" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/highlight-shares",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, POST, OPTIONS"),
});

// GET /b2c/highlight-shares?clipId= — List active shares for a clip
http.route({
  path: "/b2c/highlight-shares",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const clipId = url.searchParams.get("clipId");
      if (!clipId) return b2cJsonResponse({ error: "clipId is required" }, 400);
      const shares = await ctx.runQuery(internal.b2cHighlightShares.getSharesByClip, {
        clipId: clipId as any,
      });
      return b2cJsonResponse({ shares });
    } catch (error) {
      console.error("Error listing highlight shares:", error);
      return b2cJsonResponse({ error: "Failed to list shares" }, 500);
    }
  }),
});

// POST /b2c/highlight-shares/revoke — Revoke a share link
http.route({
  path: "/b2c/highlight-shares/revoke",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { shareId, userId } = body;
      if (!shareId || !userId) return b2cJsonResponse({ error: "shareId and userId are required" }, 400);
      const result = await ctx.runMutation(api.b2cHighlightShares.revokeShare, {
        shareId: shareId as any,
        userId: userId as any,
      });
      return b2cJsonResponse(result);
    } catch (error: any) {
      console.error("Error revoking highlight share:", error);
      return b2cJsonResponse({ error: error.message || "Failed to revoke share" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/highlight-shares/revoke",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/highlight-shares/public — Public page data + password check
http.route({
  path: "/b2c/highlight-shares/public",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { token, password } = body;
      if (!token) return b2cJsonResponse({ error: "token is required" }, 400);

      const shareData = await ctx.runQuery(internal.b2cHighlightShares.getShareByToken, {
        token,
      });
      if (!shareData) return b2cJsonResponse({ error: "Share not found or revoked" }, 404);

      // Password check
      if (shareData.hasPassword) {
        if (!password) {
          return b2cJsonResponse({ needsPassword: true }, 401);
        }
        // Hash the provided password and verify
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const passwordHash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const verify = await ctx.runQuery(internal.b2cHighlightShares.verifySharePassword, {
          token,
          passwordHash,
        });
        if (!verify.valid) {
          return b2cJsonResponse({ passwordIncorrect: true }, 401);
        }
      }

      // Refresh recording URL if needed
      let recordingUrl = shareData.recordingUrl;
      if (shareData.callId) {
        try {
          const refreshResult = await ctx.runAction(api.meetingBot.refreshRecordingUrl, {
            callId: shareData.callId,
          });
          if (refreshResult?.recordingUrl) {
            recordingUrl = refreshResult.recordingUrl;
          }
        } catch {
          // Use existing URL if refresh fails
        }
      }

      return b2cJsonResponse({
        label: shareData.label,
        startTime: shareData.startTime,
        endTime: shareData.endTime,
        isFullCall: shareData.isFullCall,
        blurRegion: shareData.blurRegion,
        recordingUrl,
        closerName: shareData.closerName,
        profileSlug: shareData.profileSlug,
      });
    } catch (error) {
      console.error("Error fetching public highlight share:", error);
      return b2cJsonResponse({ error: "Failed to load shared highlight" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/highlight-shares/public",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/resources/reorder — Reorder resources
http.route({
  path: "/b2c/resources/reorder",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.resourceIds) {
        return b2cJsonResponse({ error: "userId and resourceIds are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cResources.reorderResources, {
        userId: body.userId as any,
        resourceIds: body.resourceIds,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error reordering resources:", error);
      return b2cJsonResponse({ error: error?.message || "Failed to reorder resources" }, 400);
    }
  }),
});

http.route({
  path: "/b2c/resources/reorder",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ==================== B2C Job Board Routes ====================

// GET /b2c/jobs/open — List open job postings for B2C closers
http.route({
  path: "/b2c/jobs/open",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const industry = url.searchParams.get("industry") || undefined;
      const ticketRange = url.searchParams.get("ticketRange") || undefined;
      const limit = url.searchParams.get("limit");
      const result = await ctx.runQuery(api.b2cJobBoard.listOpenPostings, {
        industry,
        ticketRange,
        limit: limit ? Number(limit) : undefined,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error listing open postings:", error);
      return b2cJsonResponse({ error: "Failed to load job postings" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/jobs/open",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/jobs/posting — Get a single job posting by ID
http.route({
  path: "/b2c/jobs/posting",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const postingId = url.searchParams.get("postingId");
      if (!postingId) return b2cJsonResponse({ error: "postingId is required" }, 400);
      const result = await ctx.runQuery(api.b2cJobBoard.getJobPosting, {
        postingId: postingId as any,
      });
      if (!result) return b2cJsonResponse({ error: "Posting not found" }, 404);
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error getting posting:", error);
      return b2cJsonResponse({ error: "Failed to load posting" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/jobs/posting",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/jobs/interest-status — Check if closer is interested in a posting
http.route({
  path: "/b2c/jobs/interest-status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const postingId = url.searchParams.get("postingId");
      const userId = url.searchParams.get("userId");
      if (!postingId || !userId) {
        return b2cJsonResponse({ error: "postingId and userId are required" }, 400);
      }
      const result = await ctx.runQuery(api.b2cJobBoard.getInterestStatus, {
        postingId: postingId as any,
        b2cUserId: userId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error checking interest status:", error);
      return b2cJsonResponse({ error: "Failed to check interest" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/jobs/interest-status",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/jobs/my-interests — Jobs the closer has expressed interest in
http.route({
  path: "/b2c/jobs/my-interests",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const result = await ctx.runQuery(api.b2cJobBoard.getMyInterests, {
        b2cUserId: userId as any,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error getting interests:", error);
      return b2cJsonResponse({ error: "Failed to load interests" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/jobs/my-interests",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// POST /b2c/jobs/express-interest — Closer expresses interest in a posting
http.route({
  path: "/b2c/jobs/express-interest",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.postingId || !body.userId) {
        return b2cJsonResponse({ error: "postingId and userId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cJobBoard.expressInterest, {
        postingId: body.postingId as any,
        b2cUserId: body.userId as any,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error expressing interest:", error);
      const msg = (error?.message || "Failed to express interest").split("\n")[0].replace("Uncaught Error: ", "");
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/jobs/express-interest",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/jobs/withdraw-interest — Closer withdraws interest from a posting
http.route({
  path: "/b2c/jobs/withdraw-interest",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.postingId || !body.userId) {
        return b2cJsonResponse({ error: "postingId and userId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cJobBoard.withdrawInterest, {
        postingId: body.postingId as any,
        b2cUserId: body.userId as any,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error withdrawing interest:", error);
      const msg = (error?.message || "Failed to withdraw interest").split("\n")[0].replace("Uncaught Error: ", "");
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/jobs/withdraw-interest",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/profile/toggle-availability — Toggle "Available for Hire"
http.route({
  path: "/b2c/profile/toggle-availability",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || typeof body.isAvailable !== "boolean") {
        return b2cJsonResponse({ error: "userId and isAvailable (boolean) are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cProfiles.toggleAvailability, {
        userId: body.userId as any,
        isAvailable: body.isAvailable,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error: any) {
      console.error("Error toggling availability:", error);
      const msg = (error?.message || "Failed to toggle availability").split("\n")[0].replace("Uncaught Error: ", "");
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/profile/toggle-availability",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// GET /b2c/subscription-status — Check subscription status (polled by Electron app after checkout)
http.route({
  path: "/b2c/subscription-status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return b2cJsonResponse({ error: "userId is required" }, 400);
    }

    try {
      const result = await ctx.runQuery(api.b2cBilling.getB2CSubscription, {
        userId: userId as Id<"b2cUsers">,
      });

      if (!result) {
        return b2cJsonResponse({ error: "User not found" }, 404);
      }

      return b2cJsonResponse({
        subscriptionStatus: result.subscriptionStatus,
        stripeCustomerId: result.stripeCustomerId,
      });
    } catch (error) {
      console.error("Error checking B2C subscription status:", error);
      return b2cJsonResponse({ error: "Internal server error" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/subscription-status",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

export default http;
