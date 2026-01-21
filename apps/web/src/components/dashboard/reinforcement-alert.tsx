"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { AlertTriangle, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Id } from "../../../convex/_generated/dataModel";

export function ReinforcementAlert() {
  const { team, user, isReady } = useTeam();
  const previousCount = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasRequestedPermission = useRef(false);

  // Query for active reinforcement requests
  const activeRequests = useQuery(
    api.reinforcements.getActiveRequestsForTeam,
    isReady && team?._id ? { teamId: team._id } : "skip"
  );

  // Mutation to acknowledge a request
  const acknowledgeRequest = useMutation(api.reinforcements.acknowledgeRequest);

  // Request notification permission on mount
  useEffect(() => {
    if (
      !hasRequestedPermission.current &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      hasRequestedPermission.current = true;
      Notification.requestPermission();
    }
  }, []);

  // Play sound and show notification when new request comes in
  useEffect(() => {
    if (!activeRequests) return;

    const pendingRequests = activeRequests.filter((r) => r.status === "pending");
    const currentPendingCount = pendingRequests.length;

    // New request came in
    if (currentPendingCount > previousCount.current && previousCount.current >= 0) {
      const latestRequest = pendingRequests[0]; // Most recent is first

      // Play alert sound
      if (audioRef.current) {
        audioRef.current.play().catch(() => {
          // Ignore audio play errors (e.g., user hasn't interacted yet)
        });
      }

      // Show browser notification
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification("Reinforcement Requested!", {
          body: `${latestRequest.closerName} needs help${latestRequest.message ? `: ${latestRequest.message}` : ""}`,
          icon: "/icon-192.png",
          tag: "reinforcement-" + latestRequest._id,
          requireInteraction: true,
        });
      }
    }

    previousCount.current = currentPendingCount;
  }, [activeRequests]);

  // Handle acknowledge button click
  const handleAcknowledge = useCallback(
    async (requestId: Id<"reinforcementRequests">) => {
      if (!user?._id) return;

      try {
        await acknowledgeRequest({
          requestId,
          userId: user._id,
        });
      } catch (error) {
        console.error("Failed to acknowledge request:", error);
      }
    },
    [acknowledgeRequest, user]
  );

  // Format time ago
  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  // Don't render if no pending requests
  const pendingRequests = activeRequests?.filter((r) => r.status === "pending") || [];
  if (pendingRequests.length === 0) return null;

  return (
    <>
      {/* Hidden audio element for alert sound */}
      <audio ref={audioRef} preload="auto">
        <source src="/sounds/urgent-alert.mp3" type="audio/mpeg" />
      </audio>

      {/* Alert banner */}
      <div className="fixed top-0 left-64 right-0 z-50 bg-red-600 text-white shadow-lg">
        <div className="px-6 py-3">
          {pendingRequests.map((request) => (
            <div key={request._id} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{request.closerName}</span>
                    <span className="text-white/80">needs help!</span>
                  </div>
                  {request.message && (
                    <p className="text-sm text-white/90 mt-0.5">
                      &ldquo;{request.message}&rdquo;
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-sm text-white/70">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formatTimeAgo(request.createdAt)}</span>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleAcknowledge(request._id)}
                  className="bg-white text-red-600 hover:bg-white/90"
                >
                  Acknowledge
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
