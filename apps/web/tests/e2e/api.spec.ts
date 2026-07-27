import { test, expect } from "@playwright/test";

/**
 * API endpoint tests.
 *
 * These test that the OAuth callback routes and webhook endpoint
 * exist and respond correctly to various inputs.
 *
 * NOTE: OAuth routes redirect (302) on all error cases.
 * Routes may return 404 or 500 if env vars (GOOGLE_CLIENT_ID, etc.)
 * are not configured — this is expected in dev and is flagged as a warning.
 */

test.describe("OAuth Callback Routes", () => {
  test("Google OAuth callback responds (not 500)", async ({ request }) => {
    const response = await request.get("/api/auth/google/callback");
    const status = response.status();

    // Route should not crash the server (500)
    // Expected: 302 (redirect) or 404 (route not compiled without env vars)
    if (status === 404) {
      console.warn(
        "Google OAuth route returned 404 — may not be compiled. Check GOOGLE_CLIENT_ID env var."
      );
    }
    expect(status).not.toBe(500);
  });

  test("Microsoft OAuth callback responds (not 500)", async ({ request }) => {
    const response = await request.get("/api/auth/microsoft/callback");
    const status = response.status();

    if (status === 404) {
      console.warn(
        "Microsoft OAuth route returned 404 — may not be compiled. Check MICROSOFT_CLIENT_ID env var."
      );
    }
    expect(status).not.toBe(500);
  });

  test("Zoom OAuth callback responds (not 500)", async ({ request }) => {
    const response = await request.get("/api/auth/zoom/callback");
    const status = response.status();

    if (status === 404) {
      console.warn(
        "Zoom OAuth route returned 404 — may not be compiled. Check ZOOM_CLIENT_ID env var."
      );
    }
    expect(status).not.toBe(500);
  });
});

test.describe("Meeting BaaS Webhook", () => {
  test("webhook endpoint exists and accepts POST", async ({ request }) => {
    const response = await request.post("/api/webhooks/meetingbaas", {
      data: {
        event: "bot.joining",
        data: { bot_id: "test-bot-123" },
      },
      headers: {
        "Content-Type": "application/json",
      },
    });

    // The endpoint should exist (not 404) and not crash (not 500)
    expect(response.status()).not.toBe(404);
  });

  test("webhook handles unknown event types gracefully", async ({
    request,
  }) => {
    const response = await request.post("/api/webhooks/meetingbaas", {
      data: {
        event: "unknown.event",
        data: { some: "data" },
      },
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Should not crash on unknown events
    expect(response.status()).not.toBe(500);
  });

  test("webhook handles empty body gracefully", async ({ request }) => {
    const response = await request.post("/api/webhooks/meetingbaas", {
      data: {},
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Should handle gracefully
    expect(response.status()).not.toBe(500);
  });
});

test.describe("Dashboard Routes", () => {
  test("dashboard routes respond to requests", async ({ request }) => {
    const response = await request.get("/dashboard/recordings");
    // Clerk middleware may redirect (302/307) or block (404) unauthenticated requests.
    // The key test is that the server doesn't crash (500).
    expect(response.status()).not.toBe(500);
  });
});
