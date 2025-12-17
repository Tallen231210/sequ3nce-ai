"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRouter } from "next/navigation";
import { Phone, Trash2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Id } from "../../../../convex/_generated/dataModel";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(amount);
}

// Talk-to-Listen Ratio Bar Component
function TalkRatioBar({ closerTalkTime, prospectTalkTime }: { closerTalkTime?: number; prospectTalkTime?: number }) {
  const total = (closerTalkTime || 0) + (prospectTalkTime || 0);

  if (total === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const closerPercent = Math.round(((closerTalkTime || 0) / total) * 100);
  const prospectPercent = 100 - closerPercent;

  return (
    <div className="w-24">
      <div className="flex items-center gap-1">
        <div className="flex-1 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-zinc-800 transition-all duration-500"
            style={{ width: `${closerPercent}%` }}
          />
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
        <span>{closerPercent}%</span>
        <span>{prospectPercent}%</span>
      </div>
    </div>
  );
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);
  const nowOnly = new Date(now);
  nowOnly.setHours(0, 0, 0, 0);
  const yesterdayOnly = new Date(yesterday);
  yesterdayOnly.setHours(0, 0, 0, 0);

  if (dateOnly.getTime() === nowOnly.getTime()) {
    return `Today, ${date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })}`;
  } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
    return `Yesterday, ${date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })}`;
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
}

function getOutcomeBadge(outcome?: string) {
  switch (outcome) {
    case "closed":
      return <Badge variant="default">Closed</Badge>;
    case "follow_up":
      return <Badge variant="secondary">Follow Up</Badge>;
    case "not_closed":
      return <Badge variant="secondary">Not Closed</Badge>;
    case "lost":
      return <Badge variant="destructive">Lost</Badge>;
    case "no_show":
      return <Badge variant="outline">No-Show</Badge>;
    case "rescheduled":
      return <Badge variant="secondary">Rescheduled</Badge>;
    default:
      return <Badge variant="outline">Pending</Badge>;
  }
}

function LoadingState() {
  return (
    <div className="p-6">
      <Card>
        <CardContent className="p-0">
          <div className="animate-pulse">
            <div className="h-12 bg-zinc-100 border-b border-zinc-200" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-zinc-50 border-b border-zinc-100" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-6">
      <Card>
        <CardContent className="py-16">
          <div className="flex flex-col items-center justify-center text-center">
            <Phone className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium mb-2">No completed calls yet</h3>
            <p className="text-zinc-500 text-sm max-w-sm">
              When your team completes calls, they&apos;ll appear here with recordings, transcripts, and extracted ammo.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Delete Button Component with confirmation
function DeleteCallButton({
  callId,
  prospectName
}: {
  callId: Id<"calls">;
  prospectName: string;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const deleteCall = useMutation(api.calls.deleteCall);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    setIsDeleting(true);
    try {
      await deleteCall({ callId });
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to delete call:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-red-600 hover:bg-red-50"
          onClick={(e) => {
            e.stopPropagation(); // Prevent row click
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this call?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the call with <strong>{prospectName}</strong>,
            including the recording, transcript, and all extracted data. This action cannot be undone.
            <br /><br />
            <span className="text-amber-600">
              Note: This will also update closer and team statistics.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700"
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete Call"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function CompletedCallsPage() {
  const { team, isLoading: isTeamLoading } = useTeam();
  const router = useRouter();

  const calls = useQuery(
    api.calls.getCompletedCallsWithCloser,
    team?._id ? { teamId: team._id } : "skip"
  );

  if (isTeamLoading || calls === undefined) {
    return (
      <>
        <Header
          title="Completed Calls"
          description="Review past calls, recordings, and outcomes"
        />
        <LoadingState />
      </>
    );
  }

  if (!calls || calls.length === 0) {
    return (
      <>
        <Header
          title="Completed Calls"
          description="Review past calls, recordings, and outcomes"
        />
        <EmptyState />
      </>
    );
  }

  return (
    <>
      <Header
        title="Completed Calls"
        description="Review past calls, recordings, and outcomes"
      />
      <div className="p-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[180px]">Date</TableHead>
                  <TableHead>Closer</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead className="w-[100px]">Duration</TableHead>
                  <TableHead className="w-[120px]">Talk Ratio</TableHead>
                  <TableHead className="w-[120px]">Outcome</TableHead>
                  <TableHead className="w-[140px] text-right">Cash / Contract</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow
                    key={call._id}
                    className="cursor-pointer hover:bg-zinc-50"
                    onClick={() => router.push(`/dashboard/calls/${call._id}`)}
                  >
                    <TableCell className="text-sm text-muted-foreground">
                      {call.startedAt ? formatDate(call.startedAt) : formatDate(call.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-xs">
                            {call.closerInitials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{call.closerName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {call.prospectName || "Unknown Prospect"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {call.duration && call.duration > 0 ? formatDuration(call.duration) : "—"}
                    </TableCell>
                    <TableCell>
                      <TalkRatioBar
                        closerTalkTime={call.closerTalkTime}
                        prospectTalkTime={call.prospectTalkTime}
                      />
                    </TableCell>
                    <TableCell>{getOutcomeBadge(call.outcome)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {call.contractValue ? (
                        <span className="flex flex-col items-end">
                          <span>{formatCurrency(call.cashCollected || 0)} / {formatCurrency(call.contractValue)}</span>
                        </span>
                      ) : call.dealValue ? (
                        formatCurrency(call.dealValue)
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <DeleteCallButton
                        callId={call._id}
                        prospectName={call.prospectName || "Unknown Prospect"}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
