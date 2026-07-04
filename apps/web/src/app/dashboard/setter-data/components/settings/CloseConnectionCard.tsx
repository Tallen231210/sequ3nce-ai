"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { useTeam } from "@/hooks/useTeam";
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
import { CheckCircle2, AlertCircle, Unlink } from "lucide-react";

interface CloseConnectionCardProps {
  installation: {
    connected: boolean;
    status?: "active" | "error" | "uninstalled";
    locationName?: string;
    installedAt?: number;
    lastSyncedAt?: number;
    errorMessage?: string;
  } | null;
}

/**
 * Settings connection card for Close CRM installs — the provider-aware
 * counterpart to GhlConnectionCard. No OAuth "Reconnect" (Close is an API
 * key: to rotate, disconnect + re-add). Disconnect uses disconnectClose,
 * which removes the stored key while preserving historical data.
 */
export function CloseConnectionCard({ installation }: CloseConnectionCardProps) {
  const { clerkId, team } = useTeam();
  const disconnect = useMutation(api.setterCloseInstall.disconnectClose);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  if (!installation || !installation.connected) return null;

  const isActive = installation.status === "active";
  const hasError = installation.status === "error";

  async function handleDisconnect() {
    if (!clerkId || !team?._id) return;
    setDisconnecting(true);
    try {
      const res = await disconnect({
        clerkId,
        teamId: team._id as Id<"teams">,
      });
      if (!res.ok) alert(res.error ?? "Disconnect failed");
      setConfirmDisconnect(false);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Close CRM Connection</h3>
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
                <span className="font-medium text-foreground">Organization:</span>{" "}
                {installation.locationName}
              </div>
            )}
            {installation.installedAt && (
              <div>Connected {new Date(installation.installedAt).toLocaleDateString()}</div>
            )}
            {installation.lastSyncedAt && (
              <div>Last synced {formatRelativeTime(installation.lastSyncedAt)}</div>
            )}
          </div>

          {hasError && installation.errorMessage && (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {installation.errorMessage}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setConfirmDisconnect(true)}>
              <Unlink className="mr-2 h-3.5 w-3.5" />
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Close CRM?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your stored Close API key on Sequ3nce&apos;s side —
              historical data is preserved and no leads are deleted. To
              reconnect later, paste a new API key.
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
