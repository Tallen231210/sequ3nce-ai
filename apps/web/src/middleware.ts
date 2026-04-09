import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Define which routes require authentication
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/team(.*)",
  "/billing(.*)",
  "/settings(.*)",
  "/calls(.*)",
]);

// Routes that should skip middleware entirely (no Clerk auth)
const isPublicApiRoute = createRouteMatcher([
  "/api/webhooks(.*)",
  "/api/stripe/b2c-(.*)",
  "/api/updates/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Skip middleware for webhook and B2C API routes (B2C uses its own auth, not Clerk)
  if (isPublicApiRoute(req)) {
    return NextResponse.next();
  }

  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals, static files, webhook routes, B2C Stripe routes, update routes, and affiliate page
    "/((?!_next|api/webhooks|api/stripe/b2c-|api/updates/|affiliate|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
