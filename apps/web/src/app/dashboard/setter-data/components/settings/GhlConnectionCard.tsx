"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, AlertCircle, RefreshCw, Unlink, ExternalLink } from "lucide-react";

interface InstallationStatus {
  connected: boolean;
  status?: "active" | "error" | "uninstalled";
  locationName?: string;
  locationId?: string;
  installedAt?: number;
  lastSyncedAt?: number;
  errorMessage?: string;
  errorAt?: number;
  fastBackfillCompletedAt?: number;
  deepBackfillLastCompletedMonth?: number;
  deepBackfillCompletedAt?: number;
  deepBackfillError?: string;
}

interface GhlConnectionCardProps {
  installation: InstallationStatus | null;
}

export function GhlConnectionCard({ installation }: GhlConnectionCardProps) {
  const triggerSync = useMutation(api.setterDataMutations.triggerManualSync);
  const disconnect = useMutation(api.setterGhlOauth.disconnectInstallation);
  const clearBackfillError = useMutation(api.setterDataMutations.clearDeepBackfillError);

  const [syncing, setSyncing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  if (!installation || !installation.connected) return null;

  const isActive = installation.status === "active";
  const hasError = installation.status === "error";

  async function handleSync() {
    setSyncing(true);
    try {
      await triggerSync();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await disconnect();
      setConfirmDisconnect(false);
      // Page will reflow because the underlying installation query updates.
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleClearBackfillError() {
    try {
      await clearBackfillError();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">GoHighLevel Connection</h3>
                {isActive ? (
                  <Badge variant="outline" className="border-green-500/40 text-green-700 dark:text-green-400">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-destructive/40 text-destructive">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Error
                  </Badge>
                )}
              </div>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                {installation.locationName && (
                  <div>
                    <span className="font-medium text-foreground">Location:</span>{" "}
                    {installation.locationName}
                  </div>
                )}
                {installation.locationId && (
                  <div className="font-mono text-xs">{installation.locationId}</div>
                )}
                {installation.installedAt && (
                  <div>
                    Installed{" "}
                    {new Date(installation.installedAt).toLocaleDateString()}
                  </div>
                )}
                {installation.lastSyncedAt && (
                  <div>
                    Last synced{" "}
                    {formatRelativeTime(installation.lastSyncedAt)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {hasError && installation.errorMessage && (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {installation.errorMessage}
            </div>
          )}

          {installation.deepBackfillError && (
            <div className="mt-4 flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/20">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
              <div className="flex-1">
                <div className="font-medium">Historical sync paused</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {installation.deepBackfillError}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={handleClearBackfillError}>
                Resume
              </Button>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSync}
              disabled={syncing || !isActive}
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Refresh now"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmDisconnect(true)}
            >
              <Unlink className="mr-2 h-3.5 w-3.5" />
              Disconnect
            </Button>
            {hasError && (
              <Button
                size="sm"
                onClick={() => {
                  // Re-trigger install flow.
                  const clientId = process.env.NEXT_PUBLIC_GHL_CLIENT_ID;
                  const redirectUri = process.env.NEXT_PUBLIC_GHL_REDIRECT_URI;
                  if (!clientId || !redirectUri) return;
                  const url = new URL(
                    "https://marketplace.gohighlevel.com/oauth/chooselocation",
                  );
                  url.searchParams.set("response_type", "code");
                  url.searchParams.set("client_id", clientId);
                  url.searchParams.set("redirect_uri", redirectUri);
                  url.searchParams.set(
                    "scope",
                    "contacts.readonly conversations.readonly conversations/message.readonly users.readonly locations.readonly",
                  );
                  window.location.href = url.toString();
                }}
              >
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                Reconnect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect GoHighLevel?</AlertDialogTitle>
            <AlertDialogDescription>
              This disconnects the integration on Sequ3nce's side — historical
              data is preserved, no leads are deleted. To fully revoke at
              GoHighLevel, also uninstall the app from your GHL marketplace
              settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
