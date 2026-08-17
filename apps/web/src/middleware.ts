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
  // Pricing has to be readable before someone has an account, or the signup
  // page can't tell a visitor what the plans are.
  "/api/polar/available-tiers",
]);

export default clerkMiddleware(async (auth, req) => {
  // Skip middleware for webhook and B2C API routes (B2C uses its own auth, not Clerk)
  if (isPublicApiRoute(req)) {
    return NextResponse.next();
  }

  // Redirect affiliate links from root to /personal — Refgrow generates links like
  // sequ3nce.ai?ref=ZCGBIE but the B2C landing page (with lead capture + Refgrow
  // attribution) lives at /personal. This preserves the ?ref= param so the cookie
  // and attribution still work.
  const url = req.nextUrl;
  if (url.pathname === "/" && url.searchParams.has("ref")) {
    url.pathname = "/personal";
    return NextResponse.redirect(url);
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
