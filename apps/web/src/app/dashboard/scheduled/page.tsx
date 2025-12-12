"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, ExternalLink, Loader2, UserPlus } from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import Link from "next/link";

interface ScheduledCall {
  _id: Id<"scheduledCalls">;
  prospectName?: string;
  prospectEmail?: string;
  scheduledAt: number;
  meetingLink?: string;
  source: string;
  closerId?: Id<"closers">;
  closerName: string | null;
  closerEmail: string | null;
  closerInitials: string | null;
}

// Helper to group calls by day
function groupCallsByDay(calls: ScheduledCall[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  const groups: { title: string; calls: ScheduledCall[] }[] = [];

  const todayCalls = calls.filter((call) => {
    const callDate = new Date(call.scheduledAt);
    callDate.setHours(0, 0, 0, 0);
    return callDate.getTime() === today.getTime();
  });

  const tomorrowCalls = calls.filter((call) => {
    const callDate = new Date(call.scheduledAt);
    callDate.setHours(0, 0, 0, 0);
    return callDate.getTime() === tomorrow.getTime();
  });

  const laterCalls = calls.filter((call) => {
    const callDate = new Date(call.scheduledAt);
    callDate.setHours(0, 0, 0, 0);
    return callDate.getTime() >= dayAfterTomorrow.getTime();
  });

  if (todayCalls.length > 0) {
    groups.push({ title: "Today", calls: todayCalls });
  }
  if (tomorrowCalls.length > 0) {
    groups.push({ title: "Tomorrow", calls: tomorrowCalls });
  }
  if (laterCalls.length > 0) {
    groups.push({ title: "This Week", calls: laterCalls });
  }

  return groups;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Calendly logo SVG component
function CalendlyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.655 14.262c-.178.178-.355.333-.555.467a4.3 4.3 0 0 1-2.333.689 4.32 4.32 0 0 1-3.066-1.267 4.297 4.297 0 0 1-1.267-3.066c0-1.155.444-2.244 1.267-3.066a4.32 4.32 0 0 1 3.066-1.267c.844 0 1.644.244 2.333.689.2.133.377.289.555.467l1.6-1.6a6.4 6.4 0 0 0-4.488-1.822 6.44 6.44 0 0 0-4.578 1.889 6.44 6.44 0 0 0-1.889 4.578 6.44 6.44 0 0 0 1.889 4.578 6.44 6.44 0 0 0 4.578 1.889 6.4 6.4 0 0 0 4.488-1.822l-1.6-1.6z"/>
    </svg>
  );
}

export default function ScheduledCallsPage() {
  const { clerkId, isLoading: isTeamLoading } = useTeam();

  const scheduledCalls = useQuery(
    api.calendly.getScheduledCalls,
    clerkId ? { clerkId } : "skip"
  );

  const closers = useQuery(
    api.closers.getClosers,
    clerkId ? { clerkId } : "skip"
  );

  const assignCloser = useMutation(api.calendly.assignCloser);

  const handleAssignCloser = async (
    scheduledCallId: Id<"scheduledCalls">,
    closerId: string
  ) => {
    if (!clerkId) return;
    try {
      await assignCloser({
        clerkId,
        scheduledCallId,
        closerId: closerId === "unassigned" ? undefined : (closerId as Id<"closers">),
      });
    } catch (error) {
      console.error("Failed to assign closer:", error);
    }
  };

  // Loading state
  if (isTeamLoading || scheduledCalls === undefined) {
    return (
      <>
        <Header
          title="Scheduled Calls"
          description="Upcoming calls from connected calendars"
        />
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  const groupedCalls = groupCallsByDay(scheduledCalls);

  return (
    <>
      <Header
        title="Scheduled Calls"
        description="Upcoming calls from connected calendars"
      />
      <div className="p-6 space-y-6">
        {groupedCalls.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-muted-foreground">No scheduled calls</p>
              <p className="text-sm text-muted-foreground mt-1">
                Connect Calendly in{" "}
                <Link href="/dashboard/settings" className="text-blue-600 hover:underline">
                  Settings
                </Link>{" "}
                to sync your scheduled calls
              </p>
            </CardContent>
          </Card>
        ) : (
          groupedCalls.map((group) => (
            <Card key={group.title}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {group.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {group.calls.map((call) => (
                  <div
                    key={call._id}
                    className="flex items-center justify-between py-3 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-4">
                      {/* Time */}
                      <div className="w-20 text-sm font-medium">
                        {formatTime(call.scheduledAt)}
                      </div>

                      {/* Closer */}
                      <div className="flex items-center gap-2">
                        {call.closerName ? (
                          <>
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-xs">
                                {call.closerInitials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm text-muted-foreground">
                              {call.closerName}
                            </span>
                          </>
                        ) : (
                          <Select
                            value={call.closerId || "unassigned"}
                            onValueChange={(value) =>
                              handleAssignCloser(call._id, value)
                            }
                          >
                            <SelectTrigger className="h-8 w-[160px] text-xs">
                              <div className="flex items-center gap-1 text-amber-600">
                                <UserPlus className="h-3 w-3" />
                                <SelectValue placeholder="Assign closer" />
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">
                                Unassigned
                              </SelectItem>
                              {closers?.map((closer) => (
                                <SelectItem key={closer._id} value={closer._id}>
                                  {closer.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      {/* Prospect */}
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">→</span>
                        <div>
                          <p className="text-sm font-medium">
                            {call.prospectName || "Unknown"}
                          </p>
                          {call.prospectEmail && (
                            <p className="text-xs text-muted-foreground">
                              {call.prospectEmail}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Source badge */}
                      {call.source === "calendly" && (
                        <Badge variant="outline" className="text-xs gap-1 font-normal text-blue-600 border-blue-200 bg-blue-50">
                          <CalendlyIcon className="h-3 w-3" />
                          Calendly
                        </Badge>
                      )}
                    </div>

                    {/* Meeting link */}
                    {call.meetingLink && (
                      <a
                        href={call.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                        Join
                      </a>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
