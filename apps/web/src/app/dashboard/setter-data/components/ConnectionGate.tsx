"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, ExternalLink } from "lucide-react";

// Canonical OAuth authorization URL is on marketplace.leadconnectorhq.com.
// The old marketplace.gohighlevel.com host renders the account picker but
// silently rejects the client_id at the next step with "Invalid parameter:
// client_id" — confirmed against GHL's official OAuth 2.0 docs.
const GHL_INSTALL_BASE =
  "https://marketplace.leadconnectorhq.com/oauth/chooselocation";

const PHASE_1_SCOPES = [
  "contacts.readonly",
  "conversations.readonly",
  "conversations/message.readonly",
  "users.readonly",
  "locations.readonly",
  "opportunities.readonly",
  "calendars/events.readonly",
];

interface ConnectionGateProps {
  /** Optional team id passed via state to the OAuth callback. The route
   *  handler echoes it back so we know which team to attach tokens to. */
  teamId?: string;
}

/**
 * The first-time empty state for users who haven't installed the GHL
 * Marketplace App yet. Doubles as discovery + onboarding — they land on
 * the Setter Data tab from the sidebar, see this hero, click Install,
 * authorize on GHL's side, and get redirected back to /setter-data with
 * tokens already persisted.
 */
export function ConnectionGate({ teamId }: ConnectionGateProps) {
  function handleInstall() {
    // Defensive .trim() — env vars set via `echo "..." | vercel env add`
    // pick up a trailing newline that gets URL-encoded as %0A and breaks
    // the OAuth install with "Invalid parameter: client_id". Belt-and-
    // suspenders so a future env-var typo doesn't burn another debug
    // session.
    const clientId = process.env.NEXT_PUBLIC_GHL_CLIENT_ID?.trim();
    const redirectUri = process.env.NEXT_PUBLIC_GHL_REDIRECT_URI?.trim();

    if (!clientId || !redirectUri) {
      console.error(
        "[ConnectionGate] Missing GHL env vars (NEXT_PUBLIC_GHL_CLIENT_ID / NEXT_PUBLIC_GHL_REDIRECT_URI)",
      );
      alert(
        "GoHighLevel install URL is not configured. Contact support@sequ3nce.ai.",
      );
      return;
    }

    // teamId is REQUIRED — our OAuth callback refuses to exchange the
    // code without a state value to pin the install to. Without this
    // guard, an install attempt with teamId=undefined (e.g. team still
    // loading) sent a stateless URL, GHL didn't echo state back, and
    // our callback redirected with "missing_params". Block instead.
    if (!teamId) {
      console.error("[ConnectionGate] No teamId — refusing to start install");
      alert(
        "Workspace still loading — refresh the page and try again in a moment.",
      );
      return;
    }

    const url = new URL(GHL_INSTALL_BASE);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", PHASE_1_SCOPES.join(" "));
    url.searchParams.set("state", teamId);

    window.location.href = url.toString();
  }

  return (
    <Card className="mx-auto max-w-3xl border-border bg-card">
      <CardContent className="px-8 py-12 text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Zap className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          Track your setter team's performance
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          Connect your GoHighLevel sub-account to surface speed-to-lead, dial
          counts, connection rates, and per-setter performance — all in real
          time as your team works.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Button size="lg" onClick={handleInstall}>
            <Zap className="mr-2 h-4 w-4" />
            Install GoHighLevel App
            <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Button>
          <p className="text-xs text-muted-foreground">
            One-click OAuth install. We never see your password.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 text-left sm:grid-cols-3">
          <FeatureBullet
            title="Speed to lead"
            body="See how long it takes each setter to dial a fresh lead — average, median, and 90th percentile."
          />
          <FeatureBullet
            title="Connection rate"
            body="Track which setters are actually getting people on the phone vs. just dialing voicemails."
          />
          <FeatureBullet
            title="Daily Slack scorecard"
            body="Yesterday's KPIs delivered every morning to whichever channel you choose."
          />
        </div>
      </CardContent>
    </Card>
  );
}

function FeatureBullet({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
        {body}
      </div>
    </div>
  );
}
