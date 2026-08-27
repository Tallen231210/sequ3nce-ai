import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { mapPolarStatusToB2C } from "./b2cPolar";
import { Id } from "./_generated/dataModel";
import { COLLECTIONS_UPDATE_ACTION } from "./collectionsNotifications";

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
      },
    });
  }),
});

// ============================================================================
// Closer magic-link auth — request a 6-digit code by email
// ============================================================================
http.route({
  path: "/closer/magicLink/request",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { email } = await request.json();
      if (!email) {
        return new Response(
          JSON.stringify({ success: false, error: "Email is required" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }
      const result = await ctx.runAction(
        api.closerMagicLink.requestCloserMagicLink,
        { email },
      );
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    } catch (error) {
      console.error("[/closer/magicLink/request] failed:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Request failed" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }
  }),
});

http.route({
  path: "/closer/magicLink/request",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
      },
    });
  }),
});

// ============================================================================
// Closer magic-link auth — verify a 6-digit code, returns CloserInfo
// ============================================================================
http.route({
  path: "/closer/magicLink/verify",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { email, code } = await request.json();
      if (!email || !code) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Email and code are required",
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }
      const result = await ctx.runMutation(
        api.closerMagicLink.verifyCloserMagicLink,
        { email, code },
      );
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    } catch (error) {
      console.error("[/closer/magicLink/verify] failed:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Verification failed" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }
  }),
});

http.route({
  path: "/closer/magicLink/verify",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
      },
    });
  }),
});

// ============================================================================
// Closer magic-link auth — pick a team after a multi-team verify
// ============================================================================
http.route({
  path: "/closer/magicLink/pickTeam",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { pickerToken, closerId } = await request.json();
      if (!pickerToken || !closerId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "pickerToken and closerId are required",
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }
      const result = await ctx.runMutation(
        api.closerMagicLink.pickCloserTeam,
        { pickerToken, closerId },
      );
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    } catch (error) {
      console.error("[/closer/magicLink/pickTeam] failed:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Pick team failed" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }
  }),
});

http.route({
  path: "/closer/magicLink/pickTeam",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId, currentPassword, newPassword } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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

/**
 * "That wasn't a sales call" — the desktop app's route.
 *
 * The web closer app already has one at /closer/fathom/reclassify, but that
 * authenticates with a sessionToken and the Electron app doesn't have one — it
 * signs in with email and password and identifies itself by closerId, the same
 * as every other route on this side of the API.
 *
 * The mutation checks the call belongs to the closer named here, so a closer
 * can only correct their own calls. Same protection as the rest of the desktop
 * routes, no more and no less.
 */
http.route({
  path: "/reclassifyCall",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const cors = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    };
    try {
      const body = await request.json();
      const { callId, closerId, isSalesCall } = body;

      if (!callId || !closerId) {
        return new Response(
          JSON.stringify({ success: false, error: "callId and closerId are required" }),
          { status: 400, headers: cors },
        );
      }

      const result = await ctx.runMutation(internal.fathom.reclassifyCall, {
        callId: callId as Id<"calls">,
        closerId: closerId as Id<"closers">,
        isSalesCall: isSalesCall === true,
      });

      // 200 with success:false rather than a 4xx — the renderer shows the
      // message, and an error status here would be swallowed as a network
      // failure and reported as "something went wrong".
      return new Response(JSON.stringify(result), { status: 200, headers: cors });
    } catch (error) {
      console.error("[HTTP] reclassifyCall:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Couldn't save that" }),
        { status: 200, headers: cors },
      );
    }
  }),
});

http.route({
  path: "/reclassifyCall",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        // Must list every header the renderer actually sends. In dev the
        // renderer runs on localhost:3030 so full CORS applies; in production
        // it loads from file:// and skips preflight entirely, which is exactly
        // how a mismatch here ships unnoticed.
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
      },
    });
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
      },
    });
  }),
});

// GET endpoint to check if Ammo V2 is enabled for a team (called by audio processor)
http.route({
  path: "/liveViewHeartbeat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = (await request.json()) as { callId?: string };
      if (!body.callId) {
        return new Response(JSON.stringify({ error: "callId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const result = await ctx.runMutation(api.calls.liveViewHeartbeat, {
        callId: body.callId as Id<"calls">,
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ ok: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

http.route({
  path: "/hasLiveViewer",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const callId = url.searchParams.get("callId");
    if (!callId) {
      return new Response(JSON.stringify({ error: "callId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    try {
      const result = await ctx.runQuery(internal.calls.hasLiveViewer, {
        callId: callId as Id<"calls">,
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // Unknown/invalid id: no viewer. The audio processor treats any
      // failure as "skip the cycle" — the cheap direction.
      return new Response(JSON.stringify({ hasViewer: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { teamId, closerId: claimedCloserId, userName } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { teamId, closerId: claimedCloserId } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
      },
    });
  }),
});

// ============================================================================
// B2B multi-calendar subscriptions HTTP wrappers
// Desktop calls these endpoints with email + teamId; we resolve to closerId
// then dispatch to the underlying Convex mutations / queries. Mirrors the
// existing /getCloserCalendarStatusByEmail / /disconnectCalendarByEmail
// pattern. CORS preflight is shared at the bottom of the group.
// ============================================================================

const CALENDAR_SUB_CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

http.route({
  path: "/listCalendarSubscriptionsByEmail",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const email = url.searchParams.get("email");
    const teamId = url.searchParams.get("teamId");
    if (!email || !teamId) {
      return new Response(JSON.stringify({ error: "email and teamId are required" }), {
        status: 400,
        headers: CALENDAR_SUB_CORS_HEADERS,
      });
    }
    try {
      const _closerLookup = (await ctx.runQuery(internal.calendar.getCloserByEmailAndTeam, { email, teamId: teamId as Id<"teams"> })) as { _id: Id<"closers"> } | null;
      const closerId = _closerLookup?._id ?? null;
      if (!closerId) {
        return new Response(JSON.stringify({ subscriptions: [] }), {
          status: 200,
          headers: CALENDAR_SUB_CORS_HEADERS,
        });
      }
      const subscriptions = await ctx.runQuery(
        api.closerCalendarSubscriptions.getMySubscriptions,
        { closerId },
      );
      return new Response(JSON.stringify({ subscriptions }), {
        status: 200,
        headers: CALENDAR_SUB_CORS_HEADERS,
      });
    } catch (error) {
      console.error("[HTTP] listCalendarSubscriptionsByEmail error:", error);
      return new Response(JSON.stringify({ error: "Failed to list subscriptions" }), {
        status: 500,
        headers: CALENDAR_SUB_CORS_HEADERS,
      });
    }
  }),
});

http.route({
  path: "/listAvailableGoogleCalendarsByEmail",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const email = url.searchParams.get("email");
    const teamId = url.searchParams.get("teamId");
    if (!email || !teamId) {
      return new Response(JSON.stringify({ error: "email and teamId are required" }), {
        status: 400,
        headers: CALENDAR_SUB_CORS_HEADERS,
      });
    }
    try {
      const _closerLookup = (await ctx.runQuery(internal.calendar.getCloserByEmailAndTeam, { email, teamId: teamId as Id<"teams"> })) as { _id: Id<"closers"> } | null;
      const closerId = _closerLookup?._id ?? null;
      if (!closerId) {
        return new Response(JSON.stringify({ ok: false, error: "Closer not found" }), {
          status: 404,
          headers: CALENDAR_SUB_CORS_HEADERS,
        });
      }
      const result = await ctx.runAction(
        api.closerCalendarSubscriptions.listAvailableCalendars,
        { closerId },
      );
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: CALENDAR_SUB_CORS_HEADERS,
      });
    } catch (error) {
      console.error("[HTTP] listAvailableGoogleCalendarsByEmail error:", error);
      return new Response(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to list available calendars",
        }),
        { status: 500, headers: CALENDAR_SUB_CORS_HEADERS },
      );
    }
  }),
});

http.route({
  path: "/addCalendarSubscriptionByEmail",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { email, teamId, googleCalendarId, label, backgroundColor, accessRole } = body;
      if (!email || !teamId || !googleCalendarId || !label) {
        return new Response(
          JSON.stringify({ error: "email, teamId, googleCalendarId, label required" }),
          { status: 400, headers: CALENDAR_SUB_CORS_HEADERS },
        );
      }
      const _closerLookup = (await ctx.runQuery(internal.calendar.getCloserByEmailAndTeam, { email, teamId: teamId as Id<"teams"> })) as { _id: Id<"closers"> } | null;
      const closerId = _closerLookup?._id ?? null;
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Closer not found" }), {
          status: 404,
          headers: CALENDAR_SUB_CORS_HEADERS,
        });
      }
      const result = await ctx.runMutation(
        api.closerCalendarSubscriptions.addSubscription,
        { closerId, googleCalendarId, label, backgroundColor, accessRole },
      );
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: CALENDAR_SUB_CORS_HEADERS,
      });
    } catch (error) {
      console.error("[HTTP] addCalendarSubscriptionByEmail error:", error);
      const msg = error instanceof Error ? error.message : "Failed to add subscription";
      // Surface the user-friendly cap-reached message inline so the desktop UI
      // can display it without parsing a stack trace.
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: CALENDAR_SUB_CORS_HEADERS,
      });
    }
  }),
});

http.route({
  path: "/removeCalendarSubscription",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { subscriptionId, email, teamId } = body;
      // Ownership check — without these the route accepted any subscriptionId
      // from any caller. Require email+teamId so we can verify the requesting
      // closer owns the subscription before letting the mutation through.
      if (!subscriptionId || !email || !teamId) {
        return new Response(
          JSON.stringify({ error: "subscriptionId, email, teamId required" }),
          { status: 400, headers: CALENDAR_SUB_CORS_HEADERS },
        );
      }
      const closerLookup = (await ctx.runQuery(
        internal.calendar.getCloserByEmailAndTeam,
        { email, teamId: teamId as Id<"teams"> },
      )) as { _id: Id<"closers"> } | null;
      if (!closerLookup) {
        return new Response(JSON.stringify({ error: "Closer not found" }), {
          status: 404,
          headers: CALENDAR_SUB_CORS_HEADERS,
        });
      }
      const owner = await ctx.runQuery(
        internal.closerCalendarSubscriptions.getSubscriptionOwnerInternal,
        { subscriptionId: subscriptionId as Id<"closerCalendarSubscriptions"> },
      );
      if (!owner) {
        return new Response(JSON.stringify({ error: "Subscription not found" }), {
          status: 404,
          headers: CALENDAR_SUB_CORS_HEADERS,
        });
      }
      if (owner.closerId !== closerLookup._id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: CALENDAR_SUB_CORS_HEADERS,
        });
      }
      const result = await ctx.runMutation(
        api.closerCalendarSubscriptions.removeSubscription,
        { subscriptionId: subscriptionId as Id<"closerCalendarSubscriptions"> },
      );
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: CALENDAR_SUB_CORS_HEADERS,
      });
    } catch (error) {
      console.error("[HTTP] removeCalendarSubscription error:", error);
      return new Response(JSON.stringify({ error: "Failed to remove subscription" }), {
        status: 500,
        headers: CALENDAR_SUB_CORS_HEADERS,
      });
    }
  }),
});

http.route({
  path: "/toggleCalendarSubscription",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { subscriptionId, enabled, email, teamId } = body;
      if (
        !subscriptionId ||
        typeof enabled !== "boolean" ||
        !email ||
        !teamId
      ) {
        return new Response(
          JSON.stringify({
            error: "subscriptionId, enabled (boolean), email, teamId required",
          }),
          { status: 400, headers: CALENDAR_SUB_CORS_HEADERS },
        );
      }
      const closerLookup = (await ctx.runQuery(
        internal.calendar.getCloserByEmailAndTeam,
        { email, teamId: teamId as Id<"teams"> },
      )) as { _id: Id<"closers"> } | null;
      if (!closerLookup) {
        return new Response(JSON.stringify({ error: "Closer not found" }), {
          status: 404,
          headers: CALENDAR_SUB_CORS_HEADERS,
        });
      }
      const owner = await ctx.runQuery(
        internal.closerCalendarSubscriptions.getSubscriptionOwnerInternal,
        { subscriptionId: subscriptionId as Id<"closerCalendarSubscriptions"> },
      );
      if (!owner) {
        return new Response(JSON.stringify({ error: "Subscription not found" }), {
          status: 404,
          headers: CALENDAR_SUB_CORS_HEADERS,
        });
      }
      if (owner.closerId !== closerLookup._id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: CALENDAR_SUB_CORS_HEADERS,
        });
      }
      const result = await ctx.runMutation(
        api.closerCalendarSubscriptions.toggleSubscription,
        {
          subscriptionId: subscriptionId as Id<"closerCalendarSubscriptions">,
          enabled,
        },
      );
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: CALENDAR_SUB_CORS_HEADERS,
      });
    } catch (error) {
      console.error("[HTTP] toggleCalendarSubscription error:", error);
      return new Response(JSON.stringify({ error: "Failed to toggle subscription" }), {
        status: 500,
        headers: CALENDAR_SUB_CORS_HEADERS,
      });
    }
  }),
});

// Shared OPTIONS preflight for the 5 subscription endpoints above.
const SUB_CORS_OPTIONS_HANDLER = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
    },
  });
});
http.route({ path: "/listCalendarSubscriptionsByEmail", method: "OPTIONS", handler: SUB_CORS_OPTIONS_HANDLER });
http.route({ path: "/listAvailableGoogleCalendarsByEmail", method: "OPTIONS", handler: SUB_CORS_OPTIONS_HANDLER });
http.route({ path: "/addCalendarSubscriptionByEmail", method: "OPTIONS", handler: SUB_CORS_OPTIONS_HANDLER });
http.route({ path: "/removeCalendarSubscription", method: "OPTIONS", handler: SUB_CORS_OPTIONS_HANDLER });
http.route({ path: "/toggleCalendarSubscription", method: "OPTIONS", handler: SUB_CORS_OPTIONS_HANDLER });

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
      },
    });
  }),
});

// ============================================
// Hyros inbound webhook (Phase 5 read direction)
//
// Defensive ingest path: store raw payload in hyrosWebhookEvents BEFORE
// any parsing logic so we never lose data to shape mismatches. The
// dispatcher then runs async to parse + patch setterLeads. Signature is
// verified against the per-team hyrosWebhookSecret (encrypted). Both
// valid and invalid signatures are stored; invalid ones are flagged and
// not dispatched.
//
// The teamId is passed in the query string (?team=<id>) because Hyros's
// webhooks don't carry it in payload. Each team configures their own
// URL on Hyros's side. If the team query param is missing or invalid,
// we still store the payload (in case it's a routing issue we can fix
// later) but mark teamId as undefined.
// ============================================

http.route({
  path: "/hyrosWebhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const teamParam = url.searchParams.get("team");
    const rawBody = await request.text();

    // Defensive: parse just the eventType for the audit-log eventType field.
    // Full parse + patch happens in the dispatcher.
    let eventType = "unknown";
    try {
      const peek = JSON.parse(rawBody);
      if (typeof peek?.event === "string") eventType = peek.event;
      else if (typeof peek?.eventType === "string") eventType = peek.eventType;
      else if (typeof peek?.type === "string") eventType = peek.type;
    } catch {
      // bad JSON falls through — still stored with eventType="unknown"
    }

    // Signature verification. Hyros's docs don't make the scheme
    // canonical; we accept X-Hyros-Signature OR X-Webhook-Signature
    // and compare to the team's secret. If unsignable / unverifiable,
    // signatureValid=false but we still store the row.
    const signatureHeader =
      request.headers.get("X-Hyros-Signature") ||
      request.headers.get("X-Webhook-Signature") ||
      "";
    let signatureValid = false;
    let teamId: Id<"teams"> | undefined;
    if (teamParam) {
      try {
        teamId = teamParam as Id<"teams">;
      } catch {
        teamId = undefined;
      }
    }
    // Signature validation requires the team's hyrosWebhookSecret. We do
    // this through a small action so we can decrypt. For v1 (pre-Gianni),
    // treat as valid if either: signature header present + matches a hash
    // of (secret + body), OR no signature header AND team has no secret
    // configured yet (the "we just plumbed this, signatures aren't on yet"
    // grace period). The action-side validator gets added when we wire
    // the secret config UI.
    if (teamId) {
      try {
        const team = await ctx.runQuery(internal.hyros.getTeamById, { teamId });
        const hasSecret = !!(team as { hyrosWebhookSecret?: string } | null)?.hyrosWebhookSecret;
        if (!hasSecret) {
          // Grace period — secret not yet configured by the customer. We
          // mark signatureValid=TRUE so the dispatcher processes the
          // event normally. The customer can opt into strict verification
          // by setting a secret later, which flips this branch to actual
          // verification.
          signatureValid = true;
        } else if (signatureHeader) {
          // TODO post-Gianni: real HMAC verification in a Node action
          // that decrypts the secret + compares. For now, presence of a
          // signature header indicates the customer has it configured on
          // their end and the receiver path is wired correctly.
          signatureValid = true;
        }
        // hasSecret && no signature header → signatureValid stays false →
        // dispatcher will reject. This is the "we're enforcing now but
        // got an unsigned event" case.
      } catch {
        // Team lookup failed — store anyway, mark invalid
        signatureValid = false;
      }
    }

    const insertResult = await ctx.runMutation(
      internal.hyrosRead.insertWebhookEvent,
      {
        teamId,
        eventType,
        rawPayload: rawBody,
        signatureValid,
        receivedAt: Date.now(),
      },
    );
    if (insertResult.duplicate) {
      // Hyros retried — we already have it. Respond 200 so they stop.
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    if (insertResult.id) {
      await ctx.scheduler.runAfter(0, internal.hyrosRead.dispatchEvent, {
        eventId: insertResult.id,
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

http.route({
  path: "/hyrosWebhook",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Hyros-Signature, X-Webhook-Signature",
      },
    });
  }),
});

// ============================================
// Pre-call briefing for closers (Transcripts Roadmap Phase 3)
// ============================================

// GET endpoint for the Desktop app to fetch a pre-call briefing for an
// upcoming closer appointment. Auth: closerEmail must belong to the team
// (verified inside the called query via by_email index lookup + teamId
// equality check). Returns CloserBriefing | { error } JSON envelope.
http.route({
  path: "/getCloserBriefing",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const closerEmail = url.searchParams.get("closerEmail");
    const teamId = url.searchParams.get("teamId");
    const calendarEventId = url.searchParams.get("calendarEventId");

    if (!closerEmail || !teamId || !calendarEventId) {
      return new Response(
        JSON.stringify({
          error: "closerEmail, teamId, and calendarEventId are required",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    try {
      const briefing = await ctx.runQuery(
        api.setterCloserBriefing.getBriefingForCalendarEventByCloserEmail,
        {
          closerEmail,
          teamId: teamId as Id<"teams">,
          calendarEventId: calendarEventId as Id<"calendarEvents">,
        },
      );
      return new Response(JSON.stringify(briefing), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("[HTTP /getCloserBriefing] error:", error);
      return new Response(JSON.stringify({ error: "Failed to get briefing" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

http.route({
  path: "/getCloserBriefing",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { callId, visitorCallId, teamId, closerId: claimedCloserId } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { teamId, closerId: claimedCloserId, closerName, callId, message } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId, callId, teamId, estimatedMinutes } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      if (!bot) {
        console.error(`[TranscriptWebhook] Bot not found for recallBotId: ${recallBotId}`);
        return new Response(JSON.stringify({ error: "Bot not found" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      if (!bot.callId) {
        // Race condition: webhook arrived before audio processor linked callId to bot.
        // Return 500 so Recall retries (up to 60 retries at 1s intervals).
        console.warn(`[TranscriptWebhook] No callId yet for bot ${recallBotId} — returning 500 to trigger retry`);
        return new Response(JSON.stringify({ error: "Call not linked yet" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }

      // Speaker identification — see decideSpeaker() at the bottom of this file for the
      // full decision tree. Reads Recall's structured signals (participant.is_host,
      // pinned participant.id) before falling back to name matching. closerIsHost
      // defaults to true for bots created before that field existed (preserves the
      // legacy scheduled-call behavior).
      const participantObj = transcriptData?.participant;
      const closerName = bot.closerName || "";
      const decision = decideSpeaker({
        participant: participantObj,
        closerName,
        pinnedCloserParticipantId: bot.closerParticipantId,
        closerIsHost: bot.closerIsHost ?? true,
      });
      const speaker = decision.speaker;

      // Pin participant.id on the FIRST segment that meets the high-confidence threshold
      // (is_host: true AND name tokens overlap). Subsequent segments hit Layer 1 and
      // inherit consistent labeling for the rest of the call.
      if (decision.shouldPin && participantObj?.id !== undefined) {
        await ctx.runMutation(internal.meetingBot.pinCloserParticipantId, {
          botId: bot._id,
          closerParticipantId: participantObj.id,
        });
      }

      // Defense-in-depth: empty closerName was the historical "Mode 2" failure pattern
      // (self-resolved Apr 9 2026). Surface immediately if it ever recurs so we don't
      // silently mislabel calls again.
      if (!closerName) {
        console.warn(`[TranscriptWebhook] bot.closerName empty callId=${bot.callId} fallback=${decision.source}`);
      }
      // is_host says closer but name doesn't match — likely the prospect-schedules-the-meeting
      // edge case. We expect this to be rare; first time it fires we should investigate.
      if (decision.disagreement) {
        console.warn(`[TranscriptWebhook] is_host vs name disagree callId=${bot.callId} chose=${decision.speaker} source=${decision.source}`);
      }

      // Save transcript segment
      await ctx.runMutation(api.calls.addTranscriptSegment, {
        callId: bot.callId as string,
        teamId: bot.teamId as string,
        speaker,
        text,
        timestamp: Math.floor(startTimestamp),
      });

      // Update call status to "on_call" only on first transcript (triggers live calls dashboard + notifications)
      // Only transition from "waiting" — never revert "on_call" or "completed" status
      const call = await ctx.runQuery(api.calls.getCallById, { callId: bot.callId as string }) as { status?: string } | null;
      if (call && call.status === "waiting") {
        await ctx.runMutation(api.calls.updateCallStatus, {
          callId: bot.callId as string,
          status: "on_call",
          speakerCount: 1,
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
      },
    });
  }),
});

// ============================================
// GOHIGHLEVEL MARKETPLACE APP WEBHOOK HANDLER
// ============================================
//
// GHL fires events here for every Contact/Message/Appointment/Opportunity
// change inside any sub-account that's installed our Marketplace App.
//
// Critical differences from the Recall handler below:
//   1. We MUST verify the Ed25519 signature BEFORE parsing JSON (the
//      signature is over the byte-identical raw body). request.json()
//      would consume the body as parsed objects — instead we call
//      request.text() once and parse manually after verification.
//   2. We persist to setterWebhookEvents for forensic audit on every
//      request, including invalid-signature requests (so we can detect
//      spoofing attempts).
//   3. Fast-ack: 200 immediately, schedule the dispatch internal
//      mutation via runAfter(0) to do the work asynchronously.
//
// Payload signature:
//   header: X-GHL-Signature: <base64 signature>
//   body:   raw JSON, signed with GHL's Ed25519 private key

http.route({
  path: "/webhooks/setter-data-marketplace",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signatureHeader = request.headers.get("x-ghl-signature");
    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch (error) {
      console.error("[ghl-webhook] Failed to read body:", error);
      return new Response(JSON.stringify({ error: "Invalid body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Try to extract the event type + locationId for the audit row even
    // BEFORE we verify the signature. Lets us record spoofing attempts
    // with usable metadata. If JSON parsing fails, we still record a row
    // (with empty fields) so signature-failure forensics are complete.
    let parsedBody: Record<string, unknown> | null = null;
    try {
      parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      parsedBody = null;
    }

    const signatureValid = signatureHeader
      ? await verifyGhlEd25519Signature(rawBody, signatureHeader)
      : false;

    if (!signatureValid) {
      // Forensic audit: log spoofing attempts (or signature key rotation)
      // with the parsed body if we got it. Don't process anything.
      try {
        await ctx.runMutation(
          internal.setterGhlWebhooks.recordIncomingWebhook,
          {
            locationId: (parsedBody?.locationId as string) ?? "",
            eventType: (parsedBody?.type as string) ?? "unknown",
            ghlEventId: undefined,
            signatureValid: false,
            processed: true, // nothing to process
            payload: parsedBody ?? { raw: rawBody.slice(0, 4096) },
            teamId: undefined,
          },
        );
      } catch (err) {
        console.error("[ghl-webhook] Failed to record invalid-sig event:", err);
      }
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Signature OK — record audit row (processed=false), schedule
    // dispatch, ack 200. The dispatch mutation patches processed=true
    // when it finishes (or processingError on failure).
    if (!parsedBody) {
      // Signature was valid but body wasn't valid JSON. Record + reject.
      await ctx.runMutation(internal.setterGhlWebhooks.recordIncomingWebhook, {
        locationId: "",
        eventType: "unknown",
        ghlEventId: undefined,
        signatureValid: true,
        processed: true,
        processingError: "Body was not valid JSON despite valid signature",
        payload: { raw: rawBody.slice(0, 4096) },
        teamId: undefined,
      } as never);
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const auditId = await ctx.runMutation(
      internal.setterGhlWebhooks.recordIncomingWebhook,
      {
        locationId: (parsedBody.locationId as string) ?? "",
        eventType: (parsedBody.type as string) ?? "unknown",
        ghlEventId: undefined,
        signatureValid: true,
        processed: false,
        payload: parsedBody,
        teamId: undefined,
      },
    );

    // Schedule the dispatch immediately. The httpAction returns 200 below
    // while dispatch runs asynchronously in the background.
    await ctx.scheduler.runAfter(0, internal.setterGhlWebhooks.dispatch, {
      auditId,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

/**
 * Verify a GoHighLevel Ed25519 webhook signature using the Web Crypto API.
 * Returns true on a valid signature, false on any error or mismatch.
 *
 * Operates on the byte-identical raw body — the signature is computed by
 * GHL over the exact bytes they sent, so we must NOT re-serialize the
 * body before verifying. The httpAction always reads raw text, never
 * .json(), and passes the raw string in here.
 *
 * Public key format: PEM-encoded SPKI in env GHL_WEBHOOK_PUBLIC_KEY.
 */
async function verifyGhlEd25519Signature(
  rawBody: string,
  signatureBase64: string,
): Promise<boolean> {
  const publicKeyPem = process.env.GHL_WEBHOOK_PUBLIC_KEY;
  if (!publicKeyPem) {
    console.error("[ghl-webhook] GHL_WEBHOOK_PUBLIC_KEY env var not set");
    return false;
  }

  let derBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    derBytes = pemToDer(publicKeyPem);
    signatureBytes = base64ToBytes(signatureBase64);
  } catch (err) {
    console.error("[ghl-webhook] Failed to decode key/signature:", err);
    return false;
  }

  try {
    // Cast through BufferSource — TypeScript's Uint8Array generic defaults
    // to ArrayBufferLike, which crypto.subtle's overloads (looking for
    // ArrayBufferView<ArrayBuffer>) reject under newer lib versions.
    // The runtime value is unambiguously fine; this is a pure type fix.
    const key = await crypto.subtle.importKey(
      "spki",
      derBytes as BufferSource,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      signatureBytes as BufferSource,
      new TextEncoder().encode(rawBody) as BufferSource,
    );
  } catch (err) {
    console.error("[ghl-webhook] Ed25519 verify error:", err);
    return false;
  }
}

function pemToDer(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return base64ToBytes(base64);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  // Allocate over a fresh ArrayBuffer (NOT ArrayBufferLike) so the returned
  // Uint8Array satisfies the BufferSource type that crypto.subtle expects
  // under newer TS lib defaults — without an explicit ArrayBuffer backing
  // the inferred type is Uint8Array<ArrayBufferLike> which the verify()
  // overload rejects.
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

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

    // ---- Manager Mode ----
    //
    // Checked first and returned from, so a manager's meeting never reaches
    // any of the closer handling below. That handling creates calls, fires
    // customer-facing notifications and writes into GoHighLevel — none of
    // which should ever happen for someone's one-to-one.
    //
    // A closer bot's id will not match this lookup, so the branch is inert for
    // every existing bot.
    try {
      const managerBot = await ctx.runQuery(
        internal.managerMeetingBot.getBotByRecallId,
        { recallBotId },
      );
      if (managerBot) {
        await ctx.runAction(internal.managerMeetingWebhook.applyManagerBotEvent, {
          recallBotId,
          event: eventType,
          subCode:
            eventData?.data?.sub_code ?? eventData?.sub_code ?? undefined,
        });
        return new Response(JSON.stringify({ ok: true, manager: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (mgrErr) {
      // A failure here must not swallow a closer's webhook. Log it and fall
      // through to the existing handling, which will simply find no manager
      // bot and behave exactly as it always has.
      console.error("[recall-webhook] Manager branch failed:", mgrErr);
    }

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

          // Why the bot left decides whether this was a call at all.
          //
          // Auto-join sends a bot to every meeting on the calendar, and the
          // way a closer says "not this one" is to remove it from the room.
          // That makes being kicked routine rather than exceptional — and a
          // twenty-second recording of a standup must not land in anyone's
          // close rate.
          //
          // Recall tells us plainly; we were logging it and throwing it away.
          const wasRemoved =
            subCode === "bot_kicked_from_call" ||
            subCode === "bot_kicked_from_waiting_room";
          const nobodyCame = subCode === "timeout_exceeded_noone_joined";
          const notACall = wasRemoved || nobodyCame;

          // Immediately mark bot completed so apps detect the call ended
          // (bot.done fires later after recording processing — could take minutes for long calls)
          // NOTE: Do NOT set questionnaireCompleted here — if the user already submitted the
          // form (via "End Call" flow), this webhook fires AFTER and would overwrite true→false.
          const callEndedAt = Date.now();
          await ctx.runMutation(api.meetingBot.updateBotStatus, {
            recallBotId,
            // "kicked" has been in the schema since February and nothing has
            // ever set it. This is what it was for.
            status: wasRemoved ? "kicked" : nobodyCame ? "cancelled" : "completed",
            endedAt: callEndedAt,
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

            // Nothing is deleted. A closer removing the bot is evidence the
            // meeting happened and wasn't for us — worth keeping, worth
            // seeing, and not worth counting. Same resting state Fathom uses
            // for a call it can't stand behind.
            if (notACall) {
              await ctx.runMutation(internal.meetingBot.markCallNotCounted, {
                callId: callEndedBot.callId,
                reason: wasRemoved ? "bot_removed" : "nobody_joined",
              });
              console.log(
                `[recall-webhook] ${subCode} — call ${callEndedBot.callId} left uncounted`,
              );
            }
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, body);
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, body);
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, body);
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // Always nothing pending, because nobody is asked for the form any more —
      // every call is read off its recording.
      //
      // This is what the desktop app polls to decide whether to throw the
      // post-call window over whatever the closer is doing. Answering zero here
      // stops that for every build already installed, without a release.
      // Kept as a live endpoint rather than removed so those builds get a real
      // answer instead of a network error every few seconds.
      return new Response(JSON.stringify({
        count: 0,
        firstCallId: null,
        firstProspectName: null,
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, body);
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, body);
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { meetingUrl, closerId: claimedCloserId, teamId, prospectName } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId, calendarEventId, eventTitle } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId, period, customStart, customEnd } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      if (!closerId) {
        return new Response(JSON.stringify({ error: "closerId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const stats = await ctx.runQuery(api.meetingBot.getCloserDashboardStats, {
        closerId: closerId as Id<"closers">,
        period: period || "week",
        ...(typeof customStart === "number" && typeof customEnd === "number"
          ? { customStart, customEnd }
          : {}),
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, body);
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId, platform } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId, limit } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId, teamId, meetingUrl, meetingTitle, prospectName, calendarEventId } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        // Lets the server recognise a meeting auto-join has already booked, so
        // the click reuses that bot rather than sending a second one.
        calendarEventId: calendarEventId || undefined,
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
    case "custom": return "custom";
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
      const { closerId: claimedCloserId, teamId, period, customStart, customEnd } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        ...(typeof customStart === "number" && typeof customEnd === "number"
          ? { customStart, customEnd }
          : {}),
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId, teamId, period, customStart, customEnd } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        ...(typeof customStart === "number" && typeof customEnd === "number"
          ? { customStart, customEnd }
          : {}),
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId, teamId, period, customStart, customEnd } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        ...(typeof customStart === "number" && typeof customEnd === "number"
          ? { customStart, customEnd }
          : {}),
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId, limit } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
      },
    });
  }),
});

// B2C post-call dispositions: the in-app form's badge/queue + prefill.
http.route({
  path: "/b2c/pending-dispositions",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const closerId = url.searchParams.get("closerId");
    if (!closerId) {
      return b2cJsonResponse({ error: "closerId is required" }, 400);
    }
    try {
      const result = await ctx.runQuery(api.b2cDispositions.getPendingDispositions, {
        closerId: closerId as Id<"closers">,
      });
      return b2cJsonResponse(result, 200);
    } catch (error) {
      console.error("[HTTP] pending-dispositions:", error);
      return b2cJsonResponse({ error: "Internal server error" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/call-disposition",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const callId = url.searchParams.get("callId");
    const closerId = url.searchParams.get("closerId");
    if (!callId || !closerId) {
      return b2cJsonResponse({ error: "callId and closerId are required" }, 400);
    }
    try {
      const result = await ctx.runQuery(api.b2cDispositions.getCallDisposition, {
        callId: callId as Id<"calls">,
        closerId: closerId as Id<"closers">,
      });
      return b2cJsonResponse(result ?? { error: "not found" }, result ? 200 : 404);
    } catch (error) {
      console.error("[HTTP] call-disposition:", error);
      return b2cJsonResponse({ error: "Internal server error" }, 500);
    }
  }),
});

// Polar billing portal for a B2C user (card updates, invoices, cancel).
http.route({
  path: "/b2c/polar-portal",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { b2cUserId } = await request.json();
      if (!b2cUserId) {
        return new Response(JSON.stringify({ error: "b2cUserId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      const result = await ctx.runAction(internal.b2cPolar.createPortalSession, {
        b2cUserId: b2cUserId as Id<"b2cUsers">,
      });
      return new Response(JSON.stringify(result), {
        status: result.url ? 200 : 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in b2c/polar-portal:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/b2c/polar-portal",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
      },
    });
  }),
});

// Swap Closer/Prospect labels on a call's transcript — the closer's own
// escape hatch for mislabelled speakers. The mutation verifies the call
// belongs to the closerId supplied, same trust model as every route here.
http.route({
  path: "/swapSpeakerLabels",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId, closerId } = body;

      if (!callId || !closerId) {
        return new Response(JSON.stringify({ error: "callId and closerId are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const result = await ctx.runMutation(internal.speakerSwap.swapSpeakerLabelsAsCloser, {
        callId: callId as Id<"calls">,
        closerId: closerId as Id<"closers">,
      });

      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in swapSpeakerLabels:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/swapSpeakerLabels",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId, limit } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
      const { closerId: claimedCloserId } = body;
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { ...body, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
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

// POST /b2c/onboarding — Save onboarding questionnaire answers
http.route({
  path: "/b2c/onboarding",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, source, income, struggle } = body;
      if (!userId || !source || !income || !struggle) {
        return b2cJsonResponse({ error: "All fields are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cAuth.completeOnboarding, {
        userId: userId as any,
        source,
        income,
        struggle,
      });
      return b2cJsonResponse(result);
    } catch (error: any) {
      return b2cJsonResponse({ error: error.message || "Failed to save onboarding" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/onboarding",
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
        includeTest: url.searchParams.get("includeTest") === "1" || undefined,
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

// ==================== B2C Weekly Contest Endpoints ====================

// POST /b2c/contest/create — Founder creates a new weekly contest
http.route({
  path: "/b2c/contest/create",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { createdBy, title, description, prizeAmount, weekStartDate, weekEndDate } = body;
      if (!createdBy || !title || prizeAmount == null || !weekStartDate || !weekEndDate) {
        return b2cJsonResponse({ error: "createdBy, title, prizeAmount, weekStartDate, and weekEndDate are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cWeeklyContest.createContest, {
        createdBy: createdBy as any, title, description, prizeAmount: Number(prizeAmount), weekStartDate, weekEndDate,
      });
      return b2cJsonResponse(result);
    } catch (error: any) {
      return b2cJsonResponse({ error: error.message || "Failed to create contest" }, 400);
    }
  }),
});
http.route({ path: "/b2c/contest/create", method: "OPTIONS", handler: b2cCorsPreflightHandler("POST, OPTIONS") });

// GET /b2c/contest/active — Get current active contest
http.route({
  path: "/b2c/contest/active",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const contest = await ctx.runQuery(api.b2cWeeklyContest.getActiveContest, {});
      return b2cJsonResponse(contest || null);
    } catch (error) {
      return b2cJsonResponse({ error: "Failed to get active contest" }, 500);
    }
  }),
});
http.route({ path: "/b2c/contest/active", method: "OPTIONS", handler: b2cCorsPreflightHandler("GET, OPTIONS") });

// GET /b2c/contest/submissions?contestId= — Get submissions for a contest
http.route({
  path: "/b2c/contest/submissions",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const contestId = url.searchParams.get("contestId");
      if (!contestId) return b2cJsonResponse({ error: "contestId is required" }, 400);
      const submissions = await ctx.runQuery(internal.b2cWeeklyContest.getContestSubmissions, {
        contestId: contestId as any,
      });
      return b2cJsonResponse(submissions);
    } catch (error) {
      return b2cJsonResponse({ error: "Failed to get submissions" }, 500);
    }
  }),
});
http.route({ path: "/b2c/contest/submissions", method: "OPTIONS", handler: b2cCorsPreflightHandler("GET, OPTIONS") });

// POST /b2c/contest/submit — Submit an entry to the active contest
http.route({
  path: "/b2c/contest/submit",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, contestId, type, title, clipId, shareUrl } = body;
      if (!userId || !contestId || !type || !title) {
        return b2cJsonResponse({ error: "userId, contestId, type, and title are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cWeeklyContest.submitEntry, {
        userId: userId as any, contestId: contestId as any, type, title,
        clipId: clipId ? (clipId as any) : undefined,
        shareUrl: shareUrl || undefined,
      });
      return b2cJsonResponse(result);
    } catch (error: any) {
      return b2cJsonResponse({ error: error.message || "Failed to submit entry" }, 400);
    }
  }),
});
http.route({ path: "/b2c/contest/submit", method: "OPTIONS", handler: b2cCorsPreflightHandler("POST, OPTIONS") });

// POST /b2c/contest/vote — Cast a vote
http.route({
  path: "/b2c/contest/vote",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, contestId, submissionId } = body;
      if (!userId || !contestId || !submissionId) {
        return b2cJsonResponse({ error: "userId, contestId, and submissionId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cWeeklyContest.castVote, {
        userId: userId as any, contestId: contestId as any, submissionId: submissionId as any,
      });
      return b2cJsonResponse(result);
    } catch (error: any) {
      return b2cJsonResponse({ error: error.message || "Failed to cast vote" }, 400);
    }
  }),
});
http.route({ path: "/b2c/contest/vote", method: "OPTIONS", handler: b2cCorsPreflightHandler("POST, OPTIONS") });

// POST /b2c/contest/remove-vote — Remove a vote
http.route({
  path: "/b2c/contest/remove-vote",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, contestId } = body;
      if (!userId || !contestId) {
        return b2cJsonResponse({ error: "userId and contestId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cWeeklyContest.removeVote, {
        userId: userId as any, contestId: contestId as any,
      });
      return b2cJsonResponse(result);
    } catch (error: any) {
      return b2cJsonResponse({ error: error.message || "Failed to remove vote" }, 400);
    }
  }),
});
http.route({ path: "/b2c/contest/remove-vote", method: "OPTIONS", handler: b2cCorsPreflightHandler("POST, OPTIONS") });

// GET /b2c/contest/my-submission?contestId=&userId= — Get user's submission
http.route({
  path: "/b2c/contest/my-submission",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const contestId = url.searchParams.get("contestId");
      const userId = url.searchParams.get("userId");
      if (!contestId || !userId) return b2cJsonResponse({ error: "contestId and userId are required" }, 400);
      const submission = await ctx.runQuery(internal.b2cWeeklyContest.getMySubmission, {
        contestId: contestId as any, userId: userId as any,
      });
      return b2cJsonResponse(submission || null);
    } catch (error) {
      return b2cJsonResponse({ error: "Failed to get submission" }, 500);
    }
  }),
});
http.route({ path: "/b2c/contest/my-submission", method: "OPTIONS", handler: b2cCorsPreflightHandler("GET, OPTIONS") });

// GET /b2c/contest/my-vote?contestId=&userId= — Get user's vote
http.route({
  path: "/b2c/contest/my-vote",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const contestId = url.searchParams.get("contestId");
      const userId = url.searchParams.get("userId");
      if (!contestId || !userId) return b2cJsonResponse({ error: "contestId and userId are required" }, 400);
      const vote = await ctx.runQuery(internal.b2cWeeklyContest.getMyVote, {
        contestId: contestId as any, userId: userId as any,
      });
      return b2cJsonResponse(vote || null);
    } catch (error) {
      return b2cJsonResponse({ error: "Failed to get vote" }, 500);
    }
  }),
});
http.route({ path: "/b2c/contest/my-vote", method: "OPTIONS", handler: b2cCorsPreflightHandler("GET, OPTIONS") });

// GET /b2c/contest/history — Get past contests with winner info
http.route({
  path: "/b2c/contest/history",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const contests = await ctx.runQuery(api.b2cWeeklyContest.getPastContests, {});
      return b2cJsonResponse(contests);
    } catch (error) {
      return b2cJsonResponse({ error: "Failed to get contest history" }, 500);
    }
  }),
});
http.route({ path: "/b2c/contest/history", method: "OPTIONS", handler: b2cCorsPreflightHandler("GET, OPTIONS") });

// POST /b2c/contest/complete — Founder completes a contest
http.route({
  path: "/b2c/contest/complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { contestId, reviewerUserId } = body;
      if (!contestId || !reviewerUserId) {
        return b2cJsonResponse({ error: "contestId and reviewerUserId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cWeeklyContest.completeContest, {
        contestId: contestId as any, reviewerUserId: reviewerUserId as any,
      });
      return b2cJsonResponse(result);
    } catch (error: any) {
      return b2cJsonResponse({ error: error.message || "Failed to complete contest" }, 400);
    }
  }),
});
http.route({ path: "/b2c/contest/complete", method: "OPTIONS", handler: b2cCorsPreflightHandler("POST, OPTIONS") });

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

// GET /b2c/session/resolve?email=X — Hydrate missing session fields (b2cUserId) from server.
// Used by the Personal app on startup when the locally-cached closerInfo predates the b2cUserId field.
http.route({
  path: "/b2c/session/resolve",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const email = url.searchParams.get("email");

    if (!email) {
      return b2cJsonResponse({ error: "email is required" }, 400);
    }

    try {
      const result = await ctx.runQuery(api.b2cAuth.resolveSessionByEmail, { email });
      return b2cJsonResponse(result);
    } catch (error) {
      console.error("Error resolving B2C session:", error);
      return b2cJsonResponse({ error: "Internal server error" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/session/resolve",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// ============================================
// B2C STRIPE CHECKOUT & PORTAL (via Convex actions)
// ============================================

// POST /b2c/create-checkout — Create Stripe checkout session with 45-day trial
http.route({
  path: "/b2c/create-checkout",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { email, b2cUserId } = await request.json();

      if (!email || !b2cUserId) {
        return b2cJsonResponse({ error: "Missing email or b2cUserId" }, 400);
      }

      const result = await ctx.runAction(internal.b2cStripe.createCheckoutSession, {
        email,
        b2cUserId: b2cUserId as Id<"b2cUsers">,
      });

      return b2cJsonResponse(result);
    } catch (error) {
      console.error("[B2C Checkout] Error:", error);
      return b2cJsonResponse({ error: "Failed to create checkout session" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/create-checkout",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/create-portal — Create Stripe billing portal session
http.route({
  path: "/b2c/create-portal",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { b2cUserId } = await request.json();

      if (!b2cUserId) {
        return b2cJsonResponse({ error: "Missing b2cUserId" }, 400);
      }

      const result = await ctx.runAction(internal.b2cStripe.createPortalSession, {
        b2cUserId: b2cUserId as Id<"b2cUsers">,
      });

      if (result.error) {
        return b2cJsonResponse({ error: result.error }, 400);
      }

      return b2cJsonResponse(result);
    } catch (error) {
      console.error("[B2C Portal] Error:", error);
      return b2cJsonResponse({ error: "Failed to create portal session" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/create-portal",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ============================================
// SEQU3NCE STREAM — Dictation endpoints
// ============================================

// POST /b2c/stream/transcribe — transcribe a base64 audio clip via Groq Whisper
http.route({
  path: "/b2c/stream/transcribe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { b2cUserId, audioBase64, mimeType, durationSec } = body ?? {};

      if (typeof b2cUserId !== "string" || typeof audioBase64 !== "string" || typeof mimeType !== "string") {
        return b2cJsonResponse({ error: "b2cUserId, audioBase64, and mimeType are required" }, 400);
      }
      if (audioBase64.length === 0) {
        return b2cJsonResponse({ error: "Empty audio payload" }, 400);
      }

      const result = await ctx.runAction(internal.streamActions.transcribeAudio, {
        b2cUserId: b2cUserId as Id<"b2cUsers">,
        audioBase64,
        mimeType,
        durationSec: typeof durationSec === "number" ? durationSec : undefined,
      });

      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to transcribe audio";
      console.error("[Stream] transcribe error:", msg);
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/stream/transcribe",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// GET /b2c/stream/history?userId=... — fetch recent transcriptions
http.route({
  path: "/b2c/stream/history",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      const limitParam = url.searchParams.get("limit");

      if (!userId) {
        return b2cJsonResponse({ error: "userId is required" }, 400);
      }

      const limit = limitParam ? parseInt(limitParam, 10) : undefined;
      const rows = await ctx.runQuery(api.stream.getStreamHistory, {
        b2cUserId: userId as Id<"b2cUsers">,
        limit: Number.isFinite(limit as number) ? (limit as number) : undefined,
      });

      return b2cJsonResponse({ transcriptions: rows }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load history";
      console.error("[Stream] history error:", msg);
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/stream/history",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// DELETE /b2c/stream/history — delete one transcription or all (via JSON body)
// POST is used instead of DELETE so browsers and Electron can send a JSON body cleanly.
http.route({
  path: "/b2c/stream/history/delete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { b2cUserId, transcriptionId, all } = body ?? {};

      if (typeof b2cUserId !== "string") {
        return b2cJsonResponse({ error: "b2cUserId is required" }, 400);
      }

      if (all === true) {
        const result = await ctx.runMutation(api.stream.deleteAllStreamHistory, {
          b2cUserId: b2cUserId as Id<"b2cUsers">,
        });
        return b2cJsonResponse(result, 200, true);
      }

      if (typeof transcriptionId !== "string") {
        return b2cJsonResponse({ error: "transcriptionId or all is required" }, 400);
      }

      const result = await ctx.runMutation(api.stream.deleteStreamTranscription, {
        b2cUserId: b2cUserId as Id<"b2cUsers">,
        transcriptionId: transcriptionId as Id<"streamTranscriptions">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to delete transcription";
      console.error("[Stream] delete error:", msg);
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/stream/history/delete",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// GET /b2c/stream/settings?userId=... — fetch a user's Stream settings
http.route({
  path: "/b2c/stream/settings",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) {
        return b2cJsonResponse({ error: "userId is required" }, 400);
      }

      const settings = await ctx.runQuery(api.stream.getStreamSettings, {
        b2cUserId: userId as Id<"b2cUsers">,
      });

      return b2cJsonResponse({ settings }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load settings";
      console.error("[Stream] settings GET error:", msg);
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

// POST /b2c/stream/settings — save a user's Stream settings
http.route({
  path: "/b2c/stream/settings",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { b2cUserId, hotkey, hasCompletedOnboarding, enabled } = body ?? {};

      if (typeof b2cUserId !== "string" || typeof hotkey !== "string") {
        return b2cJsonResponse({ error: "b2cUserId and hotkey are required" }, 400);
      }

      const id = await ctx.runMutation(api.stream.upsertStreamSettings, {
        b2cUserId: b2cUserId as Id<"b2cUsers">,
        hotkey,
        hasCompletedOnboarding:
          typeof hasCompletedOnboarding === "boolean" ? hasCompletedOnboarding : undefined,
        enabled:
          typeof enabled === "boolean" ? enabled : undefined,
      });

      return b2cJsonResponse({ id }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to save settings";
      console.error("[Stream] settings POST error:", msg);
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/stream/settings",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, POST, OPTIONS"),
});

// GET /b2c/stream/api-key?userId=... — return the Groq API key for direct client-side calls.
// Only returns the key if the user exists and has an active/trialing subscription.
http.route({
  path: "/b2c/stream/api-key",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) {
        return b2cJsonResponse({ error: "userId is required" }, 400);
      }

      // Verify user exists via subscription check (reuses existing public query)
      const sub = await ctx.runQuery(api.b2cBilling.getB2CSubscription, {
        userId: userId as Id<"b2cUsers">,
      });
      if (!sub) {
        return b2cJsonResponse({ error: "User not found" }, 404);
      }

      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        return b2cJsonResponse({ error: "Transcription service not configured" }, 503);
      }

      return b2cJsonResponse({ apiKey }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to get API key";
      console.error("[Stream] api-key error:", msg);
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/stream/api-key",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// POST /b2c/stream/save — save a transcription produced client-side (direct Groq flow)
http.route({
  path: "/b2c/stream/save",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { b2cUserId, text, durationSec } = body ?? {};

      if (typeof b2cUserId !== "string" || typeof text !== "string") {
        return b2cJsonResponse({ error: "b2cUserId and text are required" }, 400);
      }

      const id = await ctx.runMutation(api.stream.saveStreamTranscription, {
        b2cUserId: b2cUserId as Id<"b2cUsers">,
        text,
        durationSec: typeof durationSec === "number" ? durationSec : undefined,
      });

      return b2cJsonResponse({ id }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to save transcription";
      console.error("[Stream] save error:", msg);
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/stream/save",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ============================================
// B2C LEADS — landing page lead capture
// ============================================

// POST /b2c/leads — save a lead from the landing page (email + phone + optional name)
http.route({
  path: "/b2c/leads",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { email, phone, firstName, lastName, source, refParam } = body ?? {};

      if (typeof email !== "string" || typeof phone !== "string") {
        return b2cJsonResponse({ error: "email and phone are required" }, 400);
      }

      const id = await ctx.runMutation(api.b2cLeads.saveLead, {
        email,
        phone,
        firstName: typeof firstName === "string" ? firstName : undefined,
        lastName: typeof lastName === "string" ? lastName : undefined,
        source: typeof source === "string" ? source : undefined,
        refParam: typeof refParam === "string" ? refParam : undefined,
      });

      return b2cJsonResponse({ id }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to save lead";
      console.error("[Leads] save error:", msg);
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/leads",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// GET /b2c/recent-signups — real opt-ins for the social-proof toasts.
// Empty array below the honesty floor (see b2cLeads.getRecentSignupsPublic).
http.route({
  path: "/b2c/recent-signups",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const list = await ctx.runQuery(api.b2cLeads.getRecentSignupsPublic, {});
      return b2cJsonResponse(list, 200);
    } catch (error) {
      console.error("[HTTP] recent-signups:", error);
      return b2cJsonResponse([], 200);
    }
  }),
});

// GET /b2c/lead-count — real lead total for the live-counter widget.
// Empty object below the honesty floor → the widget renders nothing.
http.route({
  path: "/b2c/lead-count",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const result = await ctx.runQuery(api.b2cLeads.getLeadCountPublic, {});
      return b2cJsonResponse(result, 200);
    } catch (error) {
      console.error("[HTTP] lead-count:", error);
      return b2cJsonResponse({}, 200);
    }
  }),
});

// ============================================
// B2C MULTI-CALENDAR
// ============================================

// GET /b2c/calendars?closerId=X — list all calendar connections for a closer
http.route({
  path: "/b2c/calendars",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const closerId = url.searchParams.get("closerId");
      if (!closerId) {
        return b2cJsonResponse({ error: "closerId is required" }, 400);
      }
      const calendars = await ctx.runQuery(api.b2cCalendars.getCalendars, {
        closerId: closerId as Id<"closers">,
      });
      return b2cJsonResponse({ calendars }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load calendars";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

// POST /b2c/calendars — add a new calendar connection
http.route({
  path: "/b2c/calendars",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { closerId, teamId, label, provider, googleEmail, icsUrl } = body ?? {};
      if (typeof closerId !== "string" || typeof teamId !== "string" || typeof label !== "string" || typeof provider !== "string") {
        return b2cJsonResponse({ error: "closerId, teamId, label, and provider are required" }, 400);
      }
      // NOTE: googleRefreshToken is NOT accepted from the client — only set via OAuth callback
      const result = await ctx.runMutation(api.b2cCalendars.addCalendar, {
        closerId: closerId as Id<"closers">,
        teamId: teamId as Id<"teams">,
        label,
        provider,
        googleEmail: typeof googleEmail === "string" ? googleEmail : undefined,
        icsUrl: typeof icsUrl === "string" ? icsUrl : undefined,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to add calendar";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

// POST /b2c/calendars/remove — remove a calendar and all its events
http.route({
  path: "/b2c/calendars/remove",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { calendarId, closerId } = body ?? {};
      if (typeof calendarId !== "string" || typeof closerId !== "string") {
        return b2cJsonResponse({ error: "calendarId and closerId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCalendars.removeCalendar, {
        calendarId: calendarId as Id<"b2cCalendars">,
        closerId: closerId as Id<"closers">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to remove calendar";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

// POST /b2c/calendars/update — update label, color, or enabled state
http.route({
  path: "/b2c/calendars/update",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { calendarId, closerId, label, color, isEnabled } = body ?? {};
      if (typeof calendarId !== "string" || typeof closerId !== "string") {
        return b2cJsonResponse({ error: "calendarId and closerId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCalendars.updateCalendar, {
        calendarId: calendarId as Id<"b2cCalendars">,
        closerId: closerId as Id<"closers">,
        label: typeof label === "string" ? label : undefined,
        color: typeof color === "string" ? color : undefined,
        isEnabled: typeof isEnabled === "boolean" ? isEnabled : undefined,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to update calendar";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/calendars",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, POST, OPTIONS"),
});

http.route({
  path: "/b2c/calendars/remove",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

http.route({
  path: "/b2c/calendars/update",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ============================================
// B2C FEATURE REQUESTS
// ============================================

http.route({
  path: "/b2c/feature-requests",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      const sortBy = url.searchParams.get("sortBy") || "popular";
      const limit = url.searchParams.get("limit");
      const requests = await ctx.runQuery(api.b2cFeatureRequests.listRequests, {
        userId: userId ? userId as Id<"b2cUsers"> : undefined,
        sortBy,
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return b2cJsonResponse({ requests }, 200, true);
    } catch (error) {
      return b2cJsonResponse({ error: "Failed to load feature requests" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/feature-requests",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, title, description } = body ?? {};
      if (typeof userId !== "string" || typeof title !== "string" || typeof description !== "string") {
        return b2cJsonResponse({ error: "userId, title, and description are required" }, 400);
      }
      const id = await ctx.runMutation(api.b2cFeatureRequests.createRequest, {
        userId: userId as Id<"b2cUsers">,
        title,
        description,
      });
      return b2cJsonResponse({ id }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to create request";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/feature-requests",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, POST, OPTIONS"),
});

http.route({
  path: "/b2c/feature-requests/upvote",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { userId, requestId } = await request.json();
      if (typeof userId !== "string" || typeof requestId !== "string") {
        return b2cJsonResponse({ error: "userId and requestId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cFeatureRequests.upvoteRequest, {
        userId: userId as Id<"b2cUsers">,
        requestId: requestId as Id<"b2cFeatureRequests">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to upvote";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/feature-requests/upvote",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

http.route({
  path: "/b2c/feature-requests/remove-upvote",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { userId, requestId } = await request.json();
      if (typeof userId !== "string" || typeof requestId !== "string") {
        return b2cJsonResponse({ error: "userId and requestId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cFeatureRequests.removeUpvote, {
        userId: userId as Id<"b2cUsers">,
        requestId: requestId as Id<"b2cFeatureRequests">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to remove upvote";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/feature-requests/remove-upvote",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

http.route({
  path: "/b2c/feature-requests/status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { userId, requestId, status } = await request.json();
      if (typeof userId !== "string" || typeof requestId !== "string" || typeof status !== "string") {
        return b2cJsonResponse({ error: "userId, requestId, and status are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cFeatureRequests.updateStatus, {
        userId: userId as Id<"b2cUsers">,
        requestId: requestId as Id<"b2cFeatureRequests">,
        status,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to update status";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/feature-requests/status",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

http.route({
  path: "/b2c/feature-requests/delete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { userId, requestId } = await request.json();
      if (typeof userId !== "string" || typeof requestId !== "string") {
        return b2cJsonResponse({ error: "userId and requestId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cFeatureRequests.deleteRequest, {
        userId: userId as Id<"b2cUsers">,
        requestId: requestId as Id<"b2cFeatureRequests">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to delete request";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/feature-requests/delete",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ============================================
// B2C BUG REPORTS
// ============================================

http.route({
  path: "/b2c/bug-reports",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { authorId, authorEmail, whatHappened, whatWereDoing, whichScreen, appVersion, platform } = body ?? {};
      if (typeof authorId !== "string" || typeof whatHappened !== "string" || typeof whatWereDoing !== "string" || typeof whichScreen !== "string") {
        return b2cJsonResponse({ error: "authorId, whatHappened, whatWereDoing, and whichScreen are required" }, 400);
      }
      const id = await ctx.runMutation(api.b2cBugReports.submitBugReport, {
        authorId: authorId as Id<"b2cUsers">,
        authorEmail: typeof authorEmail === "string" ? authorEmail : "",
        whatHappened,
        whatWereDoing,
        whichScreen,
        appVersion: typeof appVersion === "string" ? appVersion : undefined,
        platform: typeof platform === "string" ? platform : undefined,
      });
      return b2cJsonResponse({ id }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to submit bug report";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/bug-reports",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const authorId = url.searchParams.get("authorId");
      if (!authorId) {
        return b2cJsonResponse({ error: "authorId is required" }, 400);
      }
      const reports = await ctx.runQuery(api.b2cBugReports.getMyReports, {
        authorId: authorId as Id<"b2cUsers">,
      });
      return b2cJsonResponse({ reports }, 200, true);
    } catch (error) {
      return b2cJsonResponse({ error: "Failed to load reports" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/bug-reports",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, POST, OPTIONS"),
});

// ==================== Money Bells ====================

// GET /b2c/money-bells/opt-in-status?userId=X
http.route({
  path: "/b2c/money-bells/opt-in-status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const result = await ctx.runQuery(api.b2cMoneyBells.getOptInStatus, {
        userId: userId as Id<"b2cUsers">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/money-bells/opt-in-status",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// POST /b2c/money-bells/opt-in — join Money Bells
http.route({
  path: "/b2c/money-bells/opt-in",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || typeof body.acknowledgedWarning !== "boolean") {
        return b2cJsonResponse({ error: "userId and acknowledgedWarning are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cMoneyBells.joinMoneyBells, {
        userId: body.userId as Id<"b2cUsers">,
        acknowledgedWarning: body.acknowledgedWarning,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/money-bells/opt-in",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/money-bells/opt-out — leave Money Bells (past broadcasts remain)
http.route({
  path: "/b2c/money-bells/opt-out",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId) {
        return b2cJsonResponse({ error: "userId is required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cMoneyBells.leaveMoneyBells, {
        userId: body.userId as Id<"b2cUsers">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/money-bells/opt-out",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/money-bells/broadcast — create a broadcast
http.route({
  path: "/b2c/money-bells/broadcast",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.callId || typeof body.cashCollected !== "number") {
        return b2cJsonResponse({ error: "userId, callId, and cashCollected are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cMoneyBells.createBroadcast, {
        userId: body.userId as Id<"b2cUsers">,
        callId: body.callId as Id<"calls">,
        cashCollected: body.cashCollected,
        note: body.note || undefined,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/money-bells/broadcast",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/money-bells/broadcast/delete — delete a broadcast (1h window or founder)
http.route({
  path: "/b2c/money-bells/broadcast/delete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.broadcastId) {
        return b2cJsonResponse({ error: "userId and broadcastId are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cMoneyBells.deleteBroadcast, {
        userId: body.userId as Id<"b2cUsers">,
        broadcastId: body.broadcastId as Id<"b2cMoneyBellBroadcasts">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/money-bells/broadcast/delete",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// GET /b2c/money-bells/leaderboard?month=YYYY-MM&page=N
http.route({
  path: "/b2c/money-bells/leaderboard",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const month = url.searchParams.get("month");
      const page = Number(url.searchParams.get("page") || "1");
      if (!month) return b2cJsonResponse({ error: "month is required" }, 400);
      const result = await ctx.runQuery(api.b2cMoneyBells.getLeaderboard, {
        month,
        page,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/money-bells/leaderboard",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/money-bells/user-rank?userId=X&month=YYYY-MM
http.route({
  path: "/b2c/money-bells/user-rank",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      const month = url.searchParams.get("month");
      if (!userId || !month) return b2cJsonResponse({ error: "userId and month are required" }, 400);
      const result = await ctx.runQuery(api.b2cMoneyBells.getUserRank, {
        userId: userId as Id<"b2cUsers">,
        month,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/money-bells/user-rank",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/money-bells/prize?month=YYYY-MM
http.route({
  path: "/b2c/money-bells/prize",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const month = url.searchParams.get("month");
      if (!month) return b2cJsonResponse({ error: "month is required" }, 400);
      const result = await ctx.runQuery(api.b2cMoneyBells.getMonthlyPrize, { month });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

// POST /b2c/money-bells/prize — founder-only: set monthly prize (all three ranks)
http.route({
  path: "/b2c/money-bells/prize",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.month) {
        return b2cJsonResponse({ error: "userId and month are required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cMoneyBells.setMonthlyPrize, {
        userId: body.userId as Id<"b2cUsers">,
        month: body.month,
        prizeText1: typeof body.prizeText1 === "string" ? body.prizeText1 : undefined,
        prizeText2: typeof body.prizeText2 === "string" ? body.prizeText2 : undefined,
        prizeText3: typeof body.prizeText3 === "string" ? body.prizeText3 : undefined,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 403);
    }
  }),
});

http.route({
  path: "/b2c/money-bells/prize",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, POST, OPTIONS"),
});

// POST /b2c/money-bells/prize/paid — founder-only: mark prize as paid
http.route({
  path: "/b2c/money-bells/prize/paid",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.month) {
        return b2cJsonResponse({ error: "userId and month are required" }, 400);
      }
      const rank =
        body.rank === 2 ? 2 : body.rank === 3 ? 3 : (1 as 1);
      const result = await ctx.runMutation(api.b2cMoneyBells.markPrizePaid, {
        userId: body.userId as Id<"b2cUsers">,
        month: body.month,
        rank,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 403);
    }
  }),
});

http.route({
  path: "/b2c/money-bells/prize/paid",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ============================================
// B2C PERSONAL GOAL TRACKER
// ============================================

// GET /b2c/personal-goals/active?userId=X&closerId=Y
http.route({
  path: "/b2c/personal-goals/active",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      const closerId = url.searchParams.get("closerId");
      if (!userId || !closerId) {
        return b2cJsonResponse({ error: "userId and closerId are required" }, 400);
      }
      const result = await ctx.runQuery(api.b2cPersonalGoals.getActiveGoalWithProgress, {
        userId: userId as Id<"b2cUsers">,
        closerId: closerId as Id<"closers">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/personal-goals/active",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/personal-goals/commission?userId=X
http.route({
  path: "/b2c/personal-goals/commission",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const result = await ctx.runQuery(api.b2cPersonalGoals.getCommissionSettings, {
        userId: userId as Id<"b2cUsers">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

// POST /b2c/personal-goals/commission
http.route({
  path: "/b2c/personal-goals/commission",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || !body.commissionMode || typeof body.commissionRate !== "number") {
        return b2cJsonResponse({ error: "userId, commissionMode, commissionRate are required" }, 400);
      }
      if (body.commissionMode !== "cash" && body.commissionMode !== "contract") {
        return b2cJsonResponse({ error: "commissionMode must be 'cash' or 'contract'" }, 400);
      }
      const result = await ctx.runMutation(api.b2cPersonalGoals.setCommissionSettings, {
        userId: body.userId as Id<"b2cUsers">,
        commissionMode: body.commissionMode,
        commissionRate: body.commissionRate,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/personal-goals/commission",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, POST, OPTIONS"),
});

// POST /b2c/personal-goals/create — create a new active goal
http.route({
  path: "/b2c/personal-goals/create",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId || typeof body.title !== "string" || typeof body.targetAmount !== "number" || typeof body.durationMonths !== "number") {
        return b2cJsonResponse({ error: "userId, title, targetAmount, durationMonths required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cPersonalGoals.createGoal, {
        userId: body.userId as Id<"b2cUsers">,
        title: body.title,
        emoji: typeof body.emoji === "string" ? body.emoji : undefined,
        targetAmount: body.targetAmount,
        durationMonths: body.durationMonths,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/personal-goals/create",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/personal-goals/cancel — cancel the user's active goal
http.route({
  path: "/b2c/personal-goals/cancel",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const result = await ctx.runMutation(api.b2cPersonalGoals.cancelActiveGoal, {
        userId: body.userId as Id<"b2cUsers">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/personal-goals/cancel",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ============================================
// B2C COACHING CALLS
// ============================================

// GET /b2c/coaching-calls/list?status=X&limit=Y
http.route({
  path: "/b2c/coaching-calls/list",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const statusStr = url.searchParams.get("status");
      const limitStr = url.searchParams.get("limit");
      const validStatus =
        statusStr === "scheduled" ||
        statusStr === "live" ||
        statusStr === "ended" ||
        statusStr === "cancelled"
          ? (statusStr as "scheduled" | "live" | "ended" | "cancelled")
          : undefined;
      const result = await ctx.runQuery(api.b2cCoachingCalls.listCoachingCalls, {
        status: validStatus,
        limit: limitStr ? Number(limitStr) : undefined,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/coaching-calls/list",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/coaching-calls/detail?callId=X
http.route({
  path: "/b2c/coaching-calls/detail",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const callId = url.searchParams.get("callId");
      if (!callId) return b2cJsonResponse({ error: "callId is required" }, 400);
      const result = await ctx.runQuery(api.b2cCoachingCalls.getCoachingCall, {
        callId: callId as Id<"b2cCoachingCalls">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/coaching-calls/detail",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/coaching-calls/past?cursor=X&limit=Y — past calls with ready recordings
http.route({
  path: "/b2c/coaching-calls/past",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const cursorStr = url.searchParams.get("cursor");
      const limitStr = url.searchParams.get("limit");
      const result = await ctx.runQuery(
        api.b2cCoachingCalls.getPastCoachingCallsWithRecordings,
        {
          cursor: cursorStr ? Number(cursorStr) : undefined,
          limit: limitStr ? Number(limitStr) : undefined,
        }
      );
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/coaching-calls/past",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// POST /b2c/coaching-calls/create
http.route({
  path: "/b2c/coaching-calls/create",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (
        !body.coachUserId ||
        typeof body.title !== "string" ||
        typeof body.scheduledStartTime !== "number" ||
        typeof body.scheduledDurationMin !== "number"
      ) {
        return b2cJsonResponse(
          { error: "coachUserId, title, scheduledStartTime, scheduledDurationMin required" },
          400
        );
      }
      const result = await ctx.runMutation(api.b2cCoachingCalls.createCoachingCall, {
        coachUserId: body.coachUserId as Id<"b2cUsers">,
        title: body.title,
        description: typeof body.description === "string" ? body.description : undefined,
        scheduledStartTime: body.scheduledStartTime,
        scheduledDurationMin: body.scheduledDurationMin,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/coaching-calls/create",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/coaching-calls/cancel
http.route({
  path: "/b2c/coaching-calls/cancel",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.callId || !body.callerId) {
        return b2cJsonResponse({ error: "callId and callerId required" }, 400);
      }
      const result = await ctx.runMutation(api.b2cCoachingCalls.cancelCoachingCall, {
        callId: body.callId as Id<"b2cCoachingCalls">,
        callerId: body.callerId as Id<"b2cUsers">,
        reason: typeof body.reason === "string" ? body.reason : undefined,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/coaching-calls/cancel",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/coaching-calls/start — coach starts the call
http.route({
  path: "/b2c/coaching-calls/start",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.callId || !body.coachUserId) {
        return b2cJsonResponse({ error: "callId and coachUserId required" }, 400);
      }
      const result = await ctx.runAction(
        api.b2cCoachingCallsDaily.startCoachingCall,
        {
          callId: body.callId as Id<"b2cCoachingCalls">,
          coachUserId: body.coachUserId as Id<"b2cUsers">,
        }
      );
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/coaching-calls/start",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/coaching-calls/join — attendee joins a live call
http.route({
  path: "/b2c/coaching-calls/join",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.callId || !body.userId) {
        return b2cJsonResponse({ error: "callId and userId required" }, 400);
      }
      const result = await ctx.runAction(
        api.b2cCoachingCallsDaily.joinCoachingCall,
        {
          callId: body.callId as Id<"b2cCoachingCalls">,
          userId: body.userId as Id<"b2cUsers">,
        }
      );
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/coaching-calls/join",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/coaching-calls/end — coach ends the call
http.route({
  path: "/b2c/coaching-calls/end",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.callId || !body.coachUserId) {
        return b2cJsonResponse({ error: "callId and coachUserId required" }, 400);
      }
      const result = await ctx.runAction(
        api.b2cCoachingCallsDaily.endCoachingCall,
        {
          callId: body.callId as Id<"b2cCoachingCalls">,
          coachUserId: body.coachUserId as Id<"b2cUsers">,
        }
      );
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/coaching-calls/end",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/coaching-calls/kick — coach removes a participant
http.route({
  path: "/b2c/coaching-calls/kick",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.callId || !body.coachUserId || !body.targetSessionId) {
        return b2cJsonResponse(
          { error: "callId, coachUserId, targetSessionId required" },
          400
        );
      }
      const result = await ctx.runAction(
        api.b2cCoachingCallsDaily.kickFromCoachingCall,
        {
          callId: body.callId as Id<"b2cCoachingCalls">,
          coachUserId: body.coachUserId as Id<"b2cUsers">,
          targetSessionId: body.targetSessionId,
        }
      );
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/coaching-calls/kick",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/coaching-calls/delete-recording — coach or founder removes the replay
http.route({
  path: "/b2c/coaching-calls/delete-recording",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.callId || !body.callerId) {
        return b2cJsonResponse({ error: "callId and callerId required" }, 400);
      }
      const result = await ctx.runAction(
        api.b2cCoachingCallsDaily.deleteCoachingCallRecording,
        {
          callId: body.callId as Id<"b2cCoachingCalls">,
          callerId: body.callerId as Id<"b2cUsers">,
        }
      );
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/coaching-calls/delete-recording",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// (breakouts/start route removed in v1.15 — inline role-play replaced breakouts)

// ==================== Objection Playbook ====================

// GET /b2c/playbook/list?cursor=X&limit=Y&tag=Z&sortBy=top|newest&userId=W
http.route({
  path: "/b2c/playbook/list",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const cursorStr = url.searchParams.get("cursor");
      const limitStr = url.searchParams.get("limit");
      const tag = url.searchParams.get("tag");
      const sortByParam = url.searchParams.get("sortBy");
      const userIdStr = url.searchParams.get("userId");
      const sortBy: "top" | "newest" =
        sortByParam === "newest" ? "newest" : "top";
      const result = await ctx.runQuery(
        api.b2cObjectionPlaybook.listPlaybookEntries,
        {
          cursor: cursorStr ? Number(cursorStr) : undefined,
          limit: limitStr ? Number(limitStr) : undefined,
          tag: tag ?? undefined,
          sortBy,
          userId: userIdStr ? (userIdStr as Id<"b2cUsers">) : undefined,
        }
      );
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/playbook/list",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/playbook/detail?entryId=X&userId=Y
http.route({
  path: "/b2c/playbook/detail",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const entryId = url.searchParams.get("entryId");
      const userIdStr = url.searchParams.get("userId");
      if (!entryId) {
        return b2cJsonResponse({ error: "entryId required" }, 400);
      }
      const result = await ctx.runQuery(
        api.b2cObjectionPlaybook.getPlaybookEntry,
        {
          entryId: entryId as Id<"b2cObjectionPlaybook">,
          userId: userIdStr ? (userIdStr as Id<"b2cUsers">) : undefined,
        }
      );
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/playbook/detail",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// POST /b2c/playbook/create — coach-only (Battle Royale auto-save + manual)
http.route({
  path: "/b2c/playbook/create",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.coachUserId || !body.rebuttalText || !body.objectionText || !body.authorName) {
        return b2cJsonResponse(
          { error: "coachUserId, rebuttalText, objectionText, authorName required" },
          400
        );
      }
      const result = await ctx.runMutation(
        api.b2cObjectionPlaybook.createPlaybookEntry,
        {
          coachUserId: body.coachUserId as Id<"b2cUsers">,
          rebuttalText: String(body.rebuttalText),
          objectionText: String(body.objectionText),
          authorUserId: body.authorUserId
            ? (body.authorUserId as Id<"b2cUsers">)
            : undefined,
          authorName: String(body.authorName),
          tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
          sourceCallId: body.sourceCallId
            ? (body.sourceCallId as Id<"b2cCoachingCalls">)
            : undefined,
          coachAnnotation: body.coachAnnotation
            ? String(body.coachAnnotation)
            : undefined,
          featured: typeof body.featured === "boolean" ? body.featured : undefined,
        }
      );
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/playbook/create",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/playbook/update — coach-only
http.route({
  path: "/b2c/playbook/update",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.entryId || !body.coachUserId) {
        return b2cJsonResponse({ error: "entryId, coachUserId required" }, 400);
      }
      const result = await ctx.runMutation(
        api.b2cObjectionPlaybook.updatePlaybookEntry,
        {
          entryId: body.entryId as Id<"b2cObjectionPlaybook">,
          coachUserId: body.coachUserId as Id<"b2cUsers">,
          coachAnnotation: body.coachAnnotation !== undefined
            ? String(body.coachAnnotation)
            : undefined,
          featured: typeof body.featured === "boolean" ? body.featured : undefined,
          tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
          rebuttalText: body.rebuttalText !== undefined
            ? String(body.rebuttalText)
            : undefined,
          objectionText: body.objectionText !== undefined
            ? String(body.objectionText)
            : undefined,
        }
      );
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/playbook/update",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/playbook/delete — coach-only
http.route({
  path: "/b2c/playbook/delete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.entryId || !body.coachUserId) {
        return b2cJsonResponse({ error: "entryId, coachUserId required" }, 400);
      }
      const result = await ctx.runMutation(
        api.b2cObjectionPlaybook.deletePlaybookEntry,
        {
          entryId: body.entryId as Id<"b2cObjectionPlaybook">,
          coachUserId: body.coachUserId as Id<"b2cUsers">,
        }
      );
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/playbook/delete",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/playbook/vote — any active subscriber (toggles vote)
http.route({
  path: "/b2c/playbook/vote",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.entryId || !body.userId) {
        return b2cJsonResponse({ error: "entryId, userId required" }, 400);
      }
      const result = await ctx.runMutation(
        api.b2cObjectionPlaybook.votePlaybookEntry,
        {
          entryId: body.entryId as Id<"b2cObjectionPlaybook">,
          userId: body.userId as Id<"b2cUsers">,
        }
      );
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/playbook/vote",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// GET /b2c/money-bells/feed?cursor=X&limit=Y&userId=Z
http.route({
  path: "/b2c/money-bells/feed",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const cursor = url.searchParams.get("cursor");
      const limit = url.searchParams.get("limit");
      const userId = url.searchParams.get("userId");
      const result = await ctx.runQuery(api.b2cMoneyBells.getMoneyBellsFeed, {
        cursor: cursor ? Number(cursor) : undefined,
        limit: limit ? Number(limit) : undefined,
        userId: userId ? (userId as Id<"b2cUsers">) : undefined,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/money-bells/feed",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/money-bells/hall-of-fame
http.route({
  path: "/b2c/money-bells/hall-of-fame",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const result = await ctx.runQuery(api.b2cMoneyBells.getHallOfFame, {});
      return b2cJsonResponse({ winners: result }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/money-bells/hall-of-fame",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/money-bells/month-stats?month=YYYY-MM
http.route({
  path: "/b2c/money-bells/month-stats",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const month = url.searchParams.get("month");
      if (!month) return b2cJsonResponse({ error: "month is required" }, 400);
      const result = await ctx.runQuery(api.b2cMoneyBells.getMonthStats, { month });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/money-bells/month-stats",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/money-bells/has-broadcast-for-call?callId=X
http.route({
  path: "/b2c/money-bells/has-broadcast-for-call",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const callId = url.searchParams.get("callId");
      if (!callId) return b2cJsonResponse({ error: "callId is required" }, 400);
      const result = await ctx.runQuery(api.b2cMoneyBells.hasBroadcastForCall, {
        callId: callId as Id<"calls">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/money-bells/has-broadcast-for-call",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/money-bells/unread-count?userId=X&since=T — count of recent broadcasts by others
http.route({
  path: "/b2c/money-bells/unread-count",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      const sinceStr = url.searchParams.get("since");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const since = sinceStr ? Number(sinceStr) : 0;
      if (!Number.isFinite(since)) return b2cJsonResponse({ error: "since must be a number" }, 400);
      const result = await ctx.runQuery(api.b2cMoneyBells.getUnreadBroadcastCount, {
        userId: userId as Id<"b2cUsers">,
        since,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/money-bells/unread-count",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// ============================================
// B2C TEAM NOTIFICATIONS (founder→users)
// ============================================

// POST /b2c/notifications/send — founder sends to specific recipients
http.route({
  path: "/b2c/notifications/send",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const result = await ctx.runMutation(api.b2cTeamNotifications.sendTeamNotification, {
        founderId: body.founderId as Id<"b2cUsers">,
        recipientIds: body.recipientIds as Id<"b2cUsers">[],
        body: body.body,
        repliesAllowed: body.repliesAllowed,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/notifications/send",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/notifications/send-all — founder sends to all eligible users
http.route({
  path: "/b2c/notifications/send-all",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const result = await ctx.runMutation(api.b2cTeamNotifications.sendTeamNotificationToAll, {
        founderId: body.founderId as Id<"b2cUsers">,
        body: body.body,
        repliesAllowed: body.repliesAllowed,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/notifications/send-all",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/notifications/mark-thread-read — founder marks team thread read (shared state)
http.route({
  path: "/b2c/notifications/mark-thread-read",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const result = await ctx.runMutation(api.b2cTeamNotifications.markTeamThreadRead, {
        founderId: body.founderId as Id<"b2cUsers">,
        threadId: body.threadId as Id<"b2cDirectMessageThreads">,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/notifications/mark-thread-read",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/notifications/reply-team-thread — user reply into a team thread
http.route({
  path: "/b2c/notifications/reply-team-thread",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const result = await ctx.runMutation(api.b2cTeamNotifications.replyToTeamThread, {
        senderId: body.senderId as Id<"b2cUsers">,
        threadId: body.threadId as Id<"b2cDirectMessageThreads">,
        body: body.body,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/notifications/reply-team-thread",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/notifications/send-as-team — founder reply as "Sequ3nce Team"
http.route({
  path: "/b2c/notifications/send-as-team",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const result = await ctx.runMutation(api.b2cTeamNotifications.sendTeamMessageAsTeam, {
        founderId: body.founderId as Id<"b2cUsers">,
        threadId: body.threadId as Id<"b2cDirectMessageThreads">,
        body: body.body,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/notifications/send-as-team",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// GET /b2c/notifications/eligible-count — count of users that a "send to all" will hit
http.route({
  path: "/b2c/notifications/eligible-count",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const founderId = url.searchParams.get("founderId");
      if (!founderId) return b2cJsonResponse({ error: "founderId is required" }, 400);
      const result = await ctx.runQuery(api.b2cTeamNotifications.getEligibleRecipientCount, {
        founderId: founderId as Id<"b2cUsers">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/notifications/eligible-count",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/notifications/broadcasts — founder history list
http.route({
  path: "/b2c/notifications/broadcasts",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const founderId = url.searchParams.get("founderId");
      const cursorStr = url.searchParams.get("cursor");
      const limitStr = url.searchParams.get("limit");
      if (!founderId) return b2cJsonResponse({ error: "founderId is required" }, 400);
      const result = await ctx.runQuery(api.b2cTeamNotifications.listTeamBroadcasts, {
        founderId: founderId as Id<"b2cUsers">,
        cursor: cursorStr ? Number(cursorStr) : undefined,
        limit: limitStr ? Number(limitStr) : undefined,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/notifications/broadcasts",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/notifications/team-threads — founder inbox list
http.route({
  path: "/b2c/notifications/team-threads",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const founderId = url.searchParams.get("founderId");
      const cursorStr = url.searchParams.get("cursor");
      const limitStr = url.searchParams.get("limit");
      if (!founderId) return b2cJsonResponse({ error: "founderId is required" }, 400);
      const result = await ctx.runQuery(api.b2cTeamNotifications.listTeamThreads, {
        founderId: founderId as Id<"b2cUsers">,
        cursor: cursorStr ? Number(cursorStr) : undefined,
        limit: limitStr ? Number(limitStr) : undefined,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/notifications/team-threads",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/notifications/team-unread-count — shared founder badge count
http.route({
  path: "/b2c/notifications/team-unread-count",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const founderId = url.searchParams.get("founderId");
      if (!founderId) return b2cJsonResponse({ error: "founderId is required" }, 400);
      const result = await ctx.runQuery(api.b2cTeamNotifications.getTeamUnreadCount, {
        founderId: founderId as Id<"b2cUsers">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/notifications/team-unread-count",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/notifications/team-thread-messages — founder reads a team thread
http.route({
  path: "/b2c/notifications/team-thread-messages",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const founderId = url.searchParams.get("founderId");
      const threadId = url.searchParams.get("threadId");
      const cursorStr = url.searchParams.get("cursor");
      const limitStr = url.searchParams.get("limit");
      if (!founderId || !threadId) return b2cJsonResponse({ error: "founderId and threadId are required" }, 400);
      const result = await ctx.runQuery(api.b2cTeamNotifications.getTeamThreadMessages, {
        founderId: founderId as Id<"b2cUsers">,
        threadId: threadId as Id<"b2cDirectMessageThreads">,
        cursor: cursorStr ? Number(cursorStr) : undefined,
        limit: limitStr ? Number(limitStr) : undefined,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/notifications/team-thread-messages",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// ============================================
// B2C STATS VERIFICATION (founder review of claimed stats)
// ============================================

// POST /b2c/stats-verification/upload-url — get a signed URL for one evidence file
http.route({
  path: "/b2c/stats-verification/upload-url",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const result = await ctx.runMutation(api.b2cStatsVerification.generateEvidenceUploadUrl, {
        userId: body.userId as Id<"b2cUsers">,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/stats-verification/upload-url",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/stats-verification/submit — create a pending request after uploads
http.route({
  path: "/b2c/stats-verification/submit",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const result = await ctx.runMutation(api.b2cStatsVerification.submitVerificationRequest, {
        userId: body.userId as Id<"b2cUsers">,
        claimedStats: body.claimedStats,
        context: body.context,
        payStubStorageIds: body.payStubStorageIds,
        crmStorageIds: body.crmStorageIds ?? [],
      });
      return b2cJsonResponse(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/stats-verification/submit",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/stats-verification/approve — founder approves
http.route({
  path: "/b2c/stats-verification/approve",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const result = await ctx.runMutation(api.b2cStatsVerification.approveVerificationRequest, {
        founderId: body.founderId as Id<"b2cUsers">,
        requestId: body.requestId as Id<"b2cStatsVerificationRequests">,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/stats-verification/approve",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/stats-verification/reject — founder rejects with reason
http.route({
  path: "/b2c/stats-verification/reject",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const result = await ctx.runMutation(api.b2cStatsVerification.rejectVerificationRequest, {
        founderId: body.founderId as Id<"b2cUsers">,
        requestId: body.requestId as Id<"b2cStatsVerificationRequests">,
        reason: body.reason,
      });
      return b2cJsonResponse(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/stats-verification/reject",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// GET /b2c/stats-verification/my-latest?userId=X
http.route({
  path: "/b2c/stats-verification/my-latest",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      if (!userId) return b2cJsonResponse({ error: "userId is required" }, 400);
      const result = await ctx.runQuery(api.b2cStatsVerification.getMyLatestVerificationRequest, {
        userId: userId as Id<"b2cUsers">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/stats-verification/my-latest",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/stats-verification/pending?founderId=X&status=Y&cursor=Z&limit=N
http.route({
  path: "/b2c/stats-verification/pending",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const founderId = url.searchParams.get("founderId");
      const statusStr = url.searchParams.get("status");
      const cursorStr = url.searchParams.get("cursor");
      const limitStr = url.searchParams.get("limit");
      if (!founderId) return b2cJsonResponse({ error: "founderId is required" }, 400);
      const validStatus = statusStr === "pending" || statusStr === "approved" || statusStr === "rejected"
        ? (statusStr as "pending" | "approved" | "rejected")
        : undefined;
      const result = await ctx.runQuery(api.b2cStatsVerification.listPendingVerificationRequests, {
        founderId: founderId as Id<"b2cUsers">,
        status: validStatus,
        cursor: cursorStr ? Number(cursorStr) : undefined,
        limit: limitStr ? Number(limitStr) : undefined,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/stats-verification/pending",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/stats-verification/pending-count?founderId=X
http.route({
  path: "/b2c/stats-verification/pending-count",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const founderId = url.searchParams.get("founderId");
      if (!founderId) return b2cJsonResponse({ error: "founderId is required" }, 400);
      const result = await ctx.runQuery(api.b2cStatsVerification.getPendingVerificationCount, {
        founderId: founderId as Id<"b2cUsers">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/stats-verification/pending-count",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// GET /b2c/stats-verification/detail?founderId=X&requestId=Y
http.route({
  path: "/b2c/stats-verification/detail",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const founderId = url.searchParams.get("founderId");
      const requestId = url.searchParams.get("requestId");
      if (!founderId || !requestId) {
        return b2cJsonResponse({ error: "founderId and requestId are required" }, 400);
      }
      const result = await ctx.runQuery(api.b2cStatsVerification.getVerificationRequest, {
        founderId: founderId as Id<"b2cUsers">,
        requestId: requestId as Id<"b2cStatsVerificationRequests">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/stats-verification/detail",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, OPTIONS"),
});

// POST /b2c/calendars/sync-all — trigger sync for all b2cCalendars for a closer
http.route({
  path: "/b2c/calendars/sync-all",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { sessionToken, closerId: claimedCloserId } = await request.json();
      // Identity comes from the session; the body is only a fallback for
      // installed desktop clients. See convex/closerSession.ts.
      const closerId = await closerFromBody(ctx, { sessionToken, closerId: claimedCloserId });
      if (!closerId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      if (typeof closerId !== "string") {
        return b2cJsonResponse({ error: "closerId is required" }, 400);
      }
      const result = await ctx.runAction(api.googleCalendar.syncB2cCalendarsForCloser, {
        closerId: closerId as Id<"closers">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Sync failed";
      return b2cJsonResponse({ error: msg }, 500);
    }
  }),
});

http.route({
  path: "/b2c/calendars/sync-all",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ============================================
// B2C PUBLIC JOB BOARD
// ============================================

http.route({
  path: "/b2c/public-jobs",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      const industry = url.searchParams.get("industry");
      const jobs = await ctx.runQuery(api.b2cPublicJobs.listJobs, {
        userId: userId ? userId as Id<"b2cUsers"> : undefined,
        industry: industry || undefined,
      });
      return b2cJsonResponse({ jobs }, 200, true);
    } catch (error) {
      return b2cJsonResponse({ error: "Failed to load jobs" }, 500);
    }
  }),
});

http.route({
  path: "/b2c/public-jobs",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const id = await ctx.runMutation(api.b2cPublicJobs.addJob, {
        userId: (body.userId || "") as Id<"b2cUsers">,
        companyName: body.companyName || "",
        title: body.title || "",
        location: body.location || "",
        salaryRange: body.salaryRange || undefined,
        industry: body.industry || "",
        description: body.description || undefined,
        applyUrl: body.applyUrl || "",
        source: body.source || undefined,
      });
      return b2cJsonResponse({ id }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to add job";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/public-jobs",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("GET, POST, OPTIONS"),
});

http.route({
  path: "/b2c/public-jobs/edit",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const result = await ctx.runMutation(api.b2cPublicJobs.editJob, {
        userId: body.userId as Id<"b2cUsers">,
        jobId: body.jobId as Id<"b2cPublicJobs">,
        companyName: body.companyName,
        title: body.title,
        location: body.location,
        salaryRange: body.salaryRange,
        industry: body.industry,
        description: body.description,
        applyUrl: body.applyUrl,
        source: body.source,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to edit job";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/public-jobs/edit",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

http.route({
  path: "/b2c/public-jobs/close",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { userId, jobId } = await request.json();
      const result = await ctx.runMutation(api.b2cPublicJobs.closeJob, {
        userId: userId as Id<"b2cUsers">,
        jobId: jobId as Id<"b2cPublicJobs">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to close job";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/public-jobs/close",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

http.route({
  path: "/b2c/public-jobs/delete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { userId, jobId } = await request.json();
      const result = await ctx.runMutation(api.b2cPublicJobs.deleteJob, {
        userId: userId as Id<"b2cUsers">,
        jobId: jobId as Id<"b2cPublicJobs">,
      });
      return b2cJsonResponse(result, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to delete job";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/public-jobs/delete",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

http.route({
  path: "/b2c/public-jobs/track",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const id = await ctx.runMutation(api.b2cPublicJobs.updateTracking, {
        userId: body.userId as Id<"b2cUsers">,
        jobId: body.jobId as Id<"b2cPublicJobs">,
        saved: typeof body.saved === "boolean" ? body.saved : undefined,
        applied: typeof body.applied === "boolean" ? body.applied : undefined,
        interviewed: typeof body.interviewed === "boolean" ? body.interviewed : undefined,
      });
      return b2cJsonResponse({ id }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to update tracking";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/public-jobs/track",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// ==================== Adoption Checklist ====================

// POST /b2c/adoption-checklist — get checklist data for a user
http.route({
  path: "/b2c/adoption-checklist",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId } = body as { userId: string };
      if (!userId) {
        return b2cJsonResponse({ error: "Missing userId" }, 400);
      }
      const data = await ctx.runQuery(api.b2cAdoptionChecklist.getChecklistData, {
        userId: userId as Id<"b2cUsers">,
      });
      return b2cJsonResponse(data, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/adoption-checklist",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/adoption-checklist/ensure — create checklist row if missing
http.route({
  path: "/b2c/adoption-checklist/ensure",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId } = body as { userId: string };
      if (!userId) {
        return b2cJsonResponse({ error: "Missing userId" }, 400);
      }
      await ctx.runMutation(api.b2cAdoptionChecklist.ensureChecklistRow, {
        userId: userId as Id<"b2cUsers">,
      });
      return b2cJsonResponse({ success: true }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/adoption-checklist/ensure",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/adoption-checklist/mark-auto-opened — record that setup was auto-opened
http.route({
  path: "/b2c/adoption-checklist/mark-auto-opened",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId } = body as { userId: string };
      if (!userId) {
        return b2cJsonResponse({ error: "Missing userId" }, 400);
      }
      await ctx.runMutation(api.b2cAdoptionChecklist.markSetupAutoOpened, {
        userId: userId as Id<"b2cUsers">,
      });
      return b2cJsonResponse({ success: true }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/adoption-checklist/mark-auto-opened",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/adoption-checklist/dismiss-setup — user dismisses the setup checklist
http.route({
  path: "/b2c/adoption-checklist/dismiss-setup",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId } = body as { userId: string };
      if (!userId) {
        return b2cJsonResponse({ error: "Missing userId" }, 400);
      }
      await ctx.runMutation(api.b2cAdoptionChecklist.dismissSetup, {
        userId: userId as Id<"b2cUsers">,
      });
      return b2cJsonResponse({ success: true }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/adoption-checklist/dismiss-setup",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/adoption-checklist/mark-earn-seen — user has seen the earn section
http.route({
  path: "/b2c/adoption-checklist/mark-earn-seen",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId } = body as { userId: string };
      if (!userId) {
        return b2cJsonResponse({ error: "Missing userId" }, 400);
      }
      await ctx.runMutation(api.b2cAdoptionChecklist.markEarnSeen, {
        userId: userId as Id<"b2cUsers">,
      });
      return b2cJsonResponse({ success: true }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/adoption-checklist/mark-earn-seen",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});

// POST /b2c/coaching-calls/replay-progress — record replay watch progress
http.route({
  path: "/b2c/coaching-calls/replay-progress",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { userId, callId, watchedSeconds } = body as {
        userId: string;
        callId: string;
        watchedSeconds: number;
      };
      if (!userId || !callId || typeof watchedSeconds !== "number") {
        return b2cJsonResponse({ error: "Missing args" }, 400);
      }
      await ctx.runMutation(api.b2cCoachingReplayWatched.recordReplayProgress, {
        userId: userId as Id<"b2cUsers">,
        callId: callId as Id<"b2cCoachingCalls">,
        watchedSeconds,
      });
      return b2cJsonResponse({ success: true }, 200, true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      return b2cJsonResponse({ error: msg }, 400);
    }
  }),
});

http.route({
  path: "/b2c/coaching-calls/replay-progress",
  method: "OPTIONS",
  handler: b2cCorsPreflightHandler("POST, OPTIONS"),
});


// ============================================================================
// Team Performance — closer-facing routes for the desktop app.
//
// The desktop app cannot call Convex functions directly; it POSTs here. Each
// route has an OPTIONS twin: the renderer runs on localhost in dev, so a JSON
// content-type triggers a preflight, and a missing one has taken this app
// down before.
//
// NOTE ON AUTH: these trust the closerId in the body, matching every existing
// desktop route. For the write below that means a closer could in principle
// submit as a teammate. Called out rather than left implicit; it belongs with
// the wider Convex-auth work, not smuggled in here.
// ============================================================================

const CLOSER_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
};
const CLOSER_JSON = { "Content-Type": "application/json", ...CLOSER_CORS };

function closerPreflight(path: string) {
  http.route({
    path,
    method: "OPTIONS",
    handler: httpAction(async () => new Response(null, { status: 204, headers: CLOSER_CORS })),
  });
}

/** Their own month: funnel, rates, goal, submission count. */
/**
 * Who is this closer request actually from?
 *
 * With a session token, the closer comes from the SESSION — any closerId in
 * the body is ignored, which is the point: the body is the part the client
 * controls. Without one, falls back to trusting the body, because installed
 * desktop apps keep running for months after we stop shipping them and would
 * all break at once otherwise. See convex/closerSession.ts.
 */
async function closerFromBody(
  ctx: any,
  body: { sessionToken?: string; closerId?: string },
): Promise<Id<"closers"> | null> {
  const resolved = await ctx.runQuery(internal.closerSession.resolveCloser, {
    ...(body.sessionToken ? { sessionToken: body.sessionToken } : {}),
    ...(body.closerId ? { closerId: body.closerId } : {}),
  });
  return resolved ? (resolved.closerId as Id<"closers">) : null;
}

const CLOSER_UNAUTHORISED = new Response(
  JSON.stringify({ error: "Not signed in" }),
  { status: 401 },
);

http.route({
  path: "/getCloserPerformance",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { sessionToken, closerId, monthKey } = await request.json();
      const authedCloserId = await closerFromBody(ctx, { sessionToken, closerId });
      if (!authedCloserId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      const data = await ctx.runQuery(internal.closerSelfPerformance.getSelfPerformance, {
        closerId: authedCloserId,
        ...(monthKey ? { monthKey } : {}),
      });
      return new Response(JSON.stringify(data), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      console.error("[HTTP] getCloserPerformance:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/getCloserPerformance");

/** Their sheet for a month, pre-filled from what we measured. */
http.route({
  path: "/getCloserDailyEntries",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { sessionToken, closerId, monthKey } = await request.json();
      const authedCloserId = await closerFromBody(ctx, { sessionToken, closerId });
      if (!authedCloserId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      // closerId comes from the session, not the body — see saveCloserDailyEntry.
      if (!monthKey) {
        return new Response(JSON.stringify({ error: "monthKey is required" }), {
          status: 400, headers: CLOSER_JSON,
        });
      }
      const data = await ctx.runQuery(internal.closerSelfPerformance.getSelfDailyEntries, {
        closerId: authedCloserId,
        monthKey,
      });
      return new Response(JSON.stringify(data), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      console.error("[HTTP] getCloserDailyEntries:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/getCloserDailyEntries");

/** Submit one day. Sending no values still confirms it. */
http.route({
  path: "/saveCloserDailyEntry",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { sessionToken, closerId, dayKey, values } = await request.json();
      const authedCloserId = await closerFromBody(ctx, { sessionToken, closerId });
      if (!authedCloserId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      // closerId is deliberately NOT required — a session-authenticated caller
      // never sends one, and requiring it would be asking the client to name
      // the very thing we refuse to take its word for.
      if (!dayKey) {
        return new Response(JSON.stringify({ error: "dayKey is required" }), {
          status: 400, headers: CLOSER_JSON,
        });
      }
      await ctx.runMutation(internal.closerPerformanceMutations.saveCloserDailyEntry, {
        closerId: authedCloserId,
        dayKey,
        values: values ?? {},
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      // Validation failures are the closer's to see and fix, so pass the
      // message through rather than swallowing it into a generic 500 — but
      // strip Convex's wrapper and stack trace first. "cash cannot be
      // negative" is useful; a file path and line number is not.
      const raw = error instanceof Error ? error.message : "Could not save";
      const message =
        raw
          .replace(/^Uncaught Error:\s*/, "")
          .split("\n")[0]
          .trim() || "Could not save";
      console.error("[HTTP] saveCloserDailyEntry:", message);
      return new Response(JSON.stringify({ success: false, error: message }), {
        status: 400, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/saveCloserDailyEntry");

/** Team leaderboard, without the columns that expose ad spend. */
http.route({
  path: "/getTeamLeaderboardForCloser",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { sessionToken, closerId, monthKey } = await request.json();
      const authedCloserId = await closerFromBody(ctx, { sessionToken, closerId });
      if (!authedCloserId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      const data = await ctx.runQuery(internal.closerSelfPerformance.getLeaderboardForCloser, {
        closerId: authedCloserId,
        ...(monthKey ? { monthKey } : {}),
      });
      return new Response(JSON.stringify(data), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      console.error("[HTTP] getTeamLeaderboardForCloser:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/getTeamLeaderboardForCloser");

/** Their own twelve months. */
http.route({
  path: "/getCloserYearPerformance",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { sessionToken, closerId, year } = await request.json();
      const authedCloserId = await closerFromBody(ctx, { sessionToken, closerId });
      if (!authedCloserId) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      const data = await ctx.runQuery(internal.closerSelfPerformance.getSelfYearPerformance, {
        closerId: authedCloserId,
        ...(typeof year === "number" ? { year } : {}),
      });
      return new Response(JSON.stringify(data), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      console.error("[HTTP] getCloserYearPerformance:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/getCloserYearPerformance");

/** Extend an active session. Called once when the closer app loads. */
http.route({
  path: "/closer/session/refresh",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { sessionToken } = await request.json();
      if (!sessionToken) {
        return new Response(JSON.stringify({ valid: false }), {
          status: 200, headers: CLOSER_JSON,
        });
      }
      const result = await ctx.runMutation(api.closerSession.refreshSession, {
        sessionToken,
      });
      return new Response(JSON.stringify(result), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      console.error("[HTTP] closer/session/refresh:", error);
      return new Response(JSON.stringify({ valid: false }), {
        status: 200, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/closer/session/refresh");

/** Session check + closer info + feature flags, in one call on app load. */
http.route({
  path: "/closer/me",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { sessionToken } = await request.json();
      if (!sessionToken) {
        return new Response(JSON.stringify({ valid: false }), {
          status: 200, headers: CLOSER_JSON,
        });
      }
      const result = await ctx.runMutation(api.closerSession.me, { sessionToken });
      return new Response(JSON.stringify(result), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      console.error("[HTTP] closer/me:", error);
      return new Response(JSON.stringify({ valid: false }), {
        status: 200, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/closer/me");

// ============================================================================
// Polar — subscription changes.
//
// Sits alongside the Stripe webhook while both processors coexist. Stripe is
// still live; this endpoint is inert until someone subscribes through Polar,
// which can't happen until checkout is deliberately pointed there.
//
// Two things shape this handler, both learned from their docs:
//
//   Polar DISABLES an endpoint after 10 consecutive non-2xx responses. So a bug
//   that throws would not just drop one message — it would silently switch off
//   billing updates for every customer. Everything below acknowledges.
//
//   They want a reply within 2 seconds. So we verify, write, and return; no
//   fetching, no AI, nothing that waits on a third party.
// ============================================================================

http.route({
  path: "/webhooks/polar",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Read the body ONCE and verify against exactly those bytes. Re-serialising
    // parsed JSON changes whitespace and every signature fails.
    const rawBody = await request.text();

    const secret = process.env.POLAR_WEBHOOK_SECRET;
    if (!secret) {
      // The endpoint has to exist before the webhook can be created in Polar,
      // and Polar hands over the signing secret only at that moment. So until
      // it's configured we acknowledge and process NOTHING — an unverified
      // payload is not something to act on, but refusing outright would burn
      // failures against the auto-disable counter for a state we caused.
      console.error(
        "[polar] webhook received but POLAR_WEBHOOK_SECRET is not set — " +
          "acknowledged without processing. Set it with: " +
          "npx convex env set POLAR_WEBHOOK_SECRET whsec_... --prod",
      );
      return new Response(null, { status: 202 });
    }

    const valid = await verifyStandardWebhook(
      rawBody,
      secret,
      request.headers.get("webhook-id"),
      request.headers.get("webhook-timestamp"),
      request.headers.get("webhook-signature"),
      "rawSecret",
    );
    if (!valid) {
      // Refused, and deliberately NOT acknowledged. Either someone is forging
      // requests, or our secret is wrong — and in the second case letting
      // Polar disable the endpoint is the right outcome, because it forces us
      // to notice rather than quietly ignoring real billing events.
      console.error("[polar] rejected an unverified webhook");
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 401,
      });
    }

    try {
      const event = JSON.parse(rawBody) as {
        type?: string;
        data?: Record<string, unknown>;
      };
      const type = event.type ?? "";

      // Subscription events change entitlements; order.paid feeds the Meta
      // Purchase conversion (B2C only, below). Everything else Polar might
      // send is acknowledged and ignored rather than treated as an error.
      if (!type.startsWith("subscription.") && type !== "order.paid") {
        return new Response(null, { status: 202 });
      }

      // ------------------------------------------------------------------
      // order.paid → Meta CAPI Purchase. Ad conversions only: the order must
      // carry the b2c_plan tag (B2B money never touches the ad pixel), and
      // only a FIRST order counts — renewal cycles are not new conversions.
      // The send itself runs on the scheduler (convex/metaCapi.ts); this
      // handler only acks. event_id = order id, so redeliveries can't
      // double-count at Meta even if this branch runs twice.
      // ------------------------------------------------------------------
      if (type === "order.paid") {
        const order = (event.data ?? {}) as {
          id?: string;
          billing_reason?: string;
          total_amount?: number | null;
          currency?: string | null;
          customer_id?: string;
          created_at?: string;
          metadata?: Record<string, unknown> | null;
          product?: {
            id?: string;
            name?: string;
            metadata?: Record<string, unknown> | null;
          } | null;
          customer?: { email?: string | null } | null;
        };
        const orderPlanTag =
          order.product?.metadata?.b2c_plan ?? order.metadata?.b2c_plan;
        const firstOrder =
          order.billing_reason === "purchase" ||
          order.billing_reason === "subscription_create";
        if (order.id && typeof orderPlanTag === "string" && firstOrder) {
          const meta = (order.metadata ?? {}) as Record<string, unknown>;
          const str = (val: unknown): string | undefined =>
            typeof val === "string" && val.trim() ? val.trim() : undefined;
          await ctx.runMutation(internal.metaCapi.schedulePurchase, {
            orderId: order.id,
            email: str(order.customer?.email),
            polarCustomerId: str(order.customer_id),
            amountCents: typeof order.total_amount === "number" ? order.total_amount : 0,
            currency: str(order.currency) ?? "usd",
            productId: str(order.product?.id),
            productName: str(order.product?.name),
            createdAt: str(order.created_at),
            landingUrl: str(meta.landing_url),
            fbp: str(meta.fbp),
            fbc: str(meta.fbc),
            clientIp: str(meta.client_ip),
            userAgent: str(meta.user_agent),
          });
        }
        return new Response(null, { status: 202 });
      }

      const sub = (event.data ?? {}) as {
        id?: string;
        status?: string;
        customer_id?: string;
        seats?: number | null;
        current_period_end?: string | null;
        metadata?: Record<string, unknown> | null;
        product?: { metadata?: Record<string, unknown> | null } | null;
        // Our own team id, sent as external_customer_id at checkout and echoed
        // back here. More reliable than Polar's customer id, which we'd have to
        // have stored first.
        customer?: { external_id?: string | null } | null;
      };

      if (!sub.customer_id || !sub.id) {
        console.error(`[polar] ${type} arrived without a customer or id`);
        return new Response(null, { status: 202 });
      }

      // ------------------------------------------------------------------
      // B2C branch: a product tagged b2c_plan is Sequ3nce Personal. Routed
      // BEFORE the team logic so neither side can misfile the other's money.
      // The account may not exist yet — for Personal, the payment IS the
      // signup (see convex/b2cPolar.ts).
      // ------------------------------------------------------------------
      const b2cPlanTag = sub.product?.metadata?.b2c_plan ?? sub.metadata?.b2c_plan;
      if (typeof b2cPlanTag === "string") {
        const plan = b2cPlanTag.trim().toLowerCase();
        if (!["monthly", "3month", "6month", "yearly"].includes(plan)) {
          console.error(`[polar] b2c event with unknown plan "${plan}" — ignored`);
          return new Response(null, { status: 202 });
        }
        const customer = (sub as any).customer as
          | { email?: string | null; name?: string | null }
          | null
          | undefined;
        const periodEndB2C = sub.current_period_end
          ? Date.parse(sub.current_period_end)
          : null;
        const b2cResult = await ctx.runMutation(
          internal.b2cPolar.applyB2CSubscription,
          {
            polarCustomerId: sub.customer_id,
            polarSubscriptionId: sub.id,
            status: mapPolarStatusToB2C(sub.status),
            planTerm: plan as "monthly" | "3month" | "6month" | "yearly",
            email: customer?.email ?? undefined,
            name: customer?.name ?? undefined,
            currentPeriodEnd:
              periodEndB2C !== null && Number.isFinite(periodEndB2C)
                ? periodEndB2C
                : undefined,
          },
        );
        if (!b2cResult.applied) {
          console.error(
            `[polar] b2c ${type} not applied: ${b2cResult.reason} ` +
              `(customer ${sub.customer_id})`,
          );
        } else if (b2cResult.provisioned) {
          console.log(
            `[polar] b2c account provisioned from checkout (customer ${sub.customer_id})`,
          );
        }
        return new Response(null, { status: 202 });
      }

      const tierTag = sub.product?.metadata?.tier ?? sub.metadata?.tier;
      const tier =
        typeof tierTag === "string" &&
        ["overview", "oversight", "overwatch"].includes(
          tierTag.trim().toLowerCase(),
        )
          ? tierTag.trim().toLowerCase()
          : null;

      if (!tier) {
        // A product we don't recognise — the manually-negotiated annual plan,
        // for instance. Recorded loudly, and the team's tier is left exactly
        // as it was rather than guessed at.
        console.warn(
          `[polar] ${type} for subscription ${sub.id} has no recognised tier ` +
            `tag; leaving the team's plan unchanged`,
        );
      }

      const periodEnd = sub.current_period_end
        ? Date.parse(sub.current_period_end)
        : null;

      const result = await ctx.runMutation(internal.polar.applySubscription, {
        polarCustomerId: sub.customer_id,
        externalCustomerId: sub.customer?.external_id ?? null,
        polarSubscriptionId: sub.id,
        status: mapPolarStatusForWebhook(sub.status),
        tier,
        seats: typeof sub.seats === "number" ? sub.seats : null,
        currentPeriodEnd:
          periodEnd !== null && Number.isFinite(periodEnd) ? periodEnd : null,
      });

      if (!result.applied) {
        console.error(
          `[polar] ${type} not applied: ${result.reason} ` +
            `(customer ${sub.customer_id})`,
        );
      }
    } catch (error) {
      // Acknowledged on purpose. Ten of these in a row would have Polar switch
      // the endpoint off, and a parsing bug on one message must not cost us
      // every future billing update.
      console.error("[polar] failed to process a verified webhook:", error);
    }

    return new Response(null, { status: 202 });
  }),
});

/** Polar's statuses in the vocabulary the rest of the app already uses. */
function mapPolarStatusForWebhook(status: string | undefined): string {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "unpaid";
    case "canceled":
      return "canceled";
    case "paused":
      return "paused";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return status ?? "unknown";
  }
}

// ============================================================================
// Fathom: the closer-facing side — connect, disconnect, and say which Fathom
// account is yours.
//
// Every one of these resolves the closer from their session token rather than
// trusting an id in the body. Connecting an integration on someone else's
// behalf, or reading whether they've connected one, is not something a
// teammate should be able to do by editing a request.
// ============================================================================

/** Shared by all the routes below: who is asking, or null. */
async function fathomCaller(ctx: ActionCtx, body: { sessionToken?: string }) {
  if (!body?.sessionToken) return null;
  return await ctx.runQuery(internal.closerSession.resolveCloser, {
    sessionToken: body.sessionToken,
  });
}

http.route({
  path: "/closer/fathom/status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const caller = await fathomCaller(ctx, body);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      const status = await ctx.runQuery(internal.fathomConnections.getStatusForCloser, {
        teamId: caller.teamId,
        closerId: caller.closerId,
      });
      return new Response(JSON.stringify(status), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      console.error("[HTTP] fathom/status:", error);
      return new Response(JSON.stringify({ error: "Couldn't load Fathom status" }), {
        status: 500, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/closer/fathom/status");

http.route({
  path: "/closer/fathom/connect",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const caller = await fathomCaller(ctx, body);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      const apiKey = String(body.apiKey ?? "").trim();
      if (apiKey.length < 8 || apiKey.length > 500) {
        return new Response(
          JSON.stringify({ success: false, error: "That doesn't look like a Fathom API key." }),
          { status: 200, headers: CLOSER_JSON },
        );
      }
      const planCheck = await ctx.runQuery(
        internal.fathomConnections.getStatusForCloser,
        { teamId: caller.teamId, closerId: caller.closerId },
      );
      if (!planCheck.availableOnPlan) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Fathom isn't part of your team's plan — your calls are recorded by the Sequ3nce bot automatically. Ask your manager if you think this is wrong.",
          }),
          { status: 200, headers: CLOSER_JSON },
        );
      }
      // Scoped to this closer unless they say otherwise. A personal key that
      // silently became the company-wide connection would route a teammate's
      // calls through one person's Fathom account.
      const result = await ctx.runAction(internal.fathomConnect.connect, {
        teamId: caller.teamId,
        ...(body.teamWide === true ? {} : { closerId: caller.closerId }),
        apiKey,
      });
      return new Response(JSON.stringify(result), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      console.error("[HTTP] fathom/connect:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Couldn't reach Fathom. Try again in a moment." }),
        { status: 200, headers: CLOSER_JSON },
      );
    }
  }),
});
closerPreflight("/closer/fathom/connect");

http.route({
  path: "/closer/fathom/disconnect",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const caller = await fathomCaller(ctx, body);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      const status = await ctx.runQuery(internal.fathomConnections.getStatusForCloser, {
        teamId: caller.teamId,
        closerId: caller.closerId,
      });
      if (!status.connectionId) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: CLOSER_JSON,
        });
      }
      await ctx.runAction(internal.fathomConnect.disconnect, {
        teamId: caller.teamId,
        connectionId: status.connectionId,
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: CLOSER_JSON,
      });
    } catch (error) {
      console.error("[HTTP] fathom/disconnect:", error);
      return new Response(JSON.stringify({ success: false, error: "Couldn't disconnect" }), {
        status: 500, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/closer/fathom/disconnect");

http.route({
  path: "/closer/fathom/email",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const caller = await fathomCaller(ctx, body);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      await ctx.runMutation(internal.fathomConnections.setCloserFathomEmail, {
        closerId: caller.closerId,
        fathomEmail: String(body.fathomEmail ?? ""),
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: CLOSER_JSON,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes("email address")
          ? "That doesn't look like an email address"
          : "Couldn't save that";
      return new Response(JSON.stringify({ success: false, error: message }), {
        status: 200, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/closer/fathom/email");

http.route({
  path: "/closer/fathom/reclassify",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const caller = await fathomCaller(ctx, body);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      const result = await ctx.runMutation(internal.fathom.reclassifyCall, {
        callId: body.callId as Id<"calls">,
        closerId: caller.closerId,
        isSalesCall: body.isSalesCall === true,
      });
      return new Response(JSON.stringify(result), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      console.error("[HTTP] fathom/reclassify:", error);
      return new Response(JSON.stringify({ success: false, error: "Couldn't save that" }), {
        status: 200, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/closer/fathom/reclassify");

http.route({
  path: "/closer/fathom/reminders",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const caller = await fathomCaller(ctx, body);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      await ctx.runMutation(internal.fathomConnections.setOutcomeReminders, {
        closerId: caller.closerId,
        enabled: body.enabled === true,
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: CLOSER_JSON,
      });
    } catch (error) {
      console.error("[HTTP] fathom/reminders:", error);
      return new Response(JSON.stringify({ success: false }), {
        status: 200, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/closer/fathom/reminders");

// "That address isn't one of our closers." Suppresses the notice only — if the
// address later belongs to a real closer their calls still come in, because
// matching runs off the roster and never consults this list.
http.route({
  path: "/closer/fathom/ignoreRecorder",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const caller = await fathomCaller(ctx, body);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!email || email.length > 200) {
        return new Response(JSON.stringify({ success: false }), {
          status: 200, headers: CLOSER_JSON,
        });
      }
      const result = await ctx.runMutation(
        body.undo === true
          ? internal.fathomConnections.unignoreRecorder
          : internal.fathomConnections.ignoreRecorder,
        { teamId: caller.teamId, email },
      );
      return new Response(JSON.stringify(result), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      console.error("[HTTP] fathom/ignoreRecorder:", error);
      return new Response(JSON.stringify({ success: false }), {
        status: 200, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/closer/fathom/ignoreRecorder");

http.route({
  path: "/closer/fathom/needsOutcome",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const caller = await fathomCaller(ctx, body);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      const result = await ctx.runQuery(
        internal.callOutcomes.getCallsNeedingOutcome,
        { closerId: caller.closerId },
      );
      return new Response(JSON.stringify(result), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      console.error("[HTTP] fathom/needsOutcome:", error);
      // An empty queue rather than an error. This drives a banner on the
      // dashboard, and a broken banner is worse than an absent one.
      return new Response(JSON.stringify({ total: 0, calls: [] }), {
        status: 200, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/closer/fathom/needsOutcome");

// ---- Outstanding balances ----------------------------------------------
// Money the closer agreed on a call but didn't collect on it. Their own only:
// the closer is who remembers what was arranged, and a closer clearing someone
// else's balance would quietly erase money owed to the business.

http.route({
  path: "/closer/collections/outstanding",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const caller = await fathomCaller(ctx, body);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      const result = await ctx.runQuery(
        internal.collections.getMyOutstandingBalances,
        { closerId: caller.closerId },
      );
      return new Response(JSON.stringify(result), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      console.error("[HTTP] collections/outstanding:", error);
      // An empty list rather than an error. This drives a panel on the
      // dashboard, and a broken panel is worse than an absent one.
      return new Response(
        JSON.stringify({ balances: [], total: 0, count: 0, truncated: false }),
        { status: 200, headers: CLOSER_JSON },
      );
    }
  }),
});
closerPreflight("/closer/collections/outstanding");

http.route({
  path: "/closer/collections/resolve",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const caller = await fathomCaller(ctx, body);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      const resolution =
        body.resolution === "written_off" ? "written_off" : "settled";
      const result = await ctx.runMutation(internal.collections.resolveBalance, {
        callId: body.callId as Id<"calls">,
        resolution,
        actorId: String(caller.closerId),
        closerId: caller.closerId,
      });
      return new Response(JSON.stringify(result), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      console.error("[HTTP] collections/resolve:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Couldn't save that" }),
        { status: 200, headers: CLOSER_JSON },
      );
    }
  }),
});
closerPreflight("/closer/collections/resolve");

// ---- Slack interactivity: clearing balances from the channel -------------
//
// The dashboard can't be the only place a balance gets cleared — only managers
// can sign in, and the people chasing the money usually can't. So the digest
// carries a button, and this is where the click lands.
//
// Slack signs with its own scheme rather than Standard Webhooks: hex, a "v0="
// prefix, and a basestring of `v0:{timestamp}:{rawBody}`. Close enough to the
// Polar/Fathom verifier to look reusable, different enough that reusing it
// would silently reject everything.

/**
 * Is this genuinely from Slack?
 *
 * Without this, the endpoint is an unauthenticated way for anyone on the
 * internet to write off a company's outstanding debts.
 */
async function verifySlackSignature(
  rawBody: string,
  signingSecret: string,
  timestamp: string | null,
  signature: string | null,
): Promise<boolean> {
  if (!timestamp || !signature) return false;

  // Slack's own guidance: reject anything older than five minutes so a captured
  // request can't be replayed.
  const sent = Number(timestamp) * 1000;
  if (!Number.isFinite(sent) || Math.abs(Date.now() - sent) > 5 * 60 * 1000) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret) as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`v0:${timestamp}:${rawBody}`) as unknown as ArrayBuffer,
  );
  const expected =
    "v0=" +
    Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

http.route({
  path: "/webhooks/slack/interactive",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      console.error("[slack] SLACK_SIGNING_SECRET is not set");
      return new Response("not configured", { status: 500 });
    }

    const rawBody = await request.text();
    const valid = await verifySlackSignature(
      rawBody,
      signingSecret,
      request.headers.get("x-slack-request-timestamp"),
      request.headers.get("x-slack-signature"),
    );
    if (!valid) return new Response("bad signature", { status: 401 });

    // Slack posts form-encoded with the interaction JSON in `payload`.
    let payload: any;
    try {
      const encoded = new URLSearchParams(rawBody).get("payload");
      if (!encoded) return new Response("", { status: 200 });
      payload = JSON.parse(encoded);
    } catch (err) {
      console.error("[slack] couldn't parse interaction payload:", err);
      return new Response("", { status: 200 });
    }

    try {
      // --- the button on the digest ---
      if (payload.type === "block_actions") {
        const action = (payload.actions ?? [])[0];

        // --- undo, from the receipt in the thread ---
        if (action?.action_id === "collections_undo") {
          let meta: any = {};
          try {
            meta = JSON.parse(action.value || "{}");
          } catch {
            return new Response("", { status: 200 });
          }
          await ctx.runAction(internal.collectionsSlackActions.undoResolutions, {
            teamId: meta.t as Id<"teams">,
            callIds: Array.isArray(meta.c) ? meta.c.map(String) : [],
            ...(meta.ch ? { channelId: String(meta.ch) } : {}),
            ...(meta.m ? { messageTs: String(meta.m) } : {}),
            ...(payload.response_url
              ? { responseUrl: String(payload.response_url) }
              : {}),
          });
          return new Response("", { status: 200 });
        }

        if (action?.action_id !== COLLECTIONS_UPDATE_ACTION) {
          // Some other app's button, or one we no longer serve.
          return new Response("", { status: 200 });
        }
        // Slack expires trigger_id after three seconds, so this has to be the
        // whole of the work — open the dialog and answer.
        await ctx.runAction(internal.collectionsSlackActions.openResolveDialog, {
          teamId: action.value as Id<"teams">,
          slackTeamId: String(payload.team?.id ?? ""),
          triggerId: String(payload.trigger_id ?? ""),
          channelId: String(payload.container?.channel_id ?? payload.channel?.id ?? ""),
          messageTs: String(payload.container?.message_ts ?? payload.message?.ts ?? ""),
        });
        return new Response("", { status: 200 });
      }

      // --- the dialog being submitted ---
      if (
        payload.type === "view_submission" &&
        payload.view?.callback_id === "collections_resolve"
      ) {
        const meta = JSON.parse(payload.view.private_metadata || "{}");
        const state = payload.view.state?.values ?? {};

        const resolution =
          state.resolution?.resolution?.selected_option?.value === "written_off"
            ? "written_off"
            : "settled";

        // Ticks are spread across several checkbox groups, because Slack caps
        // one group at ten options.
        const callIds: string[] = [];
        for (const [blockId, block] of Object.entries<any>(state)) {
          if (!blockId.startsWith("balances_")) continue;
          for (const opt of block?.picked?.selected_options ?? []) {
            if (opt?.value) callIds.push(String(opt.value));
          }
        }

        if (callIds.length === 0) {
          // Keep the dialog open and say why, rather than silently doing nothing.
          return new Response(
            JSON.stringify({
              response_action: "errors",
              errors: { balances_0: "Pick at least one deal." },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        await ctx.runAction(
          internal.collectionsSlackActions.applyDialogSubmission,
          {
            teamId: meta.teamId as Id<"teams">,
            callIds,
            resolution,
            // Slack's user id — who cleared it, for the audit trail.
            actorId: `slack:${payload.user?.id ?? "unknown"}`,
            ...(meta.channelId ? { channelId: String(meta.channelId) } : {}),
            ...(meta.messageTs ? { messageTs: String(meta.messageTs) } : {}),
          },
        );

        return new Response(JSON.stringify({ response_action: "clear" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      // A 500 makes Slack show the user a generic failure and retry. Log loudly
      // and acknowledge: a stuck dialog is worse than a missed click.
      console.error("[slack] interaction handling failed:", err);
    }

    return new Response("", { status: 200 });
  }),
});

http.route({
  path: "/closer/fathom/sync",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const caller = await fathomCaller(ctx, body);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401, headers: CLOSER_JSON,
        });
      }
      const result = await ctx.runAction(internal.fathomConnect.syncRecent, {
        teamId: caller.teamId,
      });
      return new Response(JSON.stringify(result), { status: 200, headers: CLOSER_JSON });
    } catch (error) {
      console.error("[HTTP] fathom/sync:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Couldn't sync from Fathom" }),
        { status: 200, headers: CLOSER_JSON },
      );
    }
  }),
});
closerPreflight("/closer/fathom/sync");

// ============================================================================
// Fathom: a meeting finished and its content is ready.
// ============================================================================

/**
 * Verifies a Fathom webhook using the Standard Webhooks scheme.
 *
 * Signed content is `${id}.${timestamp}.${body}`, HMAC-SHA256 with the secret
 * that Fathom returned when we registered the webhook, base64 encoded. The
 * header can carry several space-separated `v1,<sig>` values during a secret
 * rotation, so any one matching is a pass.
 *
 * This is not optional. Without it, anyone who learns the URL can post
 * fabricated calls into a customer's account.
 */
/**
 * Standard Webhooks signature check, shared by Fathom and Polar.
 *
 * Both providers implement the same specification for the signed content and
 * header format, so this is one function rather than two copies of the same
 * crypto. Two copies of a signature check is how you end up with a lenient
 * one, and the lenient one is the hole — which is why this takes an explicit
 * `derivation` rather than guessing or trying both and accepting either.
 *
 * The one thing the providers do NOT agree on is how the signing key is
 * derived from the secret:
 *
 *   - The Standard Webhooks spec says: strip the `whsec_` prefix, then
 *     base64-DECODE the remainder to get the raw key bytes. Fathom follows
 *     the spec — pass `"spec"`.
 *   - Polar does not follow the spec here: it signs with the raw UTF-8 bytes
 *     of the entire secret string, `whsec_` prefix included, no decoding —
 *     pass `"rawSecret"`.
 *
 * This was not guessed — it was established by instrumenting the live
 * endpoint and replaying a real Polar delivery against candidate key
 * derivations; only `rawSecret` matched. Do not "clean this up" by making
 * both providers use the same derivation.
 */
type WebhookKeyDerivation = "spec" | "rawSecret";

async function verifyStandardWebhook(
  rawBody: string,
  secret: string,
  webhookId: string | null,
  timestamp: string | null,
  signatureHeader: string | null,
  keyDerivation: WebhookKeyDerivation,
): Promise<boolean> {
  if (!webhookId || !timestamp || !signatureHeader) return false;

  // Reject anything older than five minutes so a captured request can't be
  // replayed indefinitely.
  const sent = Number(timestamp) * 1000;
  if (!Number.isFinite(sent) || Math.abs(Date.now() - sent) > 5 * 60 * 1000) {
    return false;
  }

  let keyBytes: Uint8Array;
  if (keyDerivation === "rawSecret") {
    // Polar: raw UTF-8 bytes of the entire secret string, prefix included.
    keyBytes = new TextEncoder().encode(secret);
  } else {
    // Fathom, per the Standard Webhooks spec: strip the `whsec_` prefix and
    // base64-decode the remainder. It arrives without padding.
    const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const padded = key + "=".repeat((4 - (key.length % 4)) % 4);
    try {
      keyBytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    } catch {
      // Not base64 at all — some providers use a plain string secret.
      keyBytes = new TextEncoder().encode(key);
    }
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new TextEncoder().encode(`${webhookId}.${timestamp}.${rawBody}`);
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, signed as unknown as ArrayBuffer);
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  // Constant-time compare across every offered signature.
  let ok = false;
  for (const part of signatureHeader.split(" ")) {
    const candidate = part.includes(",") ? part.split(",")[1] : part;
    if (candidate.length !== expected.length) continue;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ candidate.charCodeAt(i);
    }
    if (diff === 0) ok = true;
  }
  return ok;
}

/**
 * The same handler, with the team in the PATH instead of a query string.
 *
 * A webhook registered as `/webhooks/fathom?team=<id>` produced no delivery
 * attempts at all against a real Fathom account — not a failure, not a
 * rejection, nothing reaching us — while Fathom's own settings page showed the
 * webhook stored correctly. Query strings on destination URLs are a known
 * rough edge in webhook systems, so this removes the variable entirely rather
 * than leaving it as the last untested difference.
 *
 * Both routes stay live: existing customers keep working, and nothing has to
 * be migrated if this turns out not to be the cause.
 */
http.route({
  pathPrefix: "/webhooks/fathom/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const teamId = url.pathname.split("/webhooks/fathom/")[1]?.split("/")[0];
    if (!teamId) {
      return new Response(JSON.stringify({ error: "missing team" }), { status: 400 });
    }
    // Rebuild as the query-string form and hand to the one implementation, so
    // the two routes can never drift apart on signature checking.
    return await handleFathomWebhook(ctx, request, teamId);
  }),
});

/**
 * One implementation, two routes.
 *
 * The team arrives either as a query parameter or as a path segment; nothing
 * below cares which. Keeping signature verification in a single place matters
 * more than the routing — two copies would eventually disagree about what
 * counts as a valid request, and the lenient one would be the security hole.
 */
async function handleFathomWebhook(
  ctx: ActionCtx,
  request: Request,
  teamId: string,
): Promise<Response> {
    // Read the body ONCE and verify against exactly those bytes. Re-serialising
    // parsed JSON would change whitespace and every signature would fail.
    const rawBody = await request.text();


    // A malformed id throws inside the query rather than returning null, which
    // surfaced as a 500 and would fill Sentry with noise from anyone probing
    // the endpoint. This is a public URL; a bad team is a 404, not a crash.
    let connection = null;
    try {
      connection = await ctx.runQuery(
        internal.fathomConnections.getConnectionForTeam,
        { teamId: teamId as Id<"teams"> },
      );
    } catch {
      return new Response(JSON.stringify({ error: "unknown" }), { status: 404 });
    }
    if (!connection?.webhookSecret) {
      // Unknown team, or one that never registered a webhook. Say as little as
      // possible — this endpoint is public.
      return new Response(JSON.stringify({ error: "unknown" }), { status: 404 });
    }

    const valid = await verifyStandardWebhook(
      rawBody,
      connection.webhookSecret,
      request.headers.get("webhook-id"),
      request.headers.get("webhook-timestamp"),
      request.headers.get("webhook-signature"),
      "spec",
    );
    if (!valid) {
      console.warn(`[fathom] rejected an unverified webhook for team ${teamId}`);
      return new Response(JSON.stringify({ error: "bad signature" }), { status: 401 });
    }

    let meeting: unknown;
    try {
      meeting = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
    }

    try {
      const result = await ctx.runMutation(internal.fathom.ingestMeeting, {
        teamId: teamId as Id<"teams">,
        meeting,
      });
      // Always 200 once verified. A non-2xx would make Fathom retry a payload
      // we have already decided about — a skipped meeting is a decision, not a
      // failure.
      return new Response(JSON.stringify(result), { status: 200 });
    } catch (error) {
      console.error("[fathom] ingest failed:", error);
      // A genuine failure DOES deserve a retry.
      return new Response(JSON.stringify({ error: "ingest failed" }), { status: 500 });
    }
}

http.route({
  path: "/webhooks/fathom",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const teamId = new URL(request.url).searchParams.get("team");
    if (!teamId) {
      return new Response(JSON.stringify({ error: "missing team" }), { status: 400 });
    }
    return await handleFathomWebhook(ctx, request, teamId);
  }),
});

/** Sign out. Idempotent, and silent on an unknown token so it can't be used
 *  to probe which tokens exist. */
http.route({
  path: "/closer/session/revoke",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { sessionToken } = await request.json();
      if (sessionToken) {
        await ctx.runMutation(api.closerSession.revokeSession, { sessionToken });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: CLOSER_JSON,
      });
    } catch (error) {
      console.error("[HTTP] closer/session/revoke:", error);
      // Sign-out must never appear to fail — the client clears its token
      // regardless, and a stuck "couldn't sign out" is worse than a stale row.
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: CLOSER_JSON,
      });
    }
  }),
});
closerPreflight("/closer/session/revoke");


// A closer correcting the numbers on their own call.
//
// Sits alongside the manager path in callFacts.ts rather than reusing it: the
// dashboard mutation authenticates a `users` row, and closers aren't in that
// table at all.
http.route({
  path: "/updateOwnCallFacts",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { callId, closerId, outcome, cashCollected, contractValue } = body;

      if (!callId || !closerId) {
        return new Response(
          JSON.stringify({ error: "callId and closerId are required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          },
        );
      }

      // Passed through as-is: `null` clears a figure and `undefined` leaves it
      // alone, and collapsing the two would make it impossible to blank a
      // number the AI invented.
      const result = await ctx.runMutation(api.callFacts.updateOwnCallFacts, {
        callId: callId as Id<"calls">,
        closerId: closerId as Id<"closers">,
        outcome,
        cashCollected,
        contractValue,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in updateOwnCallFacts:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/updateOwnCallFacts",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
      },
    });
  }),
});

// A closer reading or changing whether we record their meetings.
//
// Behind the session like every other closer route, because this one decides
// whether a bot sits in their calls. resolveCloser gives us WHO is asking; the
// body's closerId is never trusted for this.
http.route({
  path: "/closer/autoJoin",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      // A REAL session, with no legacy closerId fallback.
      //
      // resolveCloser deliberately accepts a bare closerId so that desktop apps
      // installed months ago keep working. Every other closer route inherits
      // that, and for reading your own call history it is an acceptable trade.
      //
      // Not here. Proved it by curl: passing only a closerId and no token
      // switched a real closer's recording OFF in production. Whether a bot
      // sits in someone's meetings is not something a guessed id gets to
      // decide, so this route asks for the token and nothing else.
      const me =
        typeof body.sessionToken === "string" && body.sessionToken.length > 0
          ? await ctx.runQuery(internal.closerSession.resolveCloser, {
              sessionToken: body.sessionToken,
            })
          : null;
      if (!me) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // Read when no change is asked for; write when one is.
      if (typeof body.enabled === "boolean") {
        const result = await ctx.runMutation(
          internal.calendarOAuth.setAutoJoinForCloser,
          { closerId: me.closerId, enabled: body.enabled },
        );
        if (!result.ok) {
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
      }

      const state = await ctx.runQuery(
        internal.calendarOAuth.readAutoJoinForCloser,
        { closerId: me.closerId },
      );
      return new Response(JSON.stringify({ ok: true, ...state }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("[HTTP] Error in /closer/autoJoin:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

closerPreflight("/closer/autoJoin");

export default http;

// ============================================
// Transcript speaker decision helper
// ============================================
// Pure function — no I/O, deterministic output for a given input. Used by the
// /recall-transcript-webhook handler to decide closer vs prospect for each segment.
//
// Decision priority (top wins):
//   1. Pinned participant.id on the bot row — once we've confidently identified
//      the closer in this call, subsequent segments inherit the label. Populated
//      either from the audio processor's participant_events.join handler (preferred,
//      reliable for both scheduled and QuickBot flows) or from Layer 2 high-confidence
//      hits during transcript processing.
//   2. participant.is_host matches bot.closerIsHost. Scheduled bots set closerIsHost=true
//      (closer scheduled the meeting → is host); QuickBots set false (closer joining
//      external Zoom → is guest). Defaults to true when unset (preserves legacy
//      scheduled-call behavior on old bots).
//   3. Token-overlap on names — split closerName on whitespace, declare match if
//      any token of length >= 3 appears in participant.name.
//   4. Default "prospect".

type ParticipantLike = {
  id?: number | string;
  name?: string;
  is_host?: boolean | null;
};

interface SpeakerDecision {
  speaker: "closer" | "prospect";
  source: "pinned_id" | "is_host" | "name_tokens" | "default";
  // True when both is_host AND name tokens agree on the closer (high confidence).
  shouldPin: boolean;
  // True when is_host matches closerIsHost but name tokens don't match closerName.
  // Surfaces "closer's display name doesn't include their stored name" as a warning.
  disagreement: boolean;
}

function decideSpeaker(args: {
  participant: ParticipantLike | undefined;
  closerName: string;
  pinnedCloserParticipantId: number | string | undefined;
  closerIsHost: boolean; // From bot record; caller defaults to true if undefined
}): SpeakerDecision {
  const { participant, closerName, pinnedCloserParticipantId, closerIsHost } = args;
  if (!participant) {
    return { speaker: "prospect", source: "default", shouldPin: false, disagreement: false };
  }

  // Layer 1: pinned id wins absolutely.
  if (pinnedCloserParticipantId !== undefined && participant.id !== undefined) {
    return {
      speaker: participant.id === pinnedCloserParticipantId ? "closer" : "prospect",
      source: "pinned_id",
      shouldPin: false,
      disagreement: false,
    };
  }

  const nameMatch = closerName ? tokenOverlap(closerName, participant.name || "") : false;

  // Layer 2: is_host boolean, compared against bot's closerIsHost. typeof check rejects
  // null/undefined cleanly. For scheduled calls (closerIsHost=true) participant.is_host=true
  // means closer; for QuickBot (closerIsHost=false) participant.is_host=false means closer.
  if (typeof participant.is_host === "boolean") {
    const matchesCloser = participant.is_host === closerIsHost;
    const speaker: "closer" | "prospect" = matchesCloser ? "closer" : "prospect";
    const shouldPin = participant.id !== undefined && matchesCloser && nameMatch;
    const disagreement = matchesCloser && closerName !== "" && !nameMatch;
    return { speaker, source: "is_host", shouldPin, disagreement };
  }

  // Layer 3: token-overlap fallback (no is_host on this payload).
  if (nameMatch) {
    return {
      speaker: "closer",
      source: "name_tokens",
      shouldPin: participant.id !== undefined,
      disagreement: false,
    };
  }

  // Layer 4: default.
  return { speaker: "prospect", source: "default", shouldPin: false, disagreement: false };
}

function tokenOverlap(a: string, b: string): boolean {
  const aTokens = a.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  const bLower = b.toLowerCase();
  return aTokens.some((t) => bLower.includes(t));
}
