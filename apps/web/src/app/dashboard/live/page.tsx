import { Header } from "@/components/dashboard/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Clock, MessageSquareQuote } from "lucide-react";
import { mockLiveCalls, formatDuration } from "@/lib/mock-data";

export default function LiveCallsPage() {
  return (
    <>
      <Header
        title="Live Calls"
        description="Monitor all active calls in real-time"
      />
      <div className="p-6">
        {mockLiveCalls.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground">No live calls at the moment</p>
              <p className="text-sm text-muted-foreground mt-1">
                Calls will appear here when closers start recording
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {mockLiveCalls.map((call) => (
              <Card key={call.id} className="overflow-hidden">
                <CardContent className="p-0">
                  {/* Header with status */}
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          call.status === "ON_CALL"
                            ? "bg-black animate-pulse"
                            : "bg-zinc-400"
                        }`}
                      />
                      <span className="text-sm font-medium">
                        {call.status === "ON_CALL" ? "On Call" : "Waiting"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" strokeWidth={1.5} />
                      {formatDuration(call.duration)}
                    </div>
                  </div>

                  {/* Main content */}
                  <div className="p-4 space-y-4">
                    {/* Closer info */}
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {call.closerInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{call.closerName}</p>
                        <p className="text-sm text-muted-foreground">
                          with {call.prospectName}
                        </p>
                      </div>
                    </div>

                    {/* Last ammo */}
                    {call.lastAmmo && (
                      <div className="rounded-md bg-zinc-50 p-3">
                        <div className="flex items-start gap-2">
                          <MessageSquareQuote
                            className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0"
                            strokeWidth={1.5}
                          />
                          <p className="text-sm italic text-muted-foreground">
                            &ldquo;{call.lastAmmo}&rdquo;
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Status badge */}
                    {call.status === "WAITING" && (
                      <div className="pt-2">
                        <Badge variant="warning">
                          Prospect hasn&apos;t joined yet
                        </Badge>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
