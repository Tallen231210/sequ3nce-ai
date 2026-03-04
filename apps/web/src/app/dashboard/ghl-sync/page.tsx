"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Settings,
  Zap,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import type { Id } from "../../../../convex/_generated/dataModel";

function formatDate(timestamp?: number): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCurrency(amount?: number): string {
  if (!amount) return "—";
  return `$${amount.toLocaleString()}`;
}

const outcomeBadgeColors: Record<string, string> = {
  closed: "bg-green-100 text-green-700",
  follow_up: "bg-blue-100 text-blue-700",
  lost: "bg-red-100 text-red-700",
  no_show: "bg-zinc-100 text-zinc-600",
};

export default function GhlSyncPage() {
  const { team, clerkId } = useTeam();
  const ghlConfig = useQuery(
    api.ghl.getGhlConfig,
    clerkId ? { clerkId } : "skip"
  );
  const syncHistory = useQuery(
    api.ghl.getGhlSyncHistory,
    team?._id ? { teamId: team._id, limit: 50 } : "skip"
  );
  const syncStats = useQuery(
    api.ghl.getGhlSyncStats,
    team?._id ? { teamId: team._id } : "skip"
  );
  const retrySync = useAction(api.ghl.retryGhlSync);

  const [retryingCall, setRetryingCall] = useState<string | null>(null);
  const [retryResults, setRetryResults] = useState<
    Record<string, { success: boolean; error?: string }>
  >({});

  const handleRetry = async (callId: Id<"calls">) => {
    if (!clerkId) return;
    setRetryingCall(callId);
    try {
      const result = await retrySync({ clerkId, callId });
      setRetryResults((prev) => ({ ...prev, [callId]: result }));
    } catch {
      setRetryResults((prev) => ({
        ...prev,
        [callId]: { success: false, error: "Retry failed" },
      }));
    } finally {
      setRetryingCall(null);
    }
  };

  // Loading
  if (ghlConfig === undefined || syncHistory === undefined) {
    return (
      <>
        <Header title="GHL Sync" />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      </>
    );
  }

  // Not configured
  if (!ghlConfig?.enabled || !ghlConfig?.hasApiKey) {
    return (
      <>
        <Header title="GHL Sync" />
        <div className="flex items-center justify-center py-20">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-zinc-100 flex items-center justify-center">
                <Zap className="h-6 w-6 text-zinc-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">
                  GoHighLevel Not Configured
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect your GHL account to automatically sync call data to
                  your CRM contacts.
                </p>
              </div>
              <Link href="/dashboard/settings">
                <Button className="mt-2">
                  <Settings className="h-4 w-4 mr-2" />
                  Go to Settings
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="GHL Sync" />
      <div className="space-y-6">
        {/* Status Bar */}
        <div className="flex items-center gap-4">
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Connected
          </Badge>

          {syncStats && (
            <>
              <span className="text-sm text-muted-foreground">
                {syncStats.totalSynced} total syncs
              </span>
              <span className="text-sm text-muted-foreground">
                {syncStats.syncedToday} today
              </span>
              {syncStats.recentFailures > 0 && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {syncStats.recentFailures} failed
                </Badge>
              )}
            </>
          )}
        </div>

        {/* Sync History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Syncs</CardTitle>
          </CardHeader>
          <CardContent>
            {!syncHistory || syncHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Zap className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                <p>No syncs yet.</p>
                <p className="text-sm">
                  Call data will appear here after calls are completed.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Date</th>
                      <th className="pb-2 pr-4 font-medium">Closer</th>
                      <th className="pb-2 pr-4 font-medium">Prospect</th>
                      <th className="pb-2 pr-4 font-medium">Outcome</th>
                      <th className="pb-2 pr-4 font-medium">Cash</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncHistory.map((call) => {
                      const isFailed = !!call.ghlSyncError && !call.ghlSyncedAt;
                      const retryResult = retryResults[call._id];
                      const isRetrying = retryingCall === call._id;

                      return (
                        <tr
                          key={call._id}
                          className="border-b last:border-0 hover:bg-zinc-50/50"
                        >
                          <td className="py-3 pr-4">
                            {formatDate(call.ghlSyncedAt ?? call.completedAt)}
                          </td>
                          <td className="py-3 pr-4">{call.closerName}</td>
                          <td className="py-3 pr-4">{call.prospectName}</td>
                          <td className="py-3 pr-4">
                            <Badge
                              variant="outline"
                              className={
                                outcomeBadgeColors[call.outcome] ??
                                "bg-zinc-100 text-zinc-600"
                              }
                            >
                              {call.outcome}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4">
                            {formatCurrency(call.cashCollected)}
                          </td>
                          <td className="py-3 pr-4">
                            {retryResult?.success ? (
                              <Badge
                                variant="outline"
                                className="bg-green-50 text-green-700 border-green-200"
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Synced
                              </Badge>
                            ) : isFailed ? (
                              <div>
                                <Badge
                                  variant="outline"
                                  className="bg-red-50 text-red-700 border-red-200"
                                >
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Failed
                                </Badge>
                                <p
                                  className="text-xs text-red-500 mt-1 max-w-[200px] truncate"
                                  title={call.ghlSyncError ?? ""}
                                >
                                  {call.ghlSyncError}
                                </p>
                              </div>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-green-50 text-green-700 border-green-200"
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Synced
                              </Badge>
                            )}
                          </td>
                          <td className="py-3">
                            {isFailed && !retryResult?.success && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleRetry(call._id as Id<"calls">)
                                }
                                disabled={isRetrying}
                              >
                                {isRetrying ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : (
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                )}
                                Retry
                              </Button>
                            )}
                            {retryResult && !retryResult.success && (
                              <p className="text-xs text-red-500 mt-1">
                                {retryResult.error}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
