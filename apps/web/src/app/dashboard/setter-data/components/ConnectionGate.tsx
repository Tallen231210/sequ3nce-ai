"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, ExternalLink, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

// Canonical OAuth authorization URL is on marketplace.leadconnectorhq.com.
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
  /** Team id — GHL echoes it via OAuth state; Close passes it to connectClose. */
  teamId?: string;
  /** Beta-gated: only show the Close CRM option to teams flagged "close_crm". */
  showClose?: boolean;
}

/**
 * First-time empty state. Now provider-aware: the team picks their CRM —
 * GoHighLevel (OAuth install) or Close CRM (paste an API key). Once either
 * connects, the parent's installation query updates reactively and this gate
 * is replaced by the connected dashboard.
 */
export function ConnectionGate({ teamId, showClose }: ConnectionGateProps) {
  function handleGhlInstall() {
    const clientId = process.env.NEXT_PUBLIC_GHL_CLIENT_ID?.trim();
    const redirectUri = process.env.NEXT_PUBLIC_GHL_REDIRECT_URI?.trim();
    if (!clientId || !redirectUri) {
      alert("GoHighLevel install URL is not configured. Contact team@sequ3nce.ai.");
      return;
    }
    if (!teamId) {
      alert("Workspace still loading — refresh the page and try again in a moment.");
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
      <CardContent className="px-8 py-12">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Zap className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            Track your setter team&apos;s performance
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Connect your CRM to surface speed-to-lead, dial counts, connection
            rates, and per-setter performance — in real time as your team works.
          </p>
        </div>

        {/* Provider options. Close is beta-gated; without it, GHL is the
            single centered CTA (original layout). */}
        {showClose ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col rounded-lg border border-zinc-200 p-5">
              <div className="text-sm font-semibold">GoHighLevel</div>
              <p className="mt-1 text-xs text-muted-foreground">
                One-click OAuth install. We never see your password.
              </p>
              <div className="mt-4 flex-1" />
              <Button onClick={handleGhlInstall} className="w-full">
                <Zap className="mr-2 h-4 w-4" />
                Install GoHighLevel App
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Button>
            </div>
            <CloseConnectCard teamId={teamId} />
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center gap-3">
            <Button size="lg" onClick={handleGhlInstall}>
              <Zap className="mr-2 h-4 w-4" />
              Install GoHighLevel App
              <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </Button>
            <p className="text-xs text-muted-foreground">
              One-click OAuth install. We never see your password.
            </p>
          </div>
        )}

        {/* Shared feature bullets */}
        <div className="mt-10 grid grid-cols-1 gap-6 text-left sm:grid-cols-3">
          <FeatureBullet
            title="Speed to lead"
            body="How long each setter takes to work a fresh lead — average, median, and 90th percentile."
          />
          <FeatureBullet
            title="Connection rate"
            body="Which setters actually get people on the phone vs. just leaving voicemails."
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

function CloseConnectCard({ teamId }: { teamId?: string }) {
  const connectClose = useAction(api.setterCloseConnect.connectClose);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<"idle" | "validating" | "error" | "success">("idle");
  const [message, setMessage] = useState("");

  async function handleConnect() {
    if (!teamId) {
      setStatus("error");
      setMessage("Workspace still loading — refresh and try again.");
      return;
    }
    const key = apiKey.trim();
    if (!key) return;
    setStatus("validating");
    setMessage("");
    try {
      const res = await connectClose({ teamId: teamId as Id<"teams">, apiKey: key });
      if (res.success) {
        setStatus("success");
        setMessage(`Connected to ${res.orgName ?? "Close"} — loading your data…`);
      } else {
        setStatus("error");
        setMessage(res.error ?? "Connection failed.");
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong connecting. Please try again.");
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-zinc-200 p-5">
      <div className="text-sm font-semibold">Close CRM</div>
      <p className="mt-1 text-xs text-muted-foreground">
        Paste your Close API key — from Close → Settings → Developer → API Keys.
      </p>
      <div className="mt-4 space-y-2">
        <Input
          type="password"
          placeholder="api_…"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={status === "validating" || status === "success"}
          className="font-mono text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConnect();
          }}
        />
        <Button
          onClick={handleConnect}
          className="w-full"
          disabled={!apiKey.trim() || status === "validating" || status === "success"}
        >
          {status === "validating" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting…
            </>
          ) : status === "success" ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Connected
            </>
          ) : (
            "Connect Close"
          )}
        </Button>
        {status === "error" && (
          <div className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{message}</span>
          </div>
        )}
        {status === "success" && (
          <div className="flex items-start gap-1.5 text-xs text-emerald-600">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{message}</span>
          </div>
        )}
      </div>
    </div>
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
