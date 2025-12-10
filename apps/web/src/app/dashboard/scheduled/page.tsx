import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, Clock, ExternalLink } from "lucide-react";
import { mockScheduledCalls } from "@/lib/mock-data";

// Helper to group calls by day
function groupCallsByDay(calls: typeof mockScheduledCalls) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  const groups: { title: string; calls: typeof mockScheduledCalls }[] = [];

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

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function ScheduledCallsPage() {
  const groupedCalls = groupCallsByDay(mockScheduledCalls);

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
                Calls will appear here when closers connect their calendars
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
                    key={call.id}
                    className="flex items-center justify-between py-3 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-4">
                      {/* Time */}
                      <div className="w-20 text-sm font-medium">
                        {formatTime(call.scheduledAt)}
                      </div>

                      {/* Closer */}
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-xs">
                            {call.closerInitials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-muted-foreground">
                          {call.closerName}
                        </span>
                      </div>

                      {/* Prospect */}
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">→</span>
                        <div>
                          <p className="text-sm font-medium">{call.prospectName}</p>
                          <p className="text-xs text-muted-foreground">
                            {call.prospectEmail}
                          </p>
                        </div>
                      </div>
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
