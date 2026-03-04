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
  ChevronDown,
  ChevronUp,
  Settings,
  Mail,
  MailX,
  Zap,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import type { Id } from "../../../../convex/_generated/dataModel";

function formatDuration(seconds?: number): string {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  if (mins >= 60) {
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }
  return `${mins}m`;
}

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

const OUTCOME_STYLES: Record<string, { label: string; className: string }> = {
  closed: { label: "Closed", className: "bg-green-50 text-green-700 border-green-200" },
  follow_up: { label: "Follow-up", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  lost: { label: "Not Closed", className: "bg-red-50 text-red-700 border-red-200" },
  no_show: { label: "No Show", className: "bg-zinc-50 text-zinc-600 border-zinc-200" },
};

export default function HyrosSyncPage() {
  const { team, isLoading: isTeamLoading } = useTeam();

  const hyrosConfig = useQuery(api.hyros.getHyrosConfig);

  const pendingCalls = useQuery(
    api.hyros.getPendingHyrosCalls,
    team?._id ? { teamId: team._id } : "skip"
  );

  const syncHistory = useQuery(
    api.hyros.getHyrosSyncHistory,
    team?._id ? { teamId: team._id, limit: 20 } : "skip"
  );

  const pushCallToHyros = useAction(api.hyrosActions.pushCallToHyros);
  const batchPushToHyros = useAction(api.hyrosActions.batchPushToHyros);

  const [selectedCalls, setSelectedCalls] = useState<Set<string>>(new Set());
  const [pushingCall, setPushingCall] = useState<string | null>(null);
  const [batchPushing, setBatchPushing] = useState(false);
  const [pushResults, setPushResults] = useState<Record<string, { success: boolean; error?: string }>>({});
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

  // Loading state
  if (isTeamLoading || hyrosConfig === undefined) {
    return (
      <>
        <Header title="Hyros Sync" description="Review and push call data to Hyros for ad attribution" />
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  // Not configured state
  if (!hyrosConfig?.enabled || !hyrosConfig?.hasApiKey) {
    return (
      <>
        <Header title="Hyros Sync" description="Review and push call data to Hyros for ad attribution" />
        <div className="p-6 max-w-2xl mx-auto">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto">
                  <Zap className="h-6 w-6 text-zinc-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Hyros Not Configured</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Connect your Hyros account to start pushing call intelligence for ad attribution.
                  </p>
                </div>
                <Link href="/dashboard/settings">
                  <Button>
                    <Settings className="h-4 w-4 mr-2" />
                    Go to Settings
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const pushableCalls = pendingCalls?.filter((c) => c.hasEmail) ?? [];
  const selectedPushable = Array.from(selectedCalls).filter((id) =>
    pushableCalls.some((c) => c._id === id)
  );

  const handleToggleSelect = (callId: string) => {
    setSelectedCalls((prev) => {
      const next = new Set(prev);
      if (next.has(callId)) {
        next.delete(callId);
      } else {
        next.add(callId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedPushable.length === pushableCalls.length) {
      setSelectedCalls(new Set());
    } else {
      setSelectedCalls(new Set(pushableCalls.map((c) => c._id)));
    }
  };

  const handlePushSingle = async (callId: Id<"calls">) => {
    setPushingCall(callId);
    try {
      const result = await pushCallToHyros({ callId });
      setPushResults((prev) => ({ ...prev, [callId]: result }));
      if (result.success) {
        setSelectedCalls((prev) => {
          const next = new Set(prev);
          next.delete(callId);
          return next;
        });
      }
    } catch {
      setPushResults((prev) => ({ ...prev, [callId]: { success: false, error: "Failed to push" } }));
    } finally {
      setPushingCall(null);
    }
  };

  const handleBatchPush = async () => {
    if (selectedPushable.length === 0) return;
    setBatchPushing(true);
    try {
      const result = await batchPushToHyros({
        callIds: selectedPushable as Id<"calls">[],
      });

      // Mark successes
      for (const id of selectedPushable) {
        const hasError = result.errors.some((e: string) => e.startsWith(id));
        setPushResults((prev) => ({
          ...prev,
          [id]: hasError
            ? { success: false, error: result.errors.find((e: string) => e.startsWith(id)) }
            : { success: true },
        }));
      }

      // Clear successfully pushed from selection
      setSelectedCalls(new Set());
    } catch {
      // Mark all as failed
      for (const id of selectedPushable) {
        setPushResults((prev) => ({ ...prev, [id]: { success: false, error: "Batch push failed" } }));
      }
    } finally {
      setBatchPushing(false);
    }
  };

  const toggleTags = (callId: string) => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(callId)) {
        next.delete(callId);
      } else {
        next.add(callId);
      }
      return next;
    });
  };

  return (
    <>
      <Header title="Hyros Sync" description="Review and push call data to Hyros for ad attribution" />
      <div className="p-6 space-y-6">
        {/* Status Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Connected
            </Badge>
            <span className="text-sm text-muted-foreground">
              {pendingCalls?.length ?? 0} call{(pendingCalls?.length ?? 0) !== 1 ? "s" : ""} pending review
            </span>
          </div>
          {selectedPushable.length > 0 && (
            <Button onClick={handleBatchPush} disabled={batchPushing}>
              {batchPushing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ArrowUpRight className="h-4 w-4 mr-2" />
              )}
              Push Selected ({selectedPushable.length})
            </Button>
          )}
        </div>

        {/* Pending Calls Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pending Calls</CardTitle>
          </CardHeader>
          <CardContent>
            {!pendingCalls || pendingCalls.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-green-400" />
                <p className="font-medium">All caught up!</p>
                <p className="text-sm mt-1">No pending calls to sync.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3 w-8">
                        <input
                          type="checkbox"
                          checked={selectedPushable.length === pushableCalls.length && pushableCalls.length > 0}
                          onChange={handleSelectAll}
                          className="rounded border-zinc-300"
                        />
                      </th>
                      <th className="pb-2 pr-3">Date</th>
                      <th className="pb-2 pr-3">Closer</th>
                      <th className="pb-2 pr-3">Prospect</th>
                      <th className="pb-2 pr-3">Email</th>
                      <th className="pb-2 pr-3">Outcome</th>
                      <th className="pb-2 pr-3">Cash</th>
                      <th className="pb-2 pr-3">Duration</th>
                      <th className="pb-2 pr-3">Tags</th>
                      <th className="pb-2 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingCalls.map((call) => {
                      const outcomeStyle = OUTCOME_STYLES[call.outcome] ?? {
                        label: call.outcome,
                        className: "bg-zinc-50 text-zinc-600 border-zinc-200",
                      };
                      const result = pushResults[call._id];
                      const isTagsExpanded = expandedTags.has(call._id);

                      return (
                        <tr key={call._id} className="border-b last:border-0 hover:bg-zinc-50/50">
                          <td className="py-3 pr-3">
                            {call.hasEmail ? (
                              <input
                                type="checkbox"
                                checked={selectedCalls.has(call._id)}
                                onChange={() => handleToggleSelect(call._id)}
                                className="rounded border-zinc-300"
                              />
                            ) : (
                              <span className="text-zinc-300">—</span>
                            )}
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">{formatDate(call.completedAt)}</td>
                          <td className="py-3 pr-3">{call.closerName}</td>
                          <td className="py-3 pr-3">{call.prospectName}</td>
                          <td className="py-3 pr-3">
                            {call.hasEmail ? (
                              <span className="flex items-center gap-1 text-green-600">
                                <Mail className="h-3 w-3" />
                                <span className="truncate max-w-[140px]">{call.prospectEmail}</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-red-500">
                                <MailX className="h-3 w-3" />
                                No Email
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-3">
                            <Badge variant="outline" className={outcomeStyle.className}>
                              {outcomeStyle.label}
                            </Badge>
                          </td>
                          <td className="py-3 pr-3">{formatCurrency(call.cashCollected)}</td>
                          <td className="py-3 pr-3">{formatDuration(call.duration)}</td>
                          <td className="py-3 pr-3">
                            <button
                              onClick={() => toggleTags(call._id)}
                              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
                            >
                              {call.tags.length} tags
                              {isTagsExpanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </button>
                            {isTagsExpanded && (
                              <div className="flex flex-wrap gap-1 mt-1 max-w-[200px]">
                                {call.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="inline-block px-1.5 py-0.5 text-[10px] bg-zinc-100 text-zinc-600 rounded"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-3">
                            {result?.success ? (
                              <span className="flex items-center gap-1 text-green-600 text-xs">
                                <CheckCircle2 className="h-3 w-3" />
                                Synced
                              </span>
                            ) : (
                              <div className="space-y-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handlePushSingle(call._id as Id<"calls">)}
                                  disabled={!call.hasEmail || pushingCall === call._id}
                                  className="h-7 text-xs"
                                >
                                  {pushingCall === call._id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    "Push"
                                  )}
                                </Button>
                                {(result?.error || call.hyrosSyncError) && (
                                  <p className="text-[10px] text-red-500 max-w-[120px] truncate" title={result?.error || call.hyrosSyncError}>
                                    <AlertCircle className="h-2.5 w-2.5 inline mr-0.5" />
                                    {result?.error || call.hyrosSyncError}
                                  </p>
                                )}
                              </div>
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

        {/* Recently Synced */}
        {syncHistory && syncHistory.length > 0 && (
          <Card>
            <button
              onClick={() => setHistoryExpanded(!historyExpanded)}
              className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 transition-colors"
            >
              <CardTitle className="text-base">Recently Synced ({syncHistory.length})</CardTitle>
              {historyExpanded ? (
                <ChevronUp className="h-4 w-4 text-zinc-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              )}
            </button>
            {historyExpanded && (
              <CardContent className="pt-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3">Synced At</th>
                      <th className="pb-2 pr-3">Closer</th>
                      <th className="pb-2 pr-3">Prospect</th>
                      <th className="pb-2 pr-3">Outcome</th>
                      <th className="pb-2">Cash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncHistory.map((call) => {
                      const outcomeStyle = OUTCOME_STYLES[call.outcome] ?? {
                        label: call.outcome,
                        className: "bg-zinc-50 text-zinc-600 border-zinc-200",
                      };
                      return (
                        <tr key={call._id} className="border-b last:border-0">
                          <td className="py-2 pr-3 text-muted-foreground">{formatDate(call.hyrosSyncedAt)}</td>
                          <td className="py-2 pr-3">{call.closerName}</td>
                          <td className="py-2 pr-3">{call.prospectName}</td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline" className={outcomeStyle.className}>
                              {outcomeStyle.label}
                            </Badge>
                          </td>
                          <td className="py-2">{formatCurrency(call.cashCollected)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
