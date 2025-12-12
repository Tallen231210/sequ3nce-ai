"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Clock,
  MessageSquareQuote,
  ChevronDown,
  ChevronUp,
  Radio,
  Mic,
  MicOff,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

// Types
interface TranscriptSegment {
  _id: Id<"transcriptSegments">;
  callId: Id<"calls">;
  teamId: Id<"teams">;
  speaker: string;
  text: string;
  timestamp: number;
  createdAt: number;
}

interface AmmoItem {
  _id: Id<"ammo">;
  callId: Id<"calls">;
  teamId: Id<"teams">;
  text: string;
  type: string;
  timestamp?: number;
  createdAt: number;
}

interface LiveCall {
  _id: Id<"calls">;
  closerId: Id<"closers">;
  teamId: Id<"teams">;
  prospectName?: string;
  status: string;
  startedAt?: number;
  speakerCount: number;
  closerTalkTime?: number;
  prospectTalkTime?: number;
  closerName: string;
  closerInitials: string;
  ammo: AmmoItem[];
  transcriptSegments: TranscriptSegment[];
}

// Utility functions
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getAmmoTypeLabel(type: string): string {
  switch (type) {
    case "emotional":
      return "Emotional";
    case "budget":
      return "Budget";
    case "pain_point":
      return "Pain Point";
    case "urgency":
      return "Urgency";
    case "commitment":
      return "Commitment";
    case "objection_preview":
      return "Objection";
    default:
      return type;
  }
}

function getAmmoTypeBadgeClass(type: string): string {
  switch (type) {
    case "emotional":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "budget":
      return "bg-green-100 text-green-700 border-green-200";
    case "pain_point":
      return "bg-red-100 text-red-700 border-red-200";
    case "urgency":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "commitment":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "objection_preview":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
  }
}

// Talk-to-Listen Ratio Bar Component
interface TalkRatioBarProps {
  closerTalkTime?: number;
  prospectTalkTime?: number;
  compact?: boolean;
}

function TalkRatioBar({ closerTalkTime, prospectTalkTime, compact = false }: TalkRatioBarProps) {
  const total = (closerTalkTime || 0) + (prospectTalkTime || 0);

  if (total === 0) {
    return (
      <div className={cn("text-xs text-muted-foreground", compact && "text-[10px]")}>
        Talk ratio: Waiting for data...
      </div>
    );
  }

  const closerPercent = Math.round(((closerTalkTime || 0) / total) * 100);
  const prospectPercent = 100 - closerPercent;

  return (
    <div className="space-y-1">
      <p className={cn(
        "text-muted-foreground text-center",
        compact ? "text-[10px]" : "text-xs"
      )}>
        Talk-to-Listen Ratio
      </p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-zinc-800 transition-all duration-500"
            style={{ width: `${closerPercent}%` }}
          />
        </div>
      </div>
      <div className={cn(
        "flex justify-between text-muted-foreground",
        compact ? "text-[10px]" : "text-xs"
      )}>
        <span>Closer {closerPercent}%</span>
        <span>Prospect {prospectPercent}%</span>
      </div>
    </div>
  );
}

// Live Transcript Feed Component
interface LiveTranscriptFeedProps {
  segments: TranscriptSegment[];
}

function LiveTranscriptFeed({ segments }: LiveTranscriptFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [prevLength, setPrevLength] = useState(segments.length);

  // Auto-scroll when new segments arrive
  useEffect(() => {
    if (segments.length > prevLength && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    setPrevLength(segments.length);
  }, [segments.length, prevLength]);

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <MicOff className="h-8 w-8 text-zinc-400 mb-2" />
        <p className="text-sm text-muted-foreground">No transcript yet</p>
        <p className="text-xs text-zinc-400">Transcript will appear as the conversation flows</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="max-h-64 overflow-y-auto space-y-2 font-mono text-sm"
    >
      {segments.map((segment, index) => {
        const isCloser = segment.speaker.toLowerCase() === "closer" || segment.speaker === "Speaker 1";
        const isNew = index === segments.length - 1;

        return (
          <div
            key={segment._id}
            className={cn(
              "p-2 rounded transition-all duration-300",
              isCloser ? "bg-zinc-100" : "bg-zinc-50",
              isNew && "animate-fade-in"
            )}
          >
            <div className="flex items-start gap-2">
              <span className="text-[10px] text-zinc-400 min-w-[32px] mt-0.5">
                {formatTimestamp(segment.timestamp)}
              </span>
              <div>
                <span className={cn(
                  "text-xs font-medium",
                  isCloser ? "text-zinc-700" : "text-zinc-500"
                )}>
                  {isCloser ? "Closer" : "Prospect"}:
                </span>
                <p className="text-zinc-600 mt-0.5">{segment.text}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Ammo Feed Component
interface AmmoFeedProps {
  ammo: AmmoItem[];
}

function AmmoFeed({ ammo }: AmmoFeedProps) {
  if (ammo.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <MessageSquareQuote className="h-8 w-8 text-zinc-400 mb-2" />
        <p className="text-sm text-muted-foreground">No ammo extracted yet</p>
        <p className="text-xs text-zinc-400">Key moments will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-48 overflow-y-auto">
      {ammo.map((item, index) => {
        const isNew = index === 0;

        return (
          <div
            key={item._id}
            className={cn(
              "p-3 rounded-lg border bg-white transition-all duration-300",
              isNew && "ring-2 ring-zinc-300 animate-fade-in"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-zinc-700 italic line-clamp-2">
                &ldquo;{item.text}&rdquo;
              </p>
              <Badge
                variant="outline"
                className={cn("text-[10px] shrink-0", getAmmoTypeBadgeClass(item.type))}
              >
                {getAmmoTypeLabel(item.type)}
              </Badge>
            </div>
            {item.timestamp !== undefined && (
              <span className="text-[10px] text-zinc-400 mt-1 block">
                {formatTimestamp(item.timestamp)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Live Call Card Component
interface LiveCallCardProps {
  call: LiveCall;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function LiveCallCard({ call, isExpanded, onToggleExpand }: LiveCallCardProps) {
  const [elapsed, setElapsed] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    if (!call.startedAt) return;

    const updateElapsed = () => {
      setElapsed(Math.floor((Date.now() - call.startedAt!) / 1000));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [call.startedAt]);

  const isOnCall = call.status === "on_call";
  const latestAmmo = call.ammo[0];
  const ammoCount = call.ammo.length;

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all duration-300",
        isExpanded && "col-span-full lg:col-span-2"
      )}
    >
      <CardContent className="p-0">
        {/* Header with status */}
        <div
          className="flex items-center justify-between border-b border-border px-4 py-3 cursor-pointer hover:bg-zinc-50 transition-colors"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                isOnCall ? "bg-black animate-pulse" : "bg-zinc-400"
              )}
            />
            <span className="text-sm font-medium">
              {isOnCall ? "On Call" : "Waiting"}
            </span>
            {isOnCall && (
              <Radio className="h-3 w-3 text-zinc-500 animate-pulse" />
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3 w-3" strokeWidth={1.5} />
              {formatDuration(elapsed)}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
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
                with {call.prospectName || "Unknown Prospect"}
              </p>
            </div>
          </div>

          {/* Talk-to-Listen Ratio (only when on call) */}
          {isOnCall && (
            <TalkRatioBar
              closerTalkTime={call.closerTalkTime}
              prospectTalkTime={call.prospectTalkTime}
              compact={!isExpanded}
            />
          )}

          {/* Collapsed View - Latest Ammo */}
          {!isExpanded && (
            <>
              {latestAmmo ? (
                <div className="rounded-md bg-zinc-50 p-3">
                  <div className="flex items-start gap-2">
                    <MessageSquareQuote
                      className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0"
                      strokeWidth={1.5}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm italic text-muted-foreground line-clamp-2">
                        &ldquo;{latestAmmo.text}&rdquo;
                      </p>
                      {ammoCount > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpand();
                          }}
                          className="text-xs text-zinc-500 hover:text-zinc-700 mt-1 flex items-center gap-1"
                        >
                          View {ammoCount - 1} more ammo items →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-zinc-50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    No ammo extracted yet
                  </p>
                </div>
              )}

              {/* Status badge */}
              {!isOnCall && (
                <div className="pt-2">
                  <Badge variant="outline" className="text-zinc-500 border-zinc-300">
                    Prospect hasn&apos;t joined yet
                  </Badge>
                </div>
              )}
            </>
          )}

          {/* Expanded View */}
          {isExpanded && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              {/* Live Transcript */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Mic className="h-4 w-4" />
                  Live Transcript
                </h4>
                <div className="border rounded-lg p-3 bg-zinc-50">
                  <LiveTranscriptFeed segments={call.transcriptSegments} />
                </div>
              </div>

              {/* Ammo Feed */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <MessageSquareQuote className="h-4 w-4" />
                  Ammo ({ammoCount})
                </h4>
                <div className="border rounded-lg p-3 bg-zinc-50">
                  <AmmoFeed ammo={call.ammo} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Expand/Collapse footer for expanded view */}
        {isExpanded && (
          <div
            className="border-t border-border px-4 py-2 text-center cursor-pointer hover:bg-zinc-50 transition-colors"
            onClick={onToggleExpand}
          >
            <span className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <ChevronUp className="h-3 w-3" />
              Collapse
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Loading State
function LoadingState() {
  return (
    <div className="p-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-0">
              <div className="animate-pulse">
                <div className="h-12 bg-zinc-100 border-b" />
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-zinc-100" />
                    <div className="space-y-2">
                      <div className="h-4 w-24 bg-zinc-100 rounded" />
                      <div className="h-3 w-32 bg-zinc-100 rounded" />
                    </div>
                  </div>
                  <div className="h-16 bg-zinc-100 rounded" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Empty State
function EmptyState() {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <Radio className="h-12 w-12 mx-auto text-zinc-400 mb-4" />
        <p className="text-muted-foreground">No live calls at the moment</p>
        <p className="text-sm text-muted-foreground mt-1">
          Calls will appear here when closers start recording
        </p>
      </CardContent>
    </Card>
  );
}

// Main Page Component
export default function LiveCallsPage() {
  const { team, isLoading: isTeamLoading } = useTeam();
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  const liveCalls = useQuery(
    api.calls.getLiveCallsWithDetails,
    team?._id ? { teamId: team._id } : "skip"
  ) as LiveCall[] | undefined;

  const handleToggleExpand = useCallback((callId: string) => {
    setExpandedCallId((current) => (current === callId ? null : callId));
  }, []);

  if (isTeamLoading || liveCalls === undefined) {
    return (
      <>
        <Header
          title="Live Calls"
          description="Monitor all active calls in real-time"
        />
        <LoadingState />
      </>
    );
  }

  return (
    <>
      <Header
        title="Live Calls"
        description="Monitor all active calls in real-time"
      />
      <div className="p-6">
        {liveCalls.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {liveCalls.map((call) => (
              <LiveCallCard
                key={call._id}
                call={call}
                isExpanded={expandedCallId === call._id}
                onToggleExpand={() => handleToggleExpand(call._id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
